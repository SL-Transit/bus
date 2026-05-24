package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class GpsService extends Service {
    static final String ACTION_START = "com.sanamchai.drivergps.START";
    static final String ACTION_STOP = "com.sanamchai.drivergps.STOP";
    private static final String CHANNEL_ID = "gps_sender";
    private static final String DB_URL = "https://bus-line1-ba0ea-default-rtdb.asia-southeast1.firebasedatabase.app";

    private SharedPreferences prefs;
    private LocationManager locationManager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running = false;

    private final Runnable periodicSend = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (shouldStopNow()) {
                stopTracking();
                return;
            }
            sendLatest();
            handler.postDelayed(this, 5000);
        }
    };

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location location) {
            latestLocation = location;
            sendLatest();
            updateNotification(location);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            return START_NOT_STICKY;
        }
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        if (running) return;
        running = true;
        prefs.edit().putBoolean(MainActivity.KEY_ENABLED, true).apply();
        startForeground(1, buildNotification("กำลังเริ่มส่ง GPS..."));
        if (!hasLocationPermission()) {
            updateNotificationText("ยังไม่ได้อนุญาตตำแหน่ง");
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000, 3, listener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 10, listener);
            Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last == null) last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (last != null) {
                latestLocation = last;
                sendLatest();
            }
        } catch (SecurityException ignored) {}
        handler.removeCallbacks(periodicSend);
        handler.post(periodicSend);
    }

    private void stopTracking() {
        running = false;
        prefs.edit().putBoolean(MainActivity.KEY_ENABLED, false).apply();
        handler.removeCallbacks(periodicSend);
        try { locationManager.removeUpdates(listener); } catch (Exception ignored) {}
        markOffline();
        stopForeground(true);
        stopSelf();
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean shouldStopNow() {
        int h = prefs.getInt(MainActivity.KEY_STOP_HOUR, 18);
        int m = prefs.getInt(MainActivity.KEY_STOP_MINUTE, 0);
        java.util.Calendar now = java.util.Calendar.getInstance();
        int nowMin = now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE);
        int stopMin = h * 60 + m;
        return nowMin >= stopMin;
    }

    private void sendLatest() {
        if (latestLocation == null) return;
        final Location loc = latestLocation;
        final int car = prefs.getInt(MainActivity.KEY_CAR, 1);
        final String direction = prefs.getString(MainActivity.KEY_DIRECTION, "go");
        final String json = buildJson(loc, car, direction, true);
        new Thread(() -> putJson("/bus/car" + car + ".json", json)).start();
    }

    private void markOffline() {
        int car = prefs.getInt(MainActivity.KEY_CAR, 1);
        String json = "{\"online\":false,\"ts\":" + System.currentTimeMillis() + "}";
        new Thread(() -> patchJson("/bus/car" + car + ".json", json)).start();
    }

    private String buildJson(Location loc, int car, String direction, boolean online) {
        Integer speedKmh = loc.hasSpeed() ? Math.round(loc.getSpeed() * 3.6f) : null;
        Float heading = loc.hasBearing() ? loc.getBearing() : null;
        int stopIdx = nearestStopIndex(loc.getLatitude(), loc.getLongitude(), direction);
        String status = speedKmh != null && speedKmh < 3 ? "at" : "towards";
        return "{" +
                "\"lat\":" + loc.getLatitude() + "," +
                "\"lng\":" + loc.getLongitude() + "," +
                "\"lon\":" + loc.getLongitude() + "," +
                "\"acc\":" + Math.round(loc.getAccuracy()) + "," +
                "\"speed\":" + (speedKmh == null ? "null" : speedKmh) + "," +
                "\"heading\":" + (heading == null ? "null" : heading) + "," +
                "\"direction\":\"" + direction + "\"," +
                "\"queue\":" + car + "," +
                "\"stopIdx\":" + stopIdx + "," +
                "\"status\":\"" + status + "\"," +
                "\"online\":" + online + "," +
                "\"source\":\"android-apk\"," +
                "\"ts\":" + System.currentTimeMillis() +
                "}";
    }

    private int nearestStopIndex(double lat, double lng, String direction) {
        double[][] stops = "back".equals(direction) ? STOPS_BACK : STOPS_GO;
        int best = 0;
        double bestDist = Double.MAX_VALUE;
        for (int i = 0; i < stops.length; i++) {
            double d = distanceMeters(lat, lng, stops[i][0], stops[i][1]);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void putJson(String path, String json) {
        send("PUT", path, json);
    }

    private void patchJson(String path, String json) {
        send("PATCH", path, json);
    }

    private void send(String method, String path, String json) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(DB_URL + path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setDoOutput(true);
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.close();
            conn.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "ส่ง GPS รถ", NotificationManager.IMPORTANCE_LOW);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setContentTitle("กำลังส่ง GPS รถโดยสาร")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(Location loc) {
        updateNotificationText(String.format(Locale.US, "%.5f, %.5f", loc.getLatitude(), loc.getLongitude()));
    }

    private void updateNotificationText(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(1, buildNotification(text));
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    private static final double[][] STOPS_GO = {
            {13.510000, 101.100000}, {13.530000, 101.160000}, {13.549000, 101.215000},
            {13.565000, 101.270000}, {13.580000, 101.310000}, {13.600000, 101.380000},
            {13.620000, 101.460000}, {13.659022, 101.437482}, {13.745082, 101.355993},
            {13.692477, 101.054105}
    };
    private static final double[][] STOPS_BACK = {
            {13.692477, 101.054105}, {13.745259, 101.356835}, {13.659022, 101.437482}
    };
}

package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
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

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class GpsService extends Service {
    static final String ACTION_START = "com.sanamchai.drivergps.START";
    static final String ACTION_STOP = "com.sanamchai.drivergps.STOP";

    private static final String CHANNEL_ID = "gps_sender";
    private static final String DB_URL = "https://bus-line1-ba0ea-default-rtdb.asia-southeast1.firebasedatabase.app";

    private SharedPreferences prefs;
    private LocationManager locationManager;
    private DatabaseReference busRef;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running = false;

    private final Runnable periodicSend = new Runnable() {
        @Override public void run() {
            if (!running) return;
            sendLatest();
            handler.postDelayed(this, 20000);
        }
    };

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location location) {
            latestLocation = location;
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        initFirebase();
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

    private void initFirebase() {
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey("AIzaSyD3HmQyRJfpw931mr_6eL19xzFk2bbqfVI")
                    .setApplicationId("1:511401517598:web:5605ee3777619dffe1c40f")
                    .setDatabaseUrl(DB_URL)
                    .setProjectId("bus-line1-ba0ea")
                    .build();
            FirebaseApp.initializeApp(this, options);
        }
        busRef = FirebaseDatabase.getInstance(DB_URL).getReference("bus/car1");
    }

    private void startTracking() {
        if (running) return;
        running = true;
        prefs.edit().putBoolean(MainActivity.KEY_ENABLED, true).apply();
        startForeground(1, buildNotification("กำลังหาตำแหน่ง..."));
        if (!hasLocationPermission()) {
            updateNotification("ยังไม่ได้อนุญาตตำแหน่ง");
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 0, listener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000, 0, listener);
            Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last == null) last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            latestLocation = last;
        } catch (SecurityException ignored) {}
        handler.removeCallbacks(periodicSend);
        handler.post(periodicSend);
    }

    private void stopTracking() {
        running = false;
        prefs.edit().putBoolean(MainActivity.KEY_ENABLED, false).apply();
        handler.removeCallbacks(periodicSend);
        try { locationManager.removeUpdates(listener); } catch (Exception ignored) {}
        if (busRef != null) {
            Map<String, Object> offline = new HashMap<>();
            offline.put("online", false);
            offline.put("ts", System.currentTimeMillis());
            busRef.updateChildren(offline);
        }
        stopForeground(true);
        stopSelf();
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void sendLatest() {
        if (latestLocation == null || busRef == null) {
            updateNotification("รอสัญญาณ GPS...");
            return;
        }
        Location loc = latestLocation;
        Integer speedKmh = loc.hasSpeed() ? Math.round(loc.getSpeed() * 3.6f) : null;
        Map<String, Object> data = new HashMap<>();
        data.put("lat", loc.getLatitude());
        data.put("lng", loc.getLongitude());
        data.put("lon", loc.getLongitude());
        data.put("acc", Math.round(loc.getAccuracy()));
        data.put("speed", speedKmh);
        data.put("heading", loc.hasBearing() ? loc.getBearing() : null);
        data.put("direction", "go");
        data.put("queue", 1);
        data.put("stopIdx", nearestStopIndex(loc.getLatitude(), loc.getLongitude()));
        data.put("status", speedKmh != null && speedKmh < 3 ? "at" : "towards");
        data.put("online", true);
        data.put("source", "android-apk");
        data.put("ts", System.currentTimeMillis());
        busRef.setValue(data);
        updateNotification(String.format(Locale.US, "%.5f, %.5f", loc.getLatitude(), loc.getLongitude()));
    }

    private int nearestStopIndex(double lat, double lng) {
        int best = 0;
        double bestDist = Double.MAX_VALUE;
        for (int i = 0; i < STOPS_GO.length; i++) {
            double d = distanceMeters(lat, lng, STOPS_GO[i][0], STOPS_GO[i][1]);
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

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "ส่ง GPS รถ", NotificationManager.IMPORTANCE_LOW);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setContentTitle("GPS Transit กำลังส่งตำแหน่ง")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
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
}

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
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class GpsService extends Service {
    static final String ACTION_START = "com.sanamchai.drivergps.START";
    static final String ACTION_STOP = "com.sanamchai.drivergps.STOP";

    private static final String CHANNEL_ID = "gps_sender";
    private static final String DB_URL = "https://bus-line1-ba0ea-default-rtdb.asia-southeast1.firebasedatabase.app";
    private static final long SEND_INTERVAL_MS = 10000;
    private static final float MAX_ACCURATE_METERS = 100f;
    private static boolean persistenceConfigured = false;

    private SharedPreferences prefs;
    private LocationManager locationManager;
    private FirebaseAuth auth;
    private DatabaseReference busRef;
    private DatabaseReference liveVehicleRef;
    private DatabaseReference connectedRef;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running = false;
    private boolean reportingError = false;
    private long lastLocationSentAt = 0;
    private String gpsErrorMessage = null;
    private Map<String, Object> pendingData = null;
    private Location pendingLocation = null;
    private String queueId = "car1"; // default fallback

    // ===== Kalman Filter =====
    private static final float KALMAN_Q = 3f;   // process noise (ยิ่งมาก = ไว้ใจ GPS มากขึ้น)
    private static final float KALMAN_R = 10f;  // measurement noise (ยิ่งมาก = กรองแรงขึ้น)
    private double kfLat = 0, kfLng = 0;
    private float kfAccuracy = 0;
    private long kfTimestamp = 0;
    private boolean kfInitialized = false;

    // กรองตำแหน่งด้วย Kalman Filter + Speed Check
    private Location filterLocation(Location raw) {
        if (raw == null) return null;

        // ตัดค่าที่ accuracy แย่มาก
        if (raw.hasAccuracy() && raw.getAccuracy() > 80f) return null;

        if (!kfInitialized) {
            kfLat = raw.getLatitude();
            kfLng = raw.getLongitude();
            kfAccuracy = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
            kfTimestamp = raw.getTime();
            kfInitialized = true;
            return raw;
        }

        // ตรวจสอบความเร็วผิดปกติ (> 150 กม./ชม. = น่าสงสัย)
        if (kfTimestamp > 0) {
            double dtSec = (raw.getTime() - kfTimestamp) / 1000.0;
            if (dtSec > 0) {
                double dLat = raw.getLatitude() - kfLat;
                double dLng = raw.getLongitude() - kfLng;
                double distM = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
                double speedMs = distM / dtSec;
                if (speedMs > 42f) { // 42 m/s = ~150 km/h
                    return null; // กรองทิ้ง
                }
            }
        }

        // Kalman Update
        float dt = kfTimestamp > 0 ? (raw.getTime() - kfTimestamp) / 1000f : 1f;
        float predicted = kfAccuracy + KALMAN_Q * Math.max(dt, 1f);
        float rawAcc = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
        float gain = predicted / (predicted + KALMAN_R + rawAcc);

        kfLat += gain * (raw.getLatitude() - kfLat);
        kfLng += gain * (raw.getLongitude() - kfLng);
        kfAccuracy = (1 - gain) * predicted;
        kfTimestamp = raw.getTime();

        // สร้าง Location object ที่กรองแล้ว
        Location filtered = new Location(raw);
        filtered.setLatitude(kfLat);
        filtered.setLongitude(kfLng);
        filtered.setAccuracy(kfAccuracy);
        return filtered;
    }

    private final Runnable heartbeatTick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            sendHeartbeat();
            handler.postDelayed(this, SEND_INTERVAL_MS);
        }
    };

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location location) {
            Location filtered = filterLocation(location);
            if (filtered == null) return; // กรองทิ้ง
            latestLocation = filtered;
            saveCoords(filtered);
            sendLocationUpdate(filtered);
        }

        @Override public void onProviderDisabled(String provider) {
            recordError("GPS provider disabled: " + provider);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createChannel();
    }

    private void initFirebase() {
        // อ่าน vehicle ID จาก SharedPreferences ทุกครั้งที่ start
        queueId = prefs.getString(MainActivity.KEY_VEHICLE_ID, "car1");

        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey("AIzaSyD3HmQyRJfpw931mr_6eL19xzFk2bbqfVI")
                    .setApplicationId("1:511401517598:web:5605ee3777619dffe1c40f")
                    .setDatabaseUrl(DB_URL)
                    .setProjectId("bus-line1-ba0ea")
                    .build();
            FirebaseApp.initializeApp(this, options);
        }
        auth = FirebaseAuth.getInstance();
        FirebaseDatabase db = FirebaseDatabase.getInstance();
        if (!persistenceConfigured) {
            try {
                db.setPersistenceEnabled(true);
            } catch (Exception ignored) {}
            persistenceConfigured = true;
        }
        busRef = db.getReference("bus/" + queueId);
        liveVehicleRef = db.getReference("liveVehicles/" + queueId);
        connectedRef = db.getReference(".info/connected");
        busRef.keepSynced(true);
        liveVehicleRef.keepSynced(true);
        watchConnectionState();
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
        // init Firebase ใหม่ทุกครั้งเพื่อให้ได้ queueId ล่าสุด
        initFirebase();

        if (running) {
            setupDisconnectHandlers();
            sendHeartbeat();
            handler.removeCallbacks(heartbeatTick);
            handler.postDelayed(heartbeatTick, SEND_INTERVAL_MS);
            return;
        }
        running = true;
        gpsErrorMessage = null;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, true)
                .putString(MainActivity.KEY_LAST_STATUS, "online / locating")
                .putString(MainActivity.KEY_LAST_ERROR, "")
                .apply();
        startForeground(1, buildNotification("Locating GPS... [" + queueId + "]"));
        setupDisconnectHandlers();
        sendHeartbeat();
        handler.removeCallbacks(heartbeatTick);
        handler.postDelayed(heartbeatTick, SEND_INTERVAL_MS);
        if (!hasLocationPermission()) {
            recordError("Location permission is not granted");
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, SEND_INTERVAL_MS, 0, listener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000, 0, listener);
        } catch (SecurityException e) {
            recordError(e.getMessage());
        }
    }

    private void stopTracking() {
        running = false;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, false)
                .putString(MainActivity.KEY_LAST_STATUS, "stopped")
                .apply();
        handler.removeCallbacks(heartbeatTick);
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

    private void sendHeartbeat() {
        if (gpsErrorMessage != null && latestLocation == null) {
            writeData(buildStatusData(null, true, "gps_error", gpsErrorMessage), null);
            return;
        }
        if (latestLocation == null) {
            recordStatus("online / locating");
            updateNotification("Waiting for GPS... [" + queueId + "]");
            writeData(buildStatusData(null, true, "locating", null), null);
            return;
        }
        writeData(buildData(latestLocation, true), latestLocation);
    }

    private void sendLocationUpdate(Location loc) {
        if (!running || loc == null) return;
        gpsErrorMessage = null;
        long now = System.currentTimeMillis();
        if (now - lastLocationSentAt < SEND_INTERVAL_MS) return;
        lastLocationSentAt = now;
        writeData(buildData(loc, true), loc);
    }

    private void watchConnectionState() {
        connectedRef.addValueEventListener(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snapshot) {
                Boolean connected = snapshot.getValue(Boolean.class);
                if (!Boolean.TRUE.equals(connected) || !running) return;
                setupDisconnectHandlers();
                if (pendingData != null) {
                    writeData(pendingData, pendingLocation);
                } else {
                    lastLocationSentAt = 0;
                    sendHeartbeat();
                }
            }

            @Override public void onCancelled(DatabaseError error) {
                recordError("Firebase connection: " + error.getMessage());
            }
        });
    }

    private void writeData(Map<String, Object> data, Location loc) {
        pendingData = new HashMap<>(data);
        pendingLocation = loc;
        if (auth.getCurrentUser() != null) {
            writeAuthedData(data, loc);
            return;
        }
        auth.signInAnonymously()
                .addOnSuccessListener(result -> writeAuthedData(data, loc))
                .addOnFailureListener(e -> {
                    if ("gps_error".equals(String.valueOf(data.get("status")))) {
                        updateNotification("Firebase Auth: " + e.getMessage());
                        return;
                    }
                    writeAuthedData(data, loc);
                    recordError("Firebase Auth: " + e.getMessage());
                });
    }

    private void writeAuthedData(Map<String, Object> data, Location loc) {
        busRef.setValue(data, (DatabaseError error, DatabaseReference ref) -> {
            if (error != null) {
                if ("gps_error".equals(String.valueOf(data.get("status")))) {
                    updateNotification("Firebase error: " + error.getMessage());
                    return;
                }
                recordError("Firebase " + error.getCode() + ": " + error.getMessage());
                return;
            }
            prefs.edit()
                    .putLong(MainActivity.KEY_LAST_SENT, System.currentTimeMillis())
                    .putString(MainActivity.KEY_LAST_STATUS, loc == null ? String.valueOf(data.get("status")) : "sent")
                    .putString(MainActivity.KEY_LAST_ERROR, "")
                    .apply();
            pendingData = null;
            pendingLocation = null;
            if (loc == null) updateNotification(String.valueOf(data.get("status")));
            else updateNotification(String.format(Locale.US, "[%s] %.5f, %.5f", queueId, loc.getLatitude(), loc.getLongitude()));
        });
        liveVehicleRef.setValue(data, (DatabaseError error, DatabaseReference ref) -> {
            if (error != null) {
                prefs.edit().putString(MainActivity.KEY_LAST_ERROR,
                        "liveVehicles optional: " + error.getMessage()).apply();
            }
        });
    }

    private void markOffline() {
        long now = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();
        data.put("online", false);
        data.put("status", "offline");
        data.put("appUpdatedAt", now);
        data.put("ts", now);
        writeData(data, null);
    }

    private void setupDisconnectHandlers() {
        long now = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();
        data.put("online", false);
        data.put("status", "offline");
        data.put("appUpdatedAt", now);
        data.put("ts", now);
        busRef.onDisconnect().updateChildren(data);
        try {
            liveVehicleRef.onDisconnect().updateChildren(data);
        } catch (Exception ignored) {}
    }

    private Map<String, Object> buildData(Location loc, boolean online) {
        boolean accurate = !loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS;
        return buildStatusData(loc, online, accurate ? "moving" : "low_accuracy", null);
    }

    private Map<String, Object> buildStatusData(Location loc, boolean online, String status, String errorMessage) {
        long now = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();
        if (loc != null && (!loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS)) {
            Integer speedKmh = loc.hasSpeed() ? Math.round(loc.getSpeed() * 3.6f) : null;
            Float heading = loc.hasBearing() ? loc.getBearing() : null;
            data.put("lat", loc.getLatitude());
            data.put("lng", loc.getLongitude());
            data.put("lon", loc.getLongitude());
            data.put("speed", speedKmh);
            data.put("heading", heading);
            data.put("stopIdx", nearestStopIndex(loc.getLatitude(), loc.getLongitude()));
        }
        if (loc != null && loc.hasAccuracy()) {
            data.put("accuracy", Math.round(loc.getAccuracy()));
            data.put("acc", Math.round(loc.getAccuracy()));
            data.put("locationUpdatedAt", now);
        }
        data.put("direction", "go");
        data.put("queue", 1);
        data.put("queueId", queueId);   // ใช้ค่าที่อ่านจาก prefs แทน hardcode
        data.put("status", status);
        data.put("online", online);
        data.put("source", "gps-transit-apk");
        data.put("appUpdatedAt", now);
        data.put("ts", now);
        if (errorMessage != null) data.put("errorMessage", errorMessage);
        return data;
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

    private void saveCoords(Location loc) {
        prefs.edit().putString(MainActivity.KEY_LAST_COORDS,
                String.format(Locale.US, "%.6f, %.6f", loc.getLatitude(), loc.getLongitude())).apply();
    }

    private void recordStatus(String status) {
        prefs.edit().putString(MainActivity.KEY_LAST_STATUS, status).apply();
    }

    private void recordError(String error) {
        gpsErrorMessage = error == null ? "unknown" : error;
        if (!reportingError) {
            reportingError = true;
            writeData(buildStatusData(null, true, "gps_error", error == null ? "unknown" : error), null);
            reportingError = false;
        }
        prefs.edit()
                .putString(MainActivity.KEY_LAST_STATUS, "gps_error")
                .putString(MainActivity.KEY_LAST_ERROR, error == null ? "unknown" : error)
                .apply();
        updateNotification("GPS error: " + (error == null ? "unknown" : error));
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "GPS Transit", NotificationManager.IMPORTANCE_LOW);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setContentTitle("GPS Transit [" + queueId + "]")
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
            {13.453565, 102.299330}, {13.436666, 102.200895}, {13.439877, 102.083043},
            {13.416310, 102.020767}, {13.420494, 101.995365}, {13.420264, 101.765445},
            {13.381579, 101.708016}, {13.443342, 101.610222}, {13.659022, 101.437482},
            {13.745082, 101.355993}, {13.692477, 101.054105}
    };
    }


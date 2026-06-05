package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

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
    static final String ACTION_STOP  = "com.sanamchai.drivergps.STOP";

    private static final String CHANNEL_ID       = "gps_sender";
    private static final String DB_URL           = "https://bus-line1-ba0ea-default-rtdb.asia-southeast1.firebasedatabase.app";
    private static final long   SEND_INTERVAL_MS = 10000;
    private static final float  MAX_ACCURATE_METERS = 80f;
    private static boolean persistenceConfigured = false;

    private SharedPreferences prefs;
    private FirebaseAuth auth;
    private DatabaseReference busRef, liveVehicleRef, connectedRef;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running = false;
    private boolean reportingError = false;
    private long lastLocationSentAt = 0;
    private String gpsErrorMessage = null;
    private Map<String, Object> pendingData = null;
    private Location pendingLocation = null;
    private String queueId = "car1";

    // ===== FusedLocationProvider (เหมือน Grab/Bolt/Google Maps) =====
    private FusedLocationProviderClient fusedClient;
    private LocationCallback fusedCallback;

    // ===== Wake Lock =====
    private PowerManager.WakeLock wakeLock;

    // ===== Kalman Filter =====
    private static final float KALMAN_Q = 3f;
    private static final float KALMAN_R = 10f;
    private double kfLat, kfLng;
    private float  kfAccuracy;
    private long   kfTimestamp;
    private boolean kfInitialized = false;

    private Location filterLocation(Location raw) {
        if (raw == null) return null;
        if (raw.hasAccuracy() && raw.getAccuracy() > MAX_ACCURATE_METERS) return null;
        if (!kfInitialized) {
            kfLat = raw.getLatitude(); kfLng = raw.getLongitude();
            kfAccuracy = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
            kfTimestamp = raw.getTime(); kfInitialized = true;
            return raw;
        }
        if (kfTimestamp > 0) {
            double dtSec = (raw.getTime() - kfTimestamp) / 1000.0;
            if (dtSec > 0) {
                double distM = Math.sqrt(Math.pow(raw.getLatitude() - kfLat, 2)
                        + Math.pow(raw.getLongitude() - kfLng, 2)) * 111000;
                if (distM / dtSec > 42f) return null;
            }
        }
        float dt        = kfTimestamp > 0 ? (raw.getTime() - kfTimestamp) / 1000f : 1f;
        float predicted = kfAccuracy + KALMAN_Q * Math.max(dt, 1f);
        float rawAcc    = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
        float gain      = predicted / (predicted + KALMAN_R + rawAcc);
        kfLat      += gain * (raw.getLatitude()  - kfLat);
        kfLng      += gain * (raw.getLongitude() - kfLng);
        kfAccuracy  = (1 - gain) * predicted;
        kfTimestamp = raw.getTime();
        Location f = new Location(raw);
        f.setLatitude(kfLat); f.setLongitude(kfLng); f.setAccuracy(kfAccuracy);
        return f;
    }

    private final Runnable heartbeatTick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            sendHeartbeat();
            handler.postDelayed(this, SEND_INTERVAL_MS);
        }
    };

    // ===== Wake Lock helpers =====
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GPSTransit::WakeLock");
            wakeLock.acquire();
        } catch (Exception ignored) {}
    }
    private void releaseWakeLock() {
        try { if (wakeLock != null && wakeLock.isHeld()) { wakeLock.release(); wakeLock = null; } }
        catch (Exception ignored) {}
    }

    @Override public void onCreate() {
        super.onCreate();
        prefs       = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        createChannel();
    }

    private void initFirebase() {
        queueId = prefs.getString(MainActivity.KEY_VEHICLE_ID, "car1");
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions opts = new FirebaseOptions.Builder()
                    .setApiKey("AIzaSyD3HmQyRJfpw931mr_6eL19xzFk2bbqfVI")
                    .setApplicationId("1:511401517598:web:5605ee3777619dffe1c40f")
                    .setDatabaseUrl(DB_URL)
                    .setProjectId("bus-line1-ba0ea")
                    .build();
            FirebaseApp.initializeApp(this, opts);
        }
        auth = FirebaseAuth.getInstance();
        FirebaseDatabase db = FirebaseDatabase.getInstance();
        if (!persistenceConfigured) {
            try { db.setPersistenceEnabled(true); } catch (Exception ignored) {}
            persistenceConfigured = true;
        }
        busRef         = db.getReference("bus/"          + queueId);
        liveVehicleRef = db.getReference("liveVehicles/" + queueId);
        connectedRef   = db.getReference(".info/connected");
        busRef.keepSynced(true);
        liveVehicleRef.keepSynced(true);
        watchConnectionState();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { stopTracking(); return START_NOT_STICKY; }
        startTracking();
        return START_STICKY; // Android restart อัตโนมัติถ้าถูก kill
    }

    private void startTracking() {
        initFirebase();
        acquireWakeLock();

        if (running) {
            setupDisconnectHandlers(); sendHeartbeat();
            handler.removeCallbacks(heartbeatTick);
            handler.postDelayed(heartbeatTick, SEND_INTERVAL_MS);
            return;
        }
        running = true; gpsErrorMessage = null;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, true)
                .putString(MainActivity.KEY_LAST_STATUS, "online / locating")
                .putString(MainActivity.KEY_LAST_ERROR, "")
                .apply();

        // Foreground notification พร้อม tap เพื่อเปิดแอป
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openApp,
                Build.VERSION.SDK_INT >= 23
                        ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        : PendingIntent.FLAG_UPDATE_CURRENT);

        Notification n = buildNotification("กำลังหาสัญญาณ GPS... [" + queueId + "]", pi);
        if (Build.VERSION.SDK_INT >= 29) {
            try { startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION); }
            catch (Exception e) { startForeground(1, n); }
        } else {
            startForeground(1, n);
        }

        setupDisconnectHandlers(); sendHeartbeat();
        handler.removeCallbacks(heartbeatTick);
        handler.postDelayed(heartbeatTick, SEND_INTERVAL_MS);
        startFusedLocationUpdates();
    }

    // ===== FusedLocationProvider — เหมือน Grab/Bolt =====
    private void startFusedLocationUpdates() {
        if (!hasLocationPermission()) { recordError("Location permission not granted"); return; }
        fusedCallback = new LocationCallback() {
            @Override public void onLocationResult(LocationResult result) {
                if (result == null) return;
                for (Location loc : result.getLocations()) {
                    Location filtered = filterLocation(loc);
                    if (filtered == null) continue;
                    latestLocation = filtered;
                    saveCoords(filtered);
                    sendLocationUpdate(filtered);
                }
            }
        };
        try {
            LocationRequest req = new LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY, SEND_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(SEND_INTERVAL_MS / 2)
                    .setMinUpdateDistanceMeters(3f) // อัพเดทถ้าเคลื่อนที่ > 3 เมตร
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(req, fusedCallback,
                    Looper.getMainLooper());
        } catch (SecurityException e) {
            recordError("Location permission denied: " + e.getMessage());
        }
    }

    private void stopFusedLocationUpdates() {
        if (fusedClient != null && fusedCallback != null) {
            fusedClient.removeLocationUpdates(fusedCallback);
            fusedCallback = null;
        }
    }

    private void stopTracking() {
        running = false;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, false)
                .putString(MainActivity.KEY_LAST_STATUS, "stopped")
                .apply();
        handler.removeCallbacks(heartbeatTick);
        stopFusedLocationUpdates();
        markOffline();
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void sendHeartbeat() {
        if (gpsErrorMessage != null && latestLocation == null) {
            writeData(buildStatusData(null, true, "gps_error", gpsErrorMessage), null); return;
        }
        if (latestLocation == null) {
            recordStatus("online / locating");
            updateNotification("รอสัญญาณ GPS... [" + queueId + "]");
            writeData(buildStatusData(null, true, "locating", null), null); return;
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
                if (pendingData != null) writeData(pendingData, pendingLocation);
                else { lastLocationSentAt = 0; sendHeartbeat(); }
            }
            @Override public void onCancelled(DatabaseError error) {
                recordError("Firebase connection: " + error.getMessage());
            }
        });
    }

    private void writeData(Map<String, Object> data, Location loc) {
        pendingData = new HashMap<>(data); pendingLocation = loc;
        if (auth.getCurrentUser() != null) { writeAuthedData(data, loc); return; }
        auth.signInAnonymously()
                .addOnSuccessListener(r -> writeAuthedData(data, loc))
                .addOnFailureListener(e -> {
                    if ("gps_error".equals(String.valueOf(data.get("status")))) {
                        updateNotification("Firebase Auth: " + e.getMessage()); return;
                    }
                    writeAuthedData(data, loc);
                    recordError("Firebase Auth: " + e.getMessage());
                });
    }

    private void writeAuthedData(Map<String, Object> data, Location loc) {
        busRef.setValue(data, (err, ref) -> {
            if (err != null) {
                if (!"gps_error".equals(String.valueOf(data.get("status"))))
                    recordError("Firebase " + err.getCode() + ": " + err.getMessage());
                return;
            }
            prefs.edit()
                    .putLong(MainActivity.KEY_LAST_SENT, System.currentTimeMillis())
                    .putString(MainActivity.KEY_LAST_STATUS, loc == null ? String.valueOf(data.get("status")) : "sent")
                    .putString(MainActivity.KEY_LAST_ERROR, "").apply();
            pendingData = null; pendingLocation = null;
            if (loc == null) updateNotification(String.valueOf(data.get("status")));
            else updateNotification(String.format(Locale.US, "[%s] %.5f, %.5f",
                    queueId, loc.getLatitude(), loc.getLongitude()));
        });
        liveVehicleRef.setValue(data, (err, ref) -> {
            if (err != null)
                prefs.edit().putString(MainActivity.KEY_LAST_ERROR,
                        "liveVehicles: " + err.getMessage()).apply();
        });
    }

    private void markOffline() {
        long now = System.currentTimeMillis();
        Map<String, Object> d = new HashMap<>();
        d.put("online", false); d.put("status", "offline");
        d.put("appUpdatedAt", now); d.put("ts", now);
        writeData(d, null);
    }

    private void setupDisconnectHandlers() {
        long now = System.currentTimeMillis();
        Map<String, Object> d = new HashMap<>();
        d.put("online", false); d.put("status", "offline");
        d.put("appUpdatedAt", now); d.put("ts", now);
        busRef.onDisconnect().updateChildren(d);
        try { liveVehicleRef.onDisconnect().updateChildren(d); } catch (Exception ignored) {}
    }

    private Map<String, Object> buildData(Location loc, boolean online) {
        boolean accurate = !loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS;
        return buildStatusData(loc, online, accurate ? "moving" : "low_accuracy", null);
    }

    private Map<String, Object> buildStatusData(Location loc, boolean online,
                                                 String status, String errorMessage) {
        long now = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();
        if (loc != null && (!loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS)) {
            data.put("lat",     loc.getLatitude());
            data.put("lng",     loc.getLongitude());
            data.put("lon",     loc.getLongitude());
            data.put("speed",   loc.hasSpeed()   ? Math.round(loc.getSpeed() * 3.6f) : null);
            data.put("heading", loc.hasBearing() ? loc.getBearing() : null);
            data.put("stopIdx", nearestStopIndex(loc.getLatitude(), loc.getLongitude()));
        }
        if (loc != null && loc.hasAccuracy()) {
            data.put("accuracy",         Math.round(loc.getAccuracy()));
            data.put("acc",              Math.round(loc.getAccuracy()));
            data.put("locationUpdatedAt", now);
        }
        data.put("direction",    "go");
        data.put("queue",        1);
        data.put("queueId",      queueId);
        data.put("status",       status);
        data.put("online",       online);
        data.put("source",       "gps-transit-apk");
        data.put("appUpdatedAt", now);
        data.put("ts",           now);
        if (errorMessage != null) data.put("errorMessage", errorMessage);
        return data;
    }

    private int nearestStopIndex(double lat, double lng) {
        int best = 0; double bestDist = Double.MAX_VALUE;
        for (int i = 0; i < STOPS_GO.length; i++) {
            double d = distanceMeters(lat, lng, STOPS_GO[i][0], STOPS_GO[i][1]);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double r    = 6371000;
        double dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double a    = Math.sin(dLat/2)*Math.sin(dLat/2) +
                Math.cos(Math.toRadians(lat1))*Math.cos(Math.toRadians(lat2))*
                        Math.sin(dLng/2)*Math.sin(dLng/2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void saveCoords(Location loc) {
        prefs.edit().putString(MainActivity.KEY_LAST_COORDS,
                String.format(Locale.US, "%.6f, %.6f",
                        loc.getLatitude(), loc.getLongitude())).apply();
    }

    private void recordStatus(String s) {
        prefs.edit().putString(MainActivity.KEY_LAST_STATUS, s).apply();
    }

    private void recordError(String error) {
        gpsErrorMessage = error == null ? "unknown" : error;
        if (!reportingError) {
            reportingError = true;
            writeData(buildStatusData(null, true, "gps_error", gpsErrorMessage), null);
            reportingError = false;
        }
        prefs.edit().putString(MainActivity.KEY_LAST_STATUS, "gps_error")
                .putString(MainActivity.KEY_LAST_ERROR, gpsErrorMessage).apply();
        updateNotification("GPS error: " + gpsErrorMessage);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "GPS Transit", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("ส่งตำแหน่งรถโดยสารแบบ real-time");
        ch.setShowBadge(false);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    private Notification buildNotification(String text, PendingIntent pi) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle("GPS Transit [" + queueId + "]")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true); // ไม่ดัง/สั่นซ้ำ
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private Notification buildNotification(String text) {
        return buildNotification(text, null);
    }

    private void updateNotification(String text) {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openApp,
                Build.VERSION.SDK_INT >= 23
                        ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        : PendingIntent.FLAG_UPDATE_CURRENT);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .notify(1, buildNotification(text, pi));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private static final double[][] STOPS_GO = {
            {13.453565,102.299330},{13.436666,102.200895},{13.439877,102.083043},
            {13.416310,102.020767},{13.420494,101.995365},{13.420264,101.765445},
            {13.381579,101.708016},{13.443342,101.610222},{13.659022,101.437482},
            {13.745082,101.355993},{13.692477,101.054105}
    };
}

package com.sanamchai.drivergps;

import android.Manifest;
import android.app.AlarmManager;
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
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

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
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

public class GpsService extends Service implements SensorEventListener {
    static final String ACTION_START = "com.sanamchai.drivergps.START";
    static final String ACTION_STOP  = "com.sanamchai.drivergps.STOP";
    static final String ACTION_RESTART = "com.sanamchai.drivergps.RESTART";
    private static final long RESTART_INTERVAL_MS = 3 * 60 * 1000; // 3 นาที

    private static final String TAG                 = "GPSTransit";
    private static final String CHANNEL_ID          = "gps_sender";
    private static final String DB_URL              = "https://bus-booking-1d68c-default-rtdb.firebaseio.com";
    private static final String MODE_MOVING         = "moving";
    private static final String MODE_SLOW           = "slow";
    private static final String MODE_STOPPED        = "stopped";
    private static final String MODE_LONG_STOPPED   = "long_stopped";
    private static final long   MOVING_INTERVAL_MS  = 2000;   // ✅ แก้ไข: 4000→2000ms ส่งถี่ขึ้นตอนวิ่ง
    private static final long   SLOW_INTERVAL_MS    = 4000;   // ✅ แก้ไข: 10000→4000ms ตอนช้า/ออกตัว
    private static final long   SLOW_LOW_BATTERY_MS = 8000;   // ✅ แก้ไข: 15000→8000ms
    private static final long   STOPPED_INTERVAL_MS = 25000;
    private static final long   STOPPED_LOW_BATT_MS = 30000;
    private static final long   LONG_STOPPED_MS     = 60000;
    private static final long   STOP_DETECT_MS      = 45000;
    private static final long   LONG_STOP_DETECT_MS = 12 * 60 * 1000;
    private static final float  MOVING_SPEED_KMH    = 5f;    // ✅ แก้ไข: 10→5 km/h วิ่ง 5 กม./ชม.ขึ้นไปถือว่า moving
    private static final float  SLOW_SPEED_KMH      = 1f;
    private static final float  STOP_RADIUS_METERS  = 10f;  // ลดจาก 20 → 10 เพื่อให้ detect การขยับเร็วขึ้น
    private static final int    LOW_BATTERY_PERCENT = 20;
    private static final float  MAX_ACCURATE_METERS = 40f;
    private static boolean persistenceConfigured    = false;

    private SharedPreferences prefs;
    private FusedLocationProviderClient fusedClient;
    private LocationCallback fusedCallback;
    private FirebaseAuth auth;
    private DatabaseReference busRef, liveVehicleRef, connectedRef, remoteToggleRef;
    private com.google.firebase.database.ValueEventListener remoteToggleListener;
    private volatile boolean remoteEnabled = true;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running        = false;
    private boolean reportingError = false;
    private long lastLocationSentAt = 0;
    private long lastGpsUpdateAt    = 0;
    private long stationarySinceAt  = 0;
    private long currentGpsRequestMs = 0;
    private long currentNetRequestMs = 0;
    private String gpsErrorMessage  = null;
    private String trackingMode     = MODE_SLOW;
    private int batteryLevel        = -1;
    private boolean batteryLow      = false;
    private Map<String, Object> pendingData = null;
    private Location pendingLocation        = null;
    private boolean pendingFullWrite        = false;
    private Location lastFirebaseLocation   = null;
    private Location lastModeLocation       = null;
    private Location stationaryAnchor       = null;
    private boolean forceNextLocationSend   = false;
    private String queueId = "car1";

    // ===== Wake Lock =====
    private PowerManager.WakeLock wakeLock;

    // ===== Network Callback =====
    private ConnectivityManager.NetworkCallback networkCallback;

    // ===== Accelerometer Dead Reckoning =====
    // ใช้ accelerometer ประมาณตำแหน่งระหว่าง GPS gap แทน GPS ที่มาช้า
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private float[] accelValues = new float[3];     // x, y, z ความเร่ง
    private double drLat, drLng;                    // ตำแหน่ง dead reckoning ล่าสุด
    private double drVelNorth, drVelEast;           // ความเร็วเหนือ-ใต้, ตะวันออก-ตก (m/s)
    private long drLastMs;                          // timestamp ที่ update ล่าสุด
    private float drHeading;                        // heading ล่าสุดจาก GPS (องศา)
    private boolean drActive = false;               // dead reckoning กำลังทำงานอยู่ไหม
    private static final float DR_STOP_THRESHOLD = 0.15f;  // m/s — ถือว่าหยุดแล้วถ้าความเร็วต่ำกว่านี้
    private static final long  DR_MAX_AGE_MS     = 8000;   // ms — dead reckoning ใช้ได้สูงสุด 8 วิ

    // ===== Kalman Filter =====
    private static final float KALMAN_Q  = 3f;
    private static final float KALMAN_R  = 10f;
    private double  kfLat, kfLng;
    private float   kfAccuracy;
    private long    kfTimestamp;
    private boolean kfInitialized = false;

    // ===== ACCELEROMETER DEAD RECKONING =====
    // รีเซ็ต anchor ทุกครั้งที่ได้ GPS ใหม่ — DR เริ่มนับจากตำแหน่งนี้
    private void resetDeadReckoning(Location gpsLoc) {
        drLat      = gpsLoc.getLatitude();
        drLng      = gpsLoc.getLongitude();
        drHeading  = gpsLoc.hasBearing() ? gpsLoc.getBearing() : drHeading;
        // init velocity จาก speed ใน GPS packet ถ้ามี
        float speedMs = gpsLoc.hasSpeed() ? gpsLoc.getSpeed() : 0f;
        drVelNorth = speedMs * Math.cos(Math.toRadians(drHeading));
        drVelEast  = speedMs * Math.sin(Math.toRadians(drHeading));
        drLastMs   = gpsLoc.getTime() > 0 ? gpsLoc.getTime() : System.currentTimeMillis();
        drActive   = true;
    }

    // คืนตำแหน่งที่ประมาณจาก accelerometer ถ้า GPS ยังไม่มาและ DR ยังใช้ได้
    // ถ้า DR หมดอายุหรือไม่ active คืน null
    private Location getDeadReckoningLocation() {
        if (!drActive || drLastMs == 0) return null;
        long ageMs = System.currentTimeMillis() - drLastMs;
        if (ageMs > DR_MAX_AGE_MS) return null; // DR เก่าเกินไป ไม่น่าเชื่อถือ
        // ความเร็วรวม
        double speedMs = Math.sqrt(drVelNorth * drVelNorth + drVelEast * drVelEast);
        if (speedMs < DR_STOP_THRESHOLD) return null; // รถหยุดแล้ว ไม่ต้อง DR
        Location dr = new Location("dead_reckoning");
        dr.setLatitude(drLat);
        dr.setLongitude(drLng);
        dr.setSpeed((float) speedMs);
        dr.setBearing(drHeading);
        dr.setTime(System.currentTimeMillis());
        dr.setAccuracy(Math.min(20f + ageMs / 200f, 60f)); // accuracy ลดลงตามเวลา
        return dr;
    }

    // SensorEventListener — รับค่า accelerometer ทุก ~50ms (SENSOR_DELAY_UI)
    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!drActive || !running) return;
        if (event.sensor.getType() != Sensor.TYPE_LINEAR_ACCELERATION &&
            event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;

        float ax = event.values[0]; // ความเร่งแกน X (ซ้าย-ขวา)
        float ay = event.values[1]; // ความเร่งแกน Y (หน้า-หลัง)
        // az = event.values[2] ไม่ใช้ (ขึ้น-ลง)

        long nowMs = System.currentTimeMillis();
        if (drLastMs == 0) { drLastMs = nowMs; return; }
        double dtSec = Math.min((nowMs - drLastMs) / 1000.0, 0.5); // cap ที่ 0.5 วิ
        if (dtSec <= 0) return;
        drLastMs = nowMs;

        // แปลง accelerometer (frame ของมือถือ) → North/East โดยใช้ heading ล่าสุด
        double headRad = Math.toRadians(drHeading);
        double aN = ay * Math.cos(headRad) - ax * Math.sin(headRad); // North component
        double aE = ay * Math.sin(headRad) + ax * Math.cos(headRad); // East component

        // อัปเดต velocity (integrate acceleration)
        drVelNorth += aN * dtSec;
        drVelEast  += aE * dtSec;

        // velocity damping — ลด drift เมื่อรถชะลอ (ไม่มี brake signal จาก sensor)
        drVelNorth *= 0.98;
        drVelEast  *= 0.98;

        // cap ความเร็วไม่เกิน 120 กม./ชม.
        double speedMs = Math.sqrt(drVelNorth * drVelNorth + drVelEast * drVelEast);
        if (speedMs > 33.3) {
            drVelNorth = drVelNorth / speedMs * 33.3;
            drVelEast  = drVelEast  / speedMs * 33.3;
            speedMs    = 33.3;
        }

        // อัปเดตตำแหน่ง (integrate velocity)
        // 1 องศาละติจูด ≈ 111320 เมตร
        drLat += (drVelNorth * dtSec) / 111320.0;
        drLng += (drVelEast  * dtSec) / (111320.0 * Math.cos(Math.toRadians(drLat)));

        // อัปเดต heading จาก velocity ถ้าเคลื่อนที่เร็วพอ
        if (speedMs > 0.5) {
            drHeading = (float) ((Math.toDegrees(Math.atan2(drVelEast, drVelNorth)) + 360) % 360);
        }

        accelValues[0] = ax; accelValues[1] = ay; accelValues[2] = event.values[2];
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // ไม่ต้องทำอะไร
    }

    private Location filterLocation(Location raw) {
        if (raw == null) return null;
        if (raw.hasAccuracy() && raw.getAccuracy() > MAX_ACCURATE_METERS) return null;
        if (!kfInitialized) {
            kfLat = raw.getLatitude(); kfLng = raw.getLongitude();
            kfAccuracy  = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
            kfTimestamp = raw.getTime(); kfInitialized = true;
            return raw;
        }
        if (kfTimestamp > 0) {
            // ✅ แก้ไข: กรอง location ที่มี timestamp ถอยหลัง — เกิดเมื่อ GPS provider สลับ
            // หรือ Android flush cached location เก่าออกมาใน batch
            if (raw.getTime() <= kfTimestamp) return null;
            double dtSec  = (raw.getTime() - kfTimestamp) / 1000.0;
            if (dtSec > 0) {
                double distM = Math.sqrt(Math.pow(raw.getLatitude() - kfLat, 2)
                        + Math.pow(raw.getLongitude() - kfLng, 2)) * 111000;
                if (distM / dtSec > 42f) return null; // > 150 km/h กรองทิ้ง
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
            scheduleNextHeartbeat();
        }
    };

    // ===== Watchdog: ตรวจจับ Firebase WebSocket ค้าง (เช่นหลังถูกปัดทิ้งจาก recent apps แบบไม่ได้กดหยุดส่งก่อน) =====
    private static final long WATCHDOG_CHECK_MS = 20000;  // เช็คทุก 20 วินาที
    private static final long WATCHDOG_STALE_MS = 30000;  // ลดจาก 60s → 30s: Firebase ค้างเกิน 30s reconnect ทันที
    private final Runnable connectionWatchdog = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (remoteEnabled && lastLocationSentAt > 0) {
                long staleFor = System.currentTimeMillis() - lastLocationSentAt;
                if (staleFor > WATCHDOG_STALE_MS) {
                    Log.w(TAG, "Firebase ค้าง " + (staleFor / 1000) + "s — force reconnect");
                    recordError("reconnecting (stale " + (staleFor / 1000) + "s)");
                    try {
                        FirebaseDatabase.getInstance().goOffline();
                        FirebaseDatabase.getInstance().goOnline();
                    } catch (Exception ignored) {}
                    // กันไม่ให้ trigger ซ้ำทันทีระหว่างรอ reconnect — รอบถัดไปจะเช็คใหม่
                    lastLocationSentAt = System.currentTimeMillis();
                }
            }
            handler.postDelayed(this, WATCHDOG_CHECK_MS);
        }
    };

    // ===== GPS Watchdog: ตรวจจับ GPS หายเงียบ แล้วขอ location ใหม่ทันที =====
    private static final long GPS_STALE_MS = 90000; // GPS ไม่มาเกิน 90 วิ ถือว่าหาย
    private final Runnable gpsWatchdog = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (lastGpsUpdateAt > 0) {
                long gpsAgoMs = System.currentTimeMillis() - lastGpsUpdateAt;
                if (gpsAgoMs > GPS_STALE_MS) {
                    Log.w(TAG, "GPS หาย " + (gpsAgoMs / 1000) + "s — recreate FusedLocationClient");
                    // recreate FusedLocationClient ใหม่ทั้งหมด เหมือน restart GPS
                    try {
                        fusedClient.removeLocationUpdates(fusedCallback);
                    } catch (Exception ignored) {}
                    fusedClient = LocationServices.getFusedLocationProviderClient(GpsService.this);
                    currentGpsRequestMs = 0;
                    currentNetRequestMs = 0;
                    configureLocationRequests(true);
                    Log.d(TAG, "GPS watchdog: recreated FusedLocationClient");
                }
            }
            handler.postDelayed(this, GPS_STALE_MS / 3); // เช็คทุก 30 วิ
        }
    };

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return;
            unregisterNetworkCallback();
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    handler.post(() -> {
                        if (!running) return;
                        Log.d(TAG, "NetworkCallback: เน็ตกลับมา — force reconnect Firebase");
                        try {
                            FirebaseDatabase.getInstance().goOffline();
                            FirebaseDatabase.getInstance().goOnline();
                        } catch (Exception ignored) {}
                        lastLocationSentAt = System.currentTimeMillis();
                    });
                }
                @Override public void onLost(Network network) {
                    handler.post(() -> {
                        if (!running) return;
                        Log.w(TAG, "NetworkCallback: เน็ตหาย");
                    });
                }
            };
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception e) {
            Log.e(TAG, "registerNetworkCallback failed: " + e.getMessage());
        }
    }

    private void unregisterNetworkCallback() {
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
                networkCallback = null;
            }
        } catch (Exception ignored) {}
    }

    private void initFusedCallback() {
        fusedCallback = new LocationCallback() {
            @Override public void onLocationResult(LocationResult result) {
                if (result == null) return;
                if (!remoteEnabled) return; // ✅ ถูกสั่งหยุดจาก admin — ไม่ส่งตำแหน่ง
                // ✅ แก้ไข: เลือก location ที่ใหม่และแม่นที่สุดจาก batch
                // แทน getLastLocation() ที่อาจคืน cached location เก่าได้
                Location location = null;
                for (Location l : result.getLocations()) {
                    if (location == null) { location = l; continue; }
                    boolean newer = l.getTime() > location.getTime();
                    boolean moreAccurate = l.hasAccuracy() &&
                        (!location.hasAccuracy() || l.getAccuracy() < location.getAccuracy());
                    if (newer && moreAccurate) location = l;
                    else if (newer && !location.hasAccuracy()) location = l;
                }
                if (location == null) return;
                Location filtered = filterLocation(location);
                if (filtered == null) return;
                latestLocation = filtered;
                saveCoords(filtered);
                prefs.edit().putLong(MainActivity.KEY_LAST_GPS_AT, System.currentTimeMillis()).apply();
                updateTrackingMode(filtered);
                lastGpsUpdateAt = System.currentTimeMillis();
                // ✅ reset dead reckoning anchor ทุกครั้งที่ได้ GPS จริง
                resetDeadReckoning(filtered);
                sendLocationUpdate(filtered);
            }
        };
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GPSTransit::WakeLock");
            wakeLock.acquire();
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) { wakeLock.release(); wakeLock = null; }
        } catch (Exception ignored) {}
    }

    @Override public void onCreate() {
        super.onCreate();
        prefs      = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        initFusedCallback();
        createChannel();
        // ✅ เพิ่ม: เปิด accelerometer สำหรับ dead reckoning ระหว่าง GPS gap
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            if (accelerometer == null) {
                // fallback: ใช้ accelerometer ธรรมดา (รวม gravity) ถ้าไม่มี linear
                accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
        }
    }

    private void initFirebase() {
        queueId = prefs.getString(MainActivity.KEY_VEHICLE_ID, "car1");
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions opts = new FirebaseOptions.Builder()
                    .setApiKey("AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw")
                    .setApplicationId("1:481251007816:web:d8554178d954e7de16e77d")
                    .setDatabaseUrl(DB_URL)
                    .setProjectId("bus-booking-1d68c")
                    .build();
            FirebaseApp.initializeApp(this, opts);
        }
        auth = FirebaseAuth.getInstance();
        FirebaseDatabase db = FirebaseDatabase.getInstance();
        if (!persistenceConfigured) {
            try { db.setPersistenceEnabled(false); } catch (Exception ignored) {}
            // ปิด persistence — location realtime ไม่ต้องการ cache ลง disk
            // เปิดแล้วทำให้ reconnect ช้าเมื่อเปิด app ใหม่ เพราะ reuse connection เก่า
            persistenceConfigured = true;
        }
        busRef         = db.getReference("bus/"          + queueId);
        liveVehicleRef = db.getReference("liveVehicles/" + queueId);
        connectedRef   = db.getReference(".info/connected");
        // ไม่ใช้ keepSynced — ป้องกัน Firebase sync queue เก่าก่อนส่งข้อมูลใหม่
        watchConnectionState();
        watchRemoteToggle();
    }

    // ✅ ฟัง settings/vehicles/{id}/trackingEnabled — ให้ admin สั่งหยุด/เริ่มส่งตำแหน่งจากระยะไกลได้
    private void watchRemoteToggle() {
        if (remoteToggleRef != null && remoteToggleListener != null) {
            try { remoteToggleRef.removeEventListener(remoteToggleListener); } catch (Exception ignored) {}
        }
        remoteToggleRef = FirebaseDatabase.getInstance().getReference("settings/vehicles/" + queueId + "/trackingEnabled");
        remoteToggleListener = new com.google.firebase.database.ValueEventListener() {
            @Override public void onDataChange(com.google.firebase.database.DataSnapshot snapshot) {
                Boolean val = snapshot.getValue(Boolean.class);
                boolean enabled = (val == null) || val; // ถ้าไม่ได้ตั้งค่าไว้ ถือว่าเปิดใช้งานปกติ
                boolean wasEnabled = remoteEnabled;
                remoteEnabled = enabled;
                if (!wasEnabled && enabled) {
                    // กลับมาเปิดใช้งาน — ส่งข้อมูลทันที
                    recordStatus("online / locating");
                    sendHeartbeat();
                } else if (wasEnabled && !enabled) {
                    // ถูกสั่งปิดจาก admin — เคลียร์สถานะออนไลน์ แต่ service ยังทำงานต่อรอคำสั่งเปิดใหม่
                    recordStatus("paused (admin)");
                    markOffline();
                    updateNotification("หยุดส่งตำแหน่งชั่วคราว (สั่งจากระบบ) [" + queueId + "]");
                }
            }
            @Override public void onCancelled(com.google.firebase.database.DatabaseError error) {}
        };
        remoteToggleRef.addValueEventListener(remoteToggleListener);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { stopTracking(); return START_NOT_STICKY; }
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        initFirebase();
        // ✅ Force reconnect Firebase WebSocket ทุกครั้งที่เริ่ม tracking
        // ป้องกัน stale connection ที่ค้างอยู่หลังแอปถูก kill
        try {
            FirebaseDatabase.getInstance().goOffline();
            FirebaseDatabase.getInstance().goOnline();
        } catch (Exception ignored) {}
        acquireWakeLock();
        registerNetworkCallback();
        handler.removeCallbacks(connectionWatchdog);
        handler.removeCallbacks(gpsWatchdog);
        handler.postDelayed(connectionWatchdog, WATCHDOG_CHECK_MS);
        handler.postDelayed(gpsWatchdog, GPS_STALE_MS / 3);
        if (running) {
            setupDisconnectHandlers(); sendHeartbeat();
            handler.removeCallbacks(heartbeatTick);
            scheduleNextHeartbeat();
            return;
        }
        // ✅ เปิด accelerometer listener ตอนเริ่ม tracking
        if (sensorManager != null && accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
        }
        drActive = false; drLat = 0; drLng = 0; drVelNorth = 0; drVelEast = 0;
        running = true; gpsErrorMessage = null;
        trackingMode = MODE_SLOW;
        lastLocationSentAt = 0;
        lastGpsUpdateAt = 0;
        stationarySinceAt = 0;
        lastFirebaseLocation = null;
        lastModeLocation = null;
        stationaryAnchor = null;
        forceNextLocationSend = false;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, true)
                .putString(MainActivity.KEY_LAST_STATUS, "online / locating")
                .putString(MainActivity.KEY_LAST_ERROR, "").apply();

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
        scheduleNextHeartbeat();

        if (!hasLocationPermission()) { recordError("Location permission not granted"); return; }
        configureLocationRequests(true);
    }

    private void stopTracking() {
        if (remoteToggleRef != null && remoteToggleListener != null) {
            try { remoteToggleRef.removeEventListener(remoteToggleListener); } catch (Exception ignored) {}
        }
        running = false;
        // ✅ ปิด accelerometer listener ตอนหยุด tracking
        if (sensorManager != null) {
            try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        }
        drActive = false;
        prefs.edit()
                .putBoolean(MainActivity.KEY_ENABLED, false)
                .putString(MainActivity.KEY_LAST_STATUS, "stopped").apply();
        handler.removeCallbacks(heartbeatTick);
        handler.removeCallbacks(connectionWatchdog);
        handler.removeCallbacks(gpsWatchdog);
        unregisterNetworkCallback();
        try { fusedClient.removeLocationUpdates(fusedCallback); } catch (Exception ignored) {}
        currentGpsRequestMs = 0;
        currentNetRequestMs = 0;
        markOffline();
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
    }

    // ===== AlarmManager Restart สำหรับ Honor/Huawei/Samsung =====
    private void scheduleAlarmRestart() {
        if (prefs == null || !prefs.getBoolean(MainActivity.KEY_ENABLED, false)) return;
        try {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            Intent intent = new Intent(this, BootReceiver.class);
            intent.setAction(ACTION_RESTART);
            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(this, 99, intent,
                    Build.VERSION.SDK_INT >= 23
                            ? android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
                            : android.app.PendingIntent.FLAG_UPDATE_CURRENT);
            long triggerAt = System.currentTimeMillis() + RESTART_INTERVAL_MS;
            if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } catch (Exception e) {
            // fallback: restart ตรงๆ
            try {
                Intent restart = new Intent(getApplicationContext(), GpsService.class);
                restart.setAction(ACTION_START);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(restart);
                else startService(restart);
            } catch (Exception ignored) {}
        }
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        scheduleAlarmRestart();
    }

    @Override public void onDestroy() {
        super.onDestroy();
        // บันทึกว่าถูก kill กี่ครั้ง
        if (prefs != null && prefs.getBoolean(MainActivity.KEY_ENABLED, false)) {
            int count = prefs.getInt(MainActivity.KEY_RESTART_COUNT, 0);
            prefs.edit()
                .putInt(MainActivity.KEY_RESTART_COUNT, count + 1)
                .putLong(MainActivity.KEY_LAST_RESTART, System.currentTimeMillis())
                .apply();
        }
        scheduleAlarmRestart();
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)   == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void scheduleNextHeartbeat() {
        handler.removeCallbacks(heartbeatTick);
        if (!running) return;
        handler.postDelayed(heartbeatTick, selectedFirebaseIntervalMs());
    }

    private long selectedFirebaseIntervalMs() {
        refreshBatteryState(false);
        if (MODE_MOVING.equals(trackingMode)) return batteryLow ? 5000 : MOVING_INTERVAL_MS;
        if (MODE_SLOW.equals(trackingMode)) return batteryLow ? SLOW_LOW_BATTERY_MS : SLOW_INTERVAL_MS;
        if (MODE_LONG_STOPPED.equals(trackingMode)) return LONG_STOPPED_MS;
        return batteryLow ? STOPPED_LOW_BATT_MS : STOPPED_INTERVAL_MS;
    }

    private boolean isBatterySavingActive() {
        return batteryLow || MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode);
    }

    private void refreshBatteryState(boolean notifyDriver) {
        Intent battery = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) return;
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level >= 0 && scale > 0) batteryLevel = Math.round(level * 100f / scale);
        boolean wasLow = batteryLow;
        batteryLow = batteryLevel >= 0 && batteryLevel < LOW_BATTERY_PERCENT;
        if (notifyDriver && batteryLow && !wasLow) {
            updateNotification("แบตต่ำ " + batteryLevel + "% - ยังส่งตำแหน่งต่อในโหมดประหยัด");
        }
    }

    private void updateTrackingMode(Location loc) {
        long now = System.currentTimeMillis();
        float speedKmh = speedKmh(loc);
        if (!loc.hasSpeed() && lastModeLocation != null) {
            long dtMs = gpsTimeMs(loc) - gpsTimeMs(lastModeLocation);
            if (dtMs <= 0) dtMs = now - lastGpsUpdateAt;
            if (dtMs > 0) {
                float dist = loc.distanceTo(lastModeLocation);
                speedKmh = (dist / (dtMs / 1000f)) * 3.6f;
            }
        }

        if (stationaryAnchor == null) stationaryAnchor = new Location(loc);
        float anchorDistance = loc.distanceTo(stationaryAnchor);
        String nextMode;
        if (speedKmh > MOVING_SPEED_KMH) {
            nextMode = MODE_MOVING;
            stationarySinceAt = 0;
            stationaryAnchor = new Location(loc);
        } else if (speedKmh >= SLOW_SPEED_KMH) {
            nextMode = MODE_SLOW;
            stationarySinceAt = 0;
            if (anchorDistance >= STOP_RADIUS_METERS) stationaryAnchor = new Location(loc);
        } else if (anchorDistance >= STOP_RADIUS_METERS) {
            nextMode = MODE_SLOW;
            stationarySinceAt = 0;
            stationaryAnchor = new Location(loc);
        } else {
            if (stationarySinceAt == 0) stationarySinceAt = now;
            long stoppedMs = now - stationarySinceAt;
            nextMode = stoppedMs >= LONG_STOP_DETECT_MS
                    ? MODE_LONG_STOPPED
                    : stoppedMs >= STOP_DETECT_MS ? MODE_STOPPED : MODE_SLOW;
        }

        lastModeLocation = new Location(loc);
        applyTrackingMode(nextMode);
    }

    private void applyTrackingMode(String nextMode) {
        if (nextMode == null || nextMode.equals(trackingMode)) {
            configureLocationRequests(false);
            return;
        }
        boolean wasStopped = MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode);
        trackingMode = nextMode;
        if (wasStopped && (MODE_MOVING.equals(nextMode) || MODE_SLOW.equals(nextMode))) {
            forceNextLocationSend = true;
        }
        configureLocationRequests(false);
        logBatteryMode("mode_changed");
    }

    private void configureLocationRequests(boolean force) {
        if (!running || !hasLocationPermission()) return;
        refreshBatteryState(true);
        long intervalMs;
        int priority;
        if (MODE_MOVING.equals(trackingMode)) {
            intervalMs = batteryLow ? 5000 : MOVING_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else if (MODE_SLOW.equals(trackingMode)) {
            intervalMs = batteryLow ? SLOW_LOW_BATTERY_MS : SLOW_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else if (MODE_LONG_STOPPED.equals(trackingMode)) {
            intervalMs = LONG_STOPPED_MS;
            priority   = Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        } else {
            intervalMs = batteryLow ? STOPPED_LOW_BATT_MS : STOPPED_INTERVAL_MS;
            priority   = Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        }
        if (!force && intervalMs == currentGpsRequestMs) return;
        currentGpsRequestMs = intervalMs;
        currentNetRequestMs = intervalMs;
        try {
            fusedClient.removeLocationUpdates(fusedCallback);

            // ✅ Network fallback request — ส่งพิกัดคร่าวๆ จากเน็ตทันที ขณะรอ GPS fix
            // แก้ปัญหา "GPS หาย 17 ชั่วโมง" ตอนเปิดแอพครั้งแรก/หลังข้ามคืน
            LocationRequest netReq = new LocationRequest.Builder(
                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, intervalMs)
                    .setMinUpdateIntervalMillis(intervalMs / 2)
                    .setMaxUpdateDelayMillis(intervalMs)
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(netReq, fusedCallback, Looper.getMainLooper());

            // ✅ GPS high-accuracy request — แม่นยำกว่า จะ override network location เมื่อ fix ได้
            LocationRequest req = new LocationRequest.Builder(priority, intervalMs)
                    .setMinUpdateIntervalMillis(intervalMs / 2)
                    .setMaxUpdateDelayMillis(intervalMs)
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(req, fusedCallback,
                    Looper.getMainLooper());
            logBatteryMode("location_request");
        } catch (SecurityException e) {
            recordError(e.getMessage());
        }
    }

    private float speedKmh(Location loc) {
        return loc != null && loc.hasSpeed() ? loc.getSpeed() * 3.6f : 0f;
    }

    private long gpsTimeMs(Location loc) {
        if (loc == null) return 0;
        return loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis();
    }

    private void logBatteryMode(String reason) {
        Log.d(TAG, String.format(Locale.US,
                "%s tracking mode=%s selectedIntervalMs=%d batterySavingActive=%s batteryLevel=%d lastFirebaseSendTime=%d lastGpsUpdateTime=%d",
                reason, trackingMode, selectedFirebaseIntervalMs(), isBatterySavingActive(),
                batteryLevel, lastLocationSentAt, lastGpsUpdateAt));
    }

    private void sendHeartbeat() {
        if (!remoteEnabled) return; // ✅ ถูกสั่งหยุดจาก admin
        refreshBatteryState(true);
        if (gpsErrorMessage != null && latestLocation == null) {
            writeData(buildStatusData(null, true, "gps_error", gpsErrorMessage), null, false); return;
        }
        if (latestLocation == null) {
            // ✅ DR fallback: ถ้ายังไม่มี GPS แต่ dead reckoning ยังใช้ได้ → ส่ง DR location แทน
            Location drLoc = getDeadReckoningLocation();
            if (drLoc != null) {
                Log.d(TAG, "sendHeartbeat: using dead reckoning location (no GPS yet)");
                writeData(buildData(drLoc, false), drLoc, false);
                return;
            }
            recordStatus("online / locating");
            updateNotification("รอสัญญาณ GPS... [" + queueId + "]");
            writeData(buildStatusData(null, true, "locating", null), null, false); return;
        }
        updateTrackingMode(latestLocation);
        if (MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode)) {
            writeData(buildHeartbeatData(trackingMode, latestLocation), null, false);
        } else {
            writeData(buildData(latestLocation, true), latestLocation, true);
        }
    }

    private void sendLocationUpdate(Location loc) {
        if (!running || loc == null) return;
        gpsErrorMessage = null;
        refreshBatteryState(true);
        long now = System.currentTimeMillis();

        // Speed-based wake: ถ้ารถเริ่มขยับหลังหยุด (speed > 2 กม./ชม.) → force send ทันที
        // ป้องกัน marker ค้างตอนรับผู้โดยสารแล้วออกตัว
        boolean justStartedMoving =
            (MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode))
            && speedKmh(loc) > 2f;
        if (justStartedMoving) {
            forceNextLocationSend = true;
            Log.d(TAG, "speed-based wake: speed=" + speedKmh(loc) + " km/h, forcing send");
        }

        // ✅ DR bridge: ถ้าช่องว่าง GPS > 2 วิ และ DR active → ส่ง DR location แทน
        // ช่วยให้ marker เคลื่อนที่ต่อเนื่องบน passenger.html แม้ GPS packet ยังไม่มา
        long gpsGapMs = now - lastGpsUpdateAt;
        if (gpsGapMs > 2000 && drActive) {
            Location drLoc = getDeadReckoningLocation();
            if (drLoc != null && now - lastLocationSentAt >= 1000) {
                Log.d(TAG, "sendLocationUpdate: DR bridge gpsGap=" + gpsGapMs + "ms");
                writeData(buildData(drLoc, false), null, false);
                lastLocationSentAt = now;
                return;
            }
        }
        if (!forceNextLocationSend && now - lastLocationSentAt < selectedFirebaseIntervalMs()) return;
        forceNextLocationSend = false;

        if (MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode)) {
            boolean movedEnough = lastFirebaseLocation == null
                    || loc.distanceTo(lastFirebaseLocation) >= STOP_RADIUS_METERS;
            if (movedEnough) {
                writeData(buildData(loc, true), loc, true);
            } else {
                writeData(buildHeartbeatData(trackingMode, loc), null, false);
            }
            return;
        }

        writeData(buildData(loc, true), loc, true);
    }

    private void watchConnectionState() {
        connectedRef.addValueEventListener(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snapshot) {
                Boolean connected = snapshot.getValue(Boolean.class);
                if (!Boolean.TRUE.equals(connected) || !running) return;
                // ✅ แก้ไข: เมื่อ reconnect ให้ set online:true ทันที ก่อน setupDisconnectHandlers
                // ป้องกัน onDisconnect handler ค้างทำให้ passenger เห็น online:false
                long now = System.currentTimeMillis();
                Map<String, Object> onlineNow = new HashMap<>();
                onlineNow.put("online", true);
                onlineNow.put("appUpdatedAt", now);
                onlineNow.put("ts", now);
                busRef.updateChildren(onlineNow);
                liveVehicleRef.updateChildren(onlineNow);
                setupDisconnectHandlers();
                if (pendingData != null) writeData(pendingData, pendingLocation, pendingFullWrite);
                else { lastLocationSentAt = 0; sendHeartbeat(); }
            }
            @Override public void onCancelled(DatabaseError error) {
                recordError("Firebase connection: " + error.getMessage());
            }
        });
    }

    private void writeData(Map<String, Object> data, Location loc) {
        writeData(data, loc, loc != null);
    }

    private void writeData(Map<String, Object> data, Location loc, boolean fullLocationWrite) {
        pendingData = new HashMap<>(data); pendingLocation = loc; pendingFullWrite = fullLocationWrite;
        logBatteryMode(fullLocationWrite ? "firebase_location_send" : "firebase_heartbeat_send");
        if (auth.getCurrentUser() != null) { writeAuthedData(data, loc, fullLocationWrite); return; }
        auth.signInAnonymously()
                .addOnSuccessListener(r -> writeAuthedData(data, loc, fullLocationWrite))
                .addOnFailureListener(e -> {
                    if ("gps_error".equals(String.valueOf(data.get("status")))) {
                        updateNotification("Firebase Auth: " + e.getMessage()); return;
                    }
                    writeAuthedData(data, loc, fullLocationWrite);
                    recordError("Firebase Auth: " + e.getMessage());
                });
    }

    private void writeAuthedData(Map<String, Object> data, Location loc, boolean fullLocationWrite) {
        DatabaseReference.CompletionListener completion = (err, ref) -> {
            if (err != null) {
                if (!"gps_error".equals(String.valueOf(data.get("status"))))
                    recordError("Firebase " + err.getCode() + ": " + err.getMessage());
                return;
            }
            long now = System.currentTimeMillis();
            lastLocationSentAt = now;
            if (loc != null) lastFirebaseLocation = new Location(loc);
            prefs.edit()
                    .putLong(MainActivity.KEY_LAST_SENT, now)
                    .putString(MainActivity.KEY_LAST_STATUS, String.valueOf(data.get("status")))
                    .putString(MainActivity.KEY_LAST_ERROR, "").apply();
            pendingData = null; pendingLocation = null; pendingFullWrite = false;
            if (loc == null) updateNotification(String.valueOf(data.get("status")));
            else updateNotification(String.format(Locale.US, "[%s] %.5f, %.5f",
                    queueId, loc.getLatitude(), loc.getLongitude()));
            logBatteryMode("firebase_send_success");
        };
        if (fullLocationWrite) busRef.setValue(data, completion);
        else busRef.updateChildren(data, completion);
        if (fullLocationWrite) liveVehicleRef.setValue(data, (err, ref) -> {
            if (err != null)
                prefs.edit().putString(MainActivity.KEY_LAST_ERROR,
                        "liveVehicles: " + err.getMessage()).apply();
        });
        else liveVehicleRef.updateChildren(data, (err, ref) -> {
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
        d.put("sentTs", now);
        writeData(d, null, false);
    }

    private void setupDisconnectHandlers() {
        long now = System.currentTimeMillis();
        Map<String, Object> d = new HashMap<>();
        d.put("online", false); d.put("status", "offline");
        d.put("appUpdatedAt", now); d.put("ts", now); d.put("sentTs", now);
        busRef.onDisconnect().updateChildren(d);
        try { liveVehicleRef.onDisconnect().updateChildren(d); } catch (Exception ignored) {}
    }

    private Map<String, Object> buildData(Location loc, boolean online) {
        boolean accurate = !loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS;
        return buildStatusData(loc, online, accurate ? trackingMode : "low_accuracy", null);
    }

    private Map<String, Object> buildHeartbeatData(String status, Location gpsLoc) {
        Map<String, Object> data = buildStatusData(null, true, status, null);
        if (gpsLoc != null) data.put("gpsTs", gpsTimeMs(gpsLoc));
        data.put("heartbeatOnly", true);
        return data;
    }

    private Map<String, Object> buildStatusData(Location loc, boolean online,
                                                 String status, String errorMessage) {
        long now = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();
        if (loc != null && (!loc.hasAccuracy() || loc.getAccuracy() <= MAX_ACCURATE_METERS)) {
            data.put("lat",     loc.getLatitude());
            data.put("lng",     loc.getLongitude());
            data.put("lon",     loc.getLongitude());
            // ✅ แก้ไข: ส่ง 0 แทน null เมื่อไม่มี speed/heading — ป้องกัน Firebase null value warning
            data.put("speed",   loc.hasSpeed()   ? Math.round(loc.getSpeed() * 3.6f) : 0);
            data.put("heading", loc.hasBearing() ? loc.getBearing() : 0f);
            data.put("stopIdx", nearestStopIndex(loc.getLatitude(), loc.getLongitude()));
        }
        if (loc != null) {
            // ✅ แก้ไข: ส่ง accuracy เสมอ (ถ้าไม่มีให้ส่ง 999 = unknown) ป้องกัน field หาย
            data.put("accuracy",          loc.hasAccuracy() ? Math.round(loc.getAccuracy()) : 999);
            data.put("acc",               loc.hasAccuracy() ? Math.round(loc.getAccuracy()) : 999);
            data.put("locationUpdatedAt", now);
            data.put("gpsTs",             gpsTimeMs(loc));
        }
        data.put("direction",    "go");
        data.put("queue",        1);
        data.put("queueId",      queueId);
        data.put("status",       status);
        data.put("online",       online);
        data.put("source",       "gps-transit-apk");
        data.put("trackingMode", trackingMode);
        data.put("selectedIntervalMs", selectedFirebaseIntervalMs());
        data.put("batterySavingActive", isBatterySavingActive());
        data.put("batteryLevel", batteryLevel);
        data.put("appUpdatedAt", now);
        data.put("sentTs",       now);
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
                .setCategory(Notification.CATEGORY_SERVICE)
                .setOngoing(true)
                .setOnlyAlertOnce(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        if (Build.VERSION.SDK_INT >= 31) {
            b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private Notification buildNotification(String text) { return buildNotification(text, null); }

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

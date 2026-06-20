package com.sanamchai.drivergps;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
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
    private static final long RESTART_INTERVAL_MS = 10 * 60 * 1000;
    private static final long STANDBY_LOCATION_INTERVAL_MS = 5 * 60 * 1000;
    private static final long SERVICE_WINDOW_CHECK_MS = 30 * 1000;

    private static final String TAG                 = "GPSTransit";
    private static final String CHANNEL_ID          = "gps_sender";
    private static final String DB_URL              = "https://bus-booking-1d68c-default-rtdb.firebaseio.com";
    private static final String MODE_MOVING         = "moving";
    private static final String MODE_SLOW           = "slow";
    private static final String MODE_STOPPED        = "stopped";
    private static final long   MOVING_INTERVAL_MS  = 2000;   // ✅ แก้ไข: 4000→2000ms ส่งถี่ขึ้นตอนวิ่ง
    private static final long   SLOW_INTERVAL_MS    = 4000;   // ✅ แก้ไข: 10000→4000ms ตอนช้า/ออกตัว
    private static final long   SLOW_LOW_BATTERY_MS = 8000;   // ✅ แก้ไข: 15000→8000ms
    private static final long   STOPPED_INTERVAL_MS = 25000;
    private static final long   STOPPED_LOW_BATT_MS = 30000;
    private static final long   STOP_DETECT_MS      = 45000;  // ✅ ตัด LONG_STOP_DETECT_MS ออก — GPS หายตอนจอดนาน
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
    private DatabaseReference busRef, liveVehicleRef, connectedRef, vehicleSettingsRef;
    private com.google.firebase.database.ValueEventListener vehicleSettingsListener;
    private volatile boolean manualRemoteEnabled = true;
    private volatile boolean scheduleRemoteEnabled = true;
    private volatile boolean remoteEnabled = true;
    private volatile boolean adminScheduleEnabled = false;
    private String adminScheduleOn = null;
    private String adminScheduleOff = null;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location latestLocation;
    private boolean running        = false;
    private boolean reportingError = false;
    private long lastLocationSentAt = 0;
    private long lastGpsUpdateAt    = 0;
    private long gpsRequestStartedAt = 0;
    private long lastGpsRecoveryAt = 0;
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
    private Location lastGpsFixLocation     = null; // พิกัด GPS จริงล่าสุด ใช้ส่งซ้ำตอนจอดนิ่งช่วงเวลาทำการ
    private Location lastFirebaseLocation   = null;
    private Location lastModeLocation       = null;
    private Location stationaryAnchor       = null;
    private boolean forceNextLocationSend   = false;
    private String queueId = "car1";

    // ===== ระบบคิวรถ — อ่านจาก Firebase settings/queueRotation =====
    // คำนวณว่าวันนี้รถคันนี้อยู่คิวไหน แล้วใช้เวลา wake/start/end คุมการส่งตำแหน่ง
    private String queueBaseDate = "2026-06-14"; // fallback ถ้า Firebase อ่านไม่ได้
    private final java.util.Map<String, Integer> queueBaseMap = new java.util.HashMap<String, Integer>() {{
        put("car1", 1); put("car2", 2); put("car3", 3); put("car4", 4); // fallback
    }};
    // เวลาแต่ละคิว (fallback ถ้า Firebase อ่านไม่ได้) format "HH:mm"
    private final String[][] QUEUE_SCHEDULE = {
        // { wakeTime, startTime, endTime }
        { "08:00", "09:00", "14:35" }, // คิว 1
        { "07:00", "08:00", "16:20" }, // คิว 2
        { "05:20", "06:20", "17:03" }, // คิว 3
        { "10:30", "11:30", "17:20" }, // คิว 4
    };
    private final java.util.Map<Integer, String[]> firebaseQueueSchedule = new java.util.HashMap<>();
    private int todayQueueNo = -1; // -1 = ยังไม่ได้คำนวณ
    private boolean scheduleLoaded = false;


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
        // ✅ แก้ไข: ผ่อน accuracy filter ตอนจอดนิ่ง — ตอน stopped Android ลด GPS chip
        // ทำให้ accuracy เลวลง (50–150m) แต่ถ้ากรองทิ้งหมด lastGpsUpdateAt จะไม่ได้รับการอัปเดต
        // และ GPS Watchdog จะ false-trigger ว่า GPS หาย ทั้งที่ chip ยังมีชีวิต
        boolean isStopped = MODE_STOPPED.equals(trackingMode);
        float maxAccuracy = isStopped ? 150f : MAX_ACCURATE_METERS;
        if (raw.hasAccuracy() && raw.getAccuracy() > maxAccuracy) return null;
        if (!kfInitialized) {
            kfLat = raw.getLatitude(); kfLng = raw.getLongitude();
            kfAccuracy  = raw.hasAccuracy() ? raw.getAccuracy() : 10f;
            kfTimestamp = raw.getTime(); kfInitialized = true;
            return raw;
        }
        if (kfTimestamp > 0) {
            // ✅ แก้ไข: กรอง location ที่มี timestamp ถอยหลัง — เกิดเมื่อ GPS provider สลับ
            // หรือ Android flush cached location เก่าออกมาใน batch
            // ยกเว้น network/passive fix ที่ timestamp อาจเท่ากัน (ใช้ provider เป็นตัวแยก)
            boolean isNetworkFix = "network".equals(raw.getProvider()) || "fused".equals(raw.getProvider());
            if (!isNetworkFix && raw.getTime() <= kfTimestamp) return null;
            if (isNetworkFix && raw.getTime() < kfTimestamp - 5000) return null; // network fix เก่ากว่า 5 วิ ทิ้ง
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
    // 🐛 แก้บัค: เดิมใช้ threshold ตายตัว 30 วิ ทั้งที่ตอนรถจอดนิ่ง (MODE_LONG_STOPPED)
    // ระบบตั้งใจส่งข้อมูลห่างกันถึง 60 วิ ทำให้ watchdog เข้าใจผิดว่า Firebase ค้างตลอดเวลา
    // และสั่ง goOffline/goOnline วนซ้ำทุก 20 วิ ขณะรถจอด ซึ่งคือสาเหตุหลักของ "Firebase ค้าง" ที่รถไม่ขยับ
    private static final long WATCHDOG_CHECK_MS = 20000;  // เช็คทุก 20 วินาที
    private static final long WATCHDOG_STALE_FLOOR_MS = 30000; // ค่าต่ำสุดของ threshold เผื่อโหมด moving/slow
    private static final long WATCHDOG_STALE_MULTIPLIER = 2;   // อนุญาตให้ค้างได้ไม่เกิน 2 เท่าของรอบส่งปัจจุบัน ก่อนถือว่าค้างจริง
    private long currentWatchdogStaleMs() {
        long expectedIntervalMs = selectedFirebaseIntervalMs();
        return Math.max(WATCHDOG_STALE_FLOOR_MS, expectedIntervalMs * WATCHDOG_STALE_MULTIPLIER);
    }
    private final Runnable connectionWatchdog = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (remoteEnabled && lastLocationSentAt > 0) {
                long staleFor = System.currentTimeMillis() - lastLocationSentAt;
                long staleThreshold = currentWatchdogStaleMs();
                if (staleFor > staleThreshold) {
                    Log.w(TAG, "Firebase ค้าง " + (staleFor / 1000) + "s (threshold " + (staleThreshold / 1000) + "s, mode=" + trackingMode + ") — force reconnect");
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
    // 🐛 แก้บัค: เดิมใช้ threshold ตายตัว 90 วิ ทั้งที่ตอนรถจอดนิ่งนาน (MODE_LONG_STOPPED)
    // ระบบตั้งใจขอ GPS fix ห่างกันถึง 60 วิ (PRIORITY_BALANCED_POWER_ACCURACY ซึ่งอาจมาช้ากว่านั้นได้อีก)
    // ทำให้ threshold เดิมมี margin แค่ ~30 วิ และ false-trigger ได้ง่ายมากตอนรถจอด
    private static final long GPS_STALE_FLOOR_MS = 90000; // ค่าต่ำสุดของ threshold เผื่อโหมด moving/slow
    private static final long GPS_STALE_MULTIPLIER = 2;   // อนุญาตให้ GPS หายได้ไม่เกิน 2 เท่าของรอบขอ fix ปัจจุบัน
    private long currentGpsStaleMs() {
        long expectedIntervalMs = currentGpsRequestMs > 0 ? currentGpsRequestMs : selectedFirebaseIntervalMs();
        return Math.max(GPS_STALE_FLOOR_MS, expectedIntervalMs * GPS_STALE_MULTIPLIER);
    }
    private static final long GPS_RECOVERY_RETRY_MS = 30000;
    private final Runnable gpsWatchdog = new Runnable() {
        @Override public void run() {
            if (!running) return;
            long now = System.currentTimeMillis();
            long referenceAt = lastGpsUpdateAt > 0 ? lastGpsUpdateAt : gpsRequestStartedAt;
            if (referenceAt > 0) {
                long gpsAgoMs = now - referenceAt;
                long staleThreshold = currentGpsStaleMs();
                if (gpsAgoMs > staleThreshold && now - lastGpsRecoveryAt >= GPS_RECOVERY_RETRY_MS) {
                    recoverGpsProvider(gpsAgoMs);
                }
                if (gpsAgoMs > 180000 && running) showGpsLostNotification(gpsAgoMs / 1000);
            }
            handler.postDelayed(this, GPS_STALE_FLOOR_MS / 3);
        }
    };

    private void recoverGpsProvider(long gpsAgoMs) {
        lastGpsRecoveryAt = System.currentTimeMillis();
        Log.w(TAG, "GPS หาย " + (gpsAgoMs / 1000) + "s — restart requests + one-shot fix");
        recordStatus("recovering_gps");
        updateNotification("กำลังกู้คืนสัญญาณ GPS... [" + queueId + "]");
        try {
            if (fusedClient != null) fusedClient.removeLocationUpdates(fusedCallback);
        } catch (Exception ignored) {}
        try {
            fusedClient = LocationServices.getFusedLocationProviderClient(GpsService.this);
            currentGpsRequestMs = 0;
            currentNetRequestMs = 0;
            configureLocationRequests(true);
            com.google.android.gms.tasks.CancellationTokenSource tokenSource =
                    new com.google.android.gms.tasks.CancellationTokenSource();
            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, tokenSource.getToken())
                    .addOnSuccessListener(this::handleLocationResult)
                    .addOnFailureListener(error -> recordError("GPS recovery failed: " + error.getMessage()));
        } catch (Exception error) {
            recordError("GPS recovery failed: " + error.getMessage());
        }
    }
    private long lastGpsNotifyAt = 0;
    private void showGpsLostNotification(long gpsAgoSec) {
        // กันสแปม — แจ้งเตือนซ้ำได้ทุก 3 นาทีเท่านั้น
        long now = System.currentTimeMillis();
        if (now - lastGpsNotifyAt < 180000) return;
        lastGpsNotifyAt = now;
        try {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            String channelId = "gps_alert";
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        channelId, "แจ้งเตือน GPS", android.app.NotificationManager.IMPORTANCE_HIGH);
                ch.enableVibration(true);
                nm.createNotificationChannel(ch);
            }
            android.app.Notification n = new androidx.core.app.NotificationCompat.Builder(this, channelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_alert)
                    .setContentTitle("⚠️ GPS หายนาน " + (gpsAgoSec / 60) + " นาที")
                    .setContentText("ระบบพยายามกู้คืนแล้ว กรุณาตรวจสอบสัญญาณ GPS")
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .build();
            nm.notify(9901, n);
        } catch (Exception ignored) {}
    }

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
                if (result == null || !remoteEnabled) return;
                Location location = null;
                for (Location item : result.getLocations()) {
                    if (location == null || item.getTime() > location.getTime()
                            || (item.getTime() == location.getTime() && item.hasAccuracy()
                            && (!location.hasAccuracy() || item.getAccuracy() < location.getAccuracy()))) {
                        location = item;
                    }
                }
                handleLocationResult(location);
            }
        };
    }

    private void handleLocationResult(Location location) {
        if (location == null || !running || !remoteEnabled) return;
        // ✅ แก้ไข: อัปเดต lastGpsUpdateAt ทันทีที่ได้รับ fix ไม่ว่า accuracy จะผ่านหรือไม่
        // เพื่อบอก GPS Watchdog ว่า chip ยังมีชีวิต แค่ fix อาจไม่แม่น
        // ถ้าอัปเดตหลัง filter → fix accuracy เลว (ตอนจอด) จะถูกทิ้ง → watchdog คิดว่า GPS หาย → false recovery loop
        long now = System.currentTimeMillis();
        lastGpsUpdateAt = now;
        lastGpsRecoveryAt = 0;
        prefs.edit().putLong(MainActivity.KEY_LAST_GPS_AT, now).apply();

        Location filtered = filterLocation(location);
        if (filtered == null) return;
        latestLocation = filtered;
        saveCoords(filtered);
        if (!filtered.hasAccuracy() || filtered.getAccuracy() <= 50f) {
            lastGpsFixLocation = new Location(filtered);
        }
        updateTrackingMode(filtered);
        resetDeadReckoning(filtered);
        sendLocationUpdate(filtered);
    }
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GPSTransit::WakeLock");
            // ✅ แก้ไข: กำหนด timeout 14 ชั่วโมง แทน acquire() ไม่มี timeout
            // ป้องกัน WakeLock leak — Android จะ force-release ให้เองถ้าเราลืม release
            // และบังคับให้ OS รู้ว่าเรายังต้องการ CPU ตลอดช่วงวันทำการ
            wakeLock.acquire(14 * 60 * 60 * 1000L);
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

    // ===== คำนวณคิวรถวันนี้จาก Firebase settings/queueRotation =====
    private void loadQueueSchedule() {
        try {
            FirebaseDatabase.getInstance()
                    .getReference("settings/queueRotation")
                    .addListenerForSingleValueEvent(new com.google.firebase.database.ValueEventListener() {
                @Override public void onDataChange(com.google.firebase.database.DataSnapshot snap) {
                    try {
                        // อ่าน baseDate
                        String bd = snap.child("baseDate").getValue(String.class);
                        if (bd != null && bd.matches("\\d{4}-\\d{2}-\\d{2}")) queueBaseDate = bd;
                        // อ่าน carQueueOnBaseDate
                        com.google.firebase.database.DataSnapshot cq = snap.child("carQueueOnBaseDate");
                        for (String car : new String[]{"car1","car2","car3","car4"}) {
                            Long v = cq.child(car).getValue(Long.class);
                            if (v != null && v >= 1 && v <= 4) queueBaseMap.put(car, v.intValue());
                        }
                    } catch (Exception ignored) {}
                    computeTodayQueue();
                    loadRouteDataScheduleForToday();
                }
                @Override public void onCancelled(com.google.firebase.database.DatabaseError e) {
                    computeTodayQueue(); // ใช้ fallback hardcode
                    scheduleLoaded = true;
                }
            });
        } catch (Exception e) {
            computeTodayQueue();
            scheduleLoaded = true;
        }
    }

    private void loadRouteDataScheduleForToday() {
        if (todayQueueNo < 1 || todayQueueNo > 4) {
            scheduleLoaded = true;
            return;
        }
        try {
            FirebaseDatabase.getInstance()
                    .getReference("routeData/queues/" + todayQueueNo + "/trips")
                    .addListenerForSingleValueEvent(new com.google.firebase.database.ValueEventListener() {
                @Override public void onDataChange(com.google.firebase.database.DataSnapshot snap) {
                    try {
                        java.util.List<String> times = new java.util.ArrayList<>();
                        for (com.google.firebase.database.DataSnapshot tripSnap : snap.getChildren()) {
                            for (com.google.firebase.database.DataSnapshot stopSnap : tripSnap.child("stops").getChildren()) {
                                String time = stopSnap.child("time").getValue(String.class);
                                if (time != null && time.matches("\\d{2}:\\d{2}")) times.add(time);
                            }
                        }
                        if (!times.isEmpty()) {
                            java.util.Collections.sort(times);
                            String start = times.get(0);
                            String end = times.get(times.size() - 1);
                            firebaseQueueSchedule.put(todayQueueNo, new String[]{minusMinutes(start, 60), start, end});
                            Log.d(TAG, "Loaded routeData schedule for queue " + todayQueueNo + ": " + start + "-" + end);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "routeData schedule parse failed: " + e.getMessage());
                    }
                    scheduleLoaded = true;
                }
                @Override public void onCancelled(com.google.firebase.database.DatabaseError e) {
                    scheduleLoaded = true;
                }
            });
        } catch (Exception e) {
            scheduleLoaded = true;
        }
    }

    private String minusMinutes(String time, int minutes) {
        try {
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US);
            java.util.Date d = sdf.parse(time);
            if (d == null) return time;
            return sdf.format(new java.util.Date(d.getTime() - minutes * 60000L));
        } catch (Exception e) {
            return time;
        }
    }

    private void computeTodayQueue() {
        try {
            Integer baseQ = queueBaseMap.get(queueId);
            if (baseQ == null) { todayQueueNo = -1; return; }
            // คำนวณจำนวนวันที่ผ่านมาจาก baseDate
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            java.util.Date base = sdf.parse(queueBaseDate);
            java.util.Date today = sdf.parse(sdf.format(new java.util.Date()));
            if (base == null || today == null) { todayQueueNo = baseQ; return; }
            long diffMs = today.getTime() - base.getTime();
            int diffDays = (int)(diffMs / 86400000L);
            todayQueueNo = ((baseQ - 1 + diffDays) % 4 + 4) % 4 + 1;
        } catch (Exception e) {
            Integer baseQ = queueBaseMap.get(queueId);
            todayQueueNo = baseQ == null ? -1 : baseQ;
        }
    }

    // คืนเวลา wake/start/end ของคิววันนี้ (index 0=wake, 1=start, 2=end)
    private String getScheduleTime(int index) {
        int q = todayQueueNo;
        if (q < 1 || q > 4) return null;
        String[] firebaseSchedule = firebaseQueueSchedule.get(q);
        if (firebaseSchedule != null && index >= 0 && index < firebaseSchedule.length && firebaseSchedule[index] != null) {
            return firebaseSchedule[index];
        }
        return QUEUE_SCHEDULE[q - 1][index];
    }

    // เช็คว่าตอนนี้อยู่ในช่วงที่ควรส่งตำแหน่งไหม (wakeTime <= now <= endTime)
    public boolean isWithinSchedule() {
        if (todayQueueNo < 1) return true; // ยังไม่โหลด schedule → ให้ผ่านไปก่อน
        try {
            String wake = getScheduleTime(0);
            String end  = getScheduleTime(2);
            if (wake == null || end == null) return true;
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US);
            java.util.Date now  = sdf.parse(sdf.format(new java.util.Date()));
            java.util.Date wakeT = sdf.parse(wake);
            java.util.Date endT  = sdf.parse(end);
            if (now == null || wakeT == null || endT == null) return true;
            return !now.before(wakeT) && !now.after(endT);
        } catch (Exception e) {
            return true;
        }
    }

    // คืน priority ที่เหมาะสมตามช่วงเวลา
    // นอกเวลา → BALANCED (ประหยัดแบต), warm-up/ทำการ → HIGH (GPS chip ทำงานตลอด)
    private int getSchedulePriority() {
        if (!isWithinSchedule()) {
            return Priority.PRIORITY_BALANCED_POWER_ACCURACY; // นอกเวลา — ใช้ network ประหยัดแบต
        }
        return Priority.PRIORITY_HIGH_ACCURACY; // warm-up หรือทำการ — GPS chip เต็มที่
    }

    // ช่วงทำการจริง (startTime → endTime) — GPS แม่นยำสูง ส่งพิกัด GPS จริง
    public boolean isInWorkingHours() {
        if (todayQueueNo < 1) return true;
        try {
            String start = getScheduleTime(1); // index 1 = startTime
            String end   = getScheduleTime(2); // index 2 = endTime
            if (start == null || end == null) return true;
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US);
            java.util.Date now    = sdf.parse(sdf.format(new java.util.Date()));
            java.util.Date startT = sdf.parse(start);
            java.util.Date endT   = sdf.parse(end);
            if (now == null || startT == null || endT == null) return true;
            return !now.before(startT) && !now.after(endT);
        } catch (Exception e) {
            return true;
        }
    }

    // ช่วง warm-up (wakeTime → startTime) — GPS เตรียมพร้อมล่วงหน้า 1 ชั่วโมง
    public boolean isInWarmUp() {
        return isWithinSchedule() && !isInWorkingHours();
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
        loadQueueSchedule(); // โหลดข้อมูลคิวจาก Firebase (async, มี fallback hardcode)
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
        watchVehicleSettings();
    }    // แอปคนขับอ่าน manual switch และตารางเวลาเอง ไม่พึ่งหน้า admin เปิดค้างไว้
    private void watchVehicleSettings() {
        if (vehicleSettingsRef != null && vehicleSettingsListener != null) {
            try { vehicleSettingsRef.removeEventListener(vehicleSettingsListener); } catch (Exception ignored) {}
        }
        vehicleSettingsRef = FirebaseDatabase.getInstance().getReference("settings/vehicles/" + queueId);
        vehicleSettingsListener = new com.google.firebase.database.ValueEventListener() {
            @Override public void onDataChange(com.google.firebase.database.DataSnapshot snapshot) {
                Boolean manual = snapshot.child("manualEnabled").getValue(Boolean.class);
                Boolean legacy = snapshot.child("trackingEnabled").getValue(Boolean.class);
                String on = snapshot.child("schedule/on").getValue(String.class);
                String off = snapshot.child("schedule/off").getValue(String.class);
                Boolean scheduleFlag = snapshot.child("scheduleEnabled").getValue(Boolean.class);
                boolean hasSchedule = isValidTime(on) && isValidTime(off);
                manualRemoteEnabled = manual != null ? manual : (hasSchedule || legacy == null || legacy);
                adminScheduleOn = hasSchedule ? on : null;
                adminScheduleOff = hasSchedule ? off : null;
                adminScheduleEnabled = hasSchedule && (scheduleFlag == null || scheduleFlag);
                applyEffectiveTrackingState("settings");
            }
            @Override public void onCancelled(com.google.firebase.database.DatabaseError error) {
                Log.w(TAG, "vehicle settings cancelled: " + error.getMessage());
            }
        };
        vehicleSettingsRef.addValueEventListener(vehicleSettingsListener);
    }

    private boolean isValidTime(String value) {
        return value != null && value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d");
    }

    private boolean isWithinAdminSchedule() {
        if (!adminScheduleEnabled || !isValidTime(adminScheduleOn) || !isValidTime(adminScheduleOff)) return true;
        String now = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).format(new java.util.Date());
        if (adminScheduleOn.equals(adminScheduleOff)) return true;
        if (adminScheduleOn.compareTo(adminScheduleOff) < 0)
            return now.compareTo(adminScheduleOn) >= 0 && now.compareTo(adminScheduleOff) < 0;
        return now.compareTo(adminScheduleOn) >= 0 || now.compareTo(adminScheduleOff) < 0;
    }

    private void applyEffectiveTrackingState(String reason) {
        scheduleRemoteEnabled = isWithinAdminSchedule();
        boolean enabled = manualRemoteEnabled && scheduleRemoteEnabled;
        boolean changed = enabled != remoteEnabled;
        remoteEnabled = enabled;
        if (enabled) {
            acquireWakeLock();
            if (changed) {
                recordStatus("online / locating");
                forceNextLocationSend = true;
                configureLocationRequests(true);
                recoverGpsProvider(0);
                sendHeartbeat();
            }
            updateNotification("ระบบ GPS พร้อมทำงาน [" + queueId + "]");
        } else {
            if (changed) {
                markOffline();
                configureLocationRequests(true);
            }
            recordStatus("standby (admin schedule)");
            updateNotification((manualRemoteEnabled ? "พักตามเวลาที่ตั้งในระบบ" : "หยุดส่งตำแหน่งชั่วคราว") + " [" + queueId + "]");
        }
        Log.d(TAG, "effective tracking=" + enabled + " reason=" + reason);
    }

    private final Runnable serviceWindowTick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            applyEffectiveTrackingState("clock");
            scheduleHealthCheck(GpsService.this);
            handler.postDelayed(this, SERVICE_WINDOW_CHECK_MS);
        }
    };
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { stopTracking(); return START_NOT_STICKY; }
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        if (running) {
            sendHeartbeat();
            return;
        }
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
        handler.postDelayed(gpsWatchdog, GPS_STALE_FLOOR_MS / 3);
        handler.post(serviceWindowTick);
        scheduleHealthCheck(this);

        // ✅ เปิด accelerometer listener ตอนเริ่ม tracking
        if (sensorManager != null && accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
        }
        drActive = false; drLat = 0; drLng = 0; drVelNorth = 0; drVelEast = 0;
        running = true; gpsErrorMessage = null;
        trackingMode = MODE_SLOW;
        lastLocationSentAt = 0;
        lastGpsUpdateAt = 0;
        gpsRequestStartedAt = 0;
        lastGpsRecoveryAt = 0;
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

        String queueLabel = todayQueueNo > 0 ? " คิว" + todayQueueNo : "";
        Notification n = buildNotification("กำลังหาสัญญาณ GPS... [" + queueId + queueLabel + "]", pi);
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
        if (!running) {
            prefs.edit().putBoolean(MainActivity.KEY_ENABLED, false).apply();
            try { stopForeground(true); } catch (Exception ignored) {}
            stopSelf();
            return;
        }
        if (vehicleSettingsRef != null && vehicleSettingsListener != null) {
            try { vehicleSettingsRef.removeEventListener(vehicleSettingsListener); } catch (Exception ignored) {}
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
        gpsRequestStartedAt = 0;
        lastGpsRecoveryAt = 0;
        markOffline();
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
    }
    public static void scheduleHealthCheck(Context context) {
        if (context == null) return;
        SharedPreferences p = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean(MainActivity.KEY_ENABLED, false)) return;
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(context, BootReceiver.class);
            intent.setAction(ACTION_RESTART);
            PendingIntent pi = PendingIntent.getBroadcast(context, 99, intent,
                    Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT);
            long at = System.currentTimeMillis() + RESTART_INTERVAL_MS;
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.set(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Exception e) { Log.w(TAG, "schedule health check failed: " + e.getMessage()); }
    }

    public static void cancelHealthCheck(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, BootReceiver.class); intent.setAction(ACTION_RESTART);
            PendingIntent pi = PendingIntent.getBroadcast(context, 99, intent,
                    Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT);
            if (am != null) am.cancel(pi); pi.cancel();
        } catch (Exception ignored) {}
    }

    private void scheduleAlarmRestart() { scheduleHealthCheck(this); }
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
        return batteryLow ? STOPPED_LOW_BATT_MS : STOPPED_INTERVAL_MS;
    }

    private boolean isBatterySavingActive() {
        return batteryLow || MODE_STOPPED.equals(trackingMode);
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
            // ✅ ตัด MODE_LONG_STOPPED ออก — จอดนาน 45 วิขึ้นไปคือ stopped เสมอ interval คงที่ 25 วิ
            nextMode = stoppedMs >= STOP_DETECT_MS ? MODE_STOPPED : MODE_SLOW;
        }

        lastModeLocation = new Location(loc);
        applyTrackingMode(nextMode);
    }

    private void applyTrackingMode(String nextMode) {
        if (nextMode == null || nextMode.equals(trackingMode)) {
            configureLocationRequests(false);
            return;
        }
        boolean wasStopped = MODE_STOPPED.equals(trackingMode);
        trackingMode = nextMode;
        if (wasStopped && (MODE_MOVING.equals(nextMode) || MODE_SLOW.equals(nextMode))) {
            forceNextLocationSend = true;
        }
        configureLocationRequests(false);
        logBatteryMode("mode_changed");
    }

    private void configureLocationRequests(boolean force) {
        if (!running || !hasLocationPermission()) return;
        // 🛡️ ป้องกัน NPE: เผื่อ fusedClient ยังไม่ถูกสร้าง (ไม่ควรเกิดขึ้นปกติ เพราะ onCreate() สร้างไว้แล้ว
        // แต่บางอุปกรณ์ เช่น HONOR/Magic OS มี lifecycle ที่ผิดปกติ จึงเช็คซ้ำให้ปลอดภัย)
        if (fusedClient == null) {
            Log.w(TAG, "configureLocationRequests: fusedClient เป็น null — สร้างใหม่");
            fusedClient = LocationServices.getFusedLocationProviderClient(this);
        }
        refreshBatteryState(true);
        long intervalMs;
        int priority;

        // ===== เลือก priority ตามช่วงเวลาคิว =====
        // นอกเวลาทำการ (ก่อน wakeTime / หลัง endTime) → Network location ประหยัดแบต
        // ช่วง warm-up (wakeTime → startTime) → HIGH_ACCURACY เตรียม GPS ล่วงหน้า
        // ช่วงทำการ (startTime → endTime) → HIGH_ACCURACY เสมอ ไม่ยอมให้ GPS chip หลับ
        boolean inWorking     = isInWorkingHours();
        boolean inWarmUp      = isInWarmUp();
        boolean useHighAccuracy = inWorking || inWarmUp; // นอกเวลาทั้งหมดเท่านั้นที่ใช้ network

        if (!remoteEnabled) {
            intervalMs = STANDBY_LOCATION_INTERVAL_MS;
            priority = Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        } else if (MODE_MOVING.equals(trackingMode)) {
            intervalMs = batteryLow ? 5000 : MOVING_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else if (MODE_SLOW.equals(trackingMode)) {
            intervalMs = batteryLow ? SLOW_LOW_BATTERY_MS : SLOW_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else {
            // MODE_STOPPED — interval คงที่ 25 วิตลอด ไม่ว่าจะจอดนานแค่ไหน
            intervalMs = batteryLow ? STOPPED_LOW_BATT_MS : STOPPED_INTERVAL_MS;
            priority   = useHighAccuracy ? Priority.PRIORITY_HIGH_ACCURACY
                                         : Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        }
        if (!force && intervalMs == currentGpsRequestMs) return;
        currentGpsRequestMs = intervalMs;
        currentNetRequestMs = intervalMs;
        gpsRequestStartedAt = System.currentTimeMillis();
        try {
            fusedClient.removeLocationUpdates(fusedCallback);

            // ✅ Network fallback request — ส่งพิกัดคร่าวๆ จากเน็ตทันที ขณะรอ GPS fix
            // แก้ปัญหา "GPS หาย 17 ชั่วโมง" ตอนเปิดแอพครั้งแรก/หลังข้ามคืน
            LocationRequest netReq = new LocationRequest.Builder(
                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, intervalMs)
                    .setMinUpdateIntervalMillis(intervalMs / 2)
                    .setMaxUpdateDelayMillis(intervalMs)
                    .setMaxUpdateAgeMillis(intervalMs)
                    .setMinUpdateDistanceMeters(0f)  // ✅ ส่ง fix แม้ไม่ขยับ — กัน OS suppress location ตอนจอดนาน
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(netReq, fusedCallback, Looper.getMainLooper());

            // ✅ GPS high-accuracy request — แม่นยำกว่า จะ override network location เมื่อ fix ได้
            // setMinUpdateDistanceMeters(0f) = บอก OS ว่า "แม้รถไม่ขยับเลยก็ต้องส่ง fix มาทุก interval"
            // นี่คือสาเหตุที่ Uber/Lyft GPS ไม่หายตอนจอดรอผู้โดยสาร
            long minGpsIntervalMs = Math.min(intervalMs / 2, 10000); // ไม่เกิน 10 วิ
            LocationRequest req = new LocationRequest.Builder(priority, intervalMs)
                    .setMinUpdateIntervalMillis(minGpsIntervalMs)
                    .setMaxUpdateDelayMillis(intervalMs)
                    .setMaxUpdateAgeMillis(intervalMs)
                    .setMinUpdateDistanceMeters(0f)  // ✅ กัน OS หยุดส่ง fix ตอนรถจอดนิ่ง — จุดหลักที่ทำให้ GPS หาย
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(req, fusedCallback,
                    Looper.getMainLooper());
            logBatteryMode("location_request");
        } catch (SecurityException e) {
            recordError(e.getMessage());
        } catch (Exception e) {
            recordError("Location request failed: " + e.getMessage());
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
        if (MODE_STOPPED.equals(trackingMode)) {
            // ✅ ช่วงเวลาทำการ + มีพิกัด GPS จริงเก็บไว้ → ส่งพิกัด GPS ล่าสุดซ้ำ (ไม่ใช่ network)
            // ป้องกันรถ "หายจากแผนที่" ตอนจอดรับผู้โดยสาร พิกัดยังถูกต้องไม่กระโดด
            if (isInWorkingHours() && lastGpsFixLocation != null) {
                Map<String, Object> d = buildData(lastGpsFixLocation, false);
                d.put("stopped", true); // flag บอกว่ารถจอดอยู่ ไม่ใช่พิกัดใหม่จริง
                writeData(d, null, false);
            } else {
                writeData(buildHeartbeatData(trackingMode, latestLocation), null, false);
            }
        } else {
            writeData(buildData(latestLocation, true), latestLocation, true);
        }
    }

    private void sendLocationUpdate(Location loc) {
        if (!running || !remoteEnabled || loc == null) return;
        gpsErrorMessage = null;
        refreshBatteryState(true);
        long now = System.currentTimeMillis();

        // Speed-based wake: ถ้ารถเริ่มขยับหลังหยุด (speed > 2 กม./ชม.) → force send ทันที
        // ป้องกัน marker ค้างตอนรับผู้โดยสารแล้วออกตัว
        boolean justStartedMoving =
            MODE_STOPPED.equals(trackingMode)
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

        if (MODE_STOPPED.equals(trackingMode)) {
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
        data.put("queueId",      queueId);
        if (todayQueueNo > 0) {
            data.put("queue",        todayQueueNo);
            data.put("queueNo",      todayQueueNo);
            data.put("todayQueueNo", todayQueueNo);
        } else {
            data.put("queue",        null);
            data.put("queueNo",      null);
            data.put("todayQueueNo", null);
        }
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

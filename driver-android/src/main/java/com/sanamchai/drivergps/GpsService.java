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
    private static final long RESTART_INTERVAL_MS = 3 * 60 * 1000; // 3 ????

    private static final String TAG                 = "GPSTransit";
    private static final String CHANNEL_ID          = "gps_sender";
    private static final String DB_URL              = "https://bus-booking-1d68c-default-rtdb.firebaseio.com";
    private static final String MODE_MOVING         = "moving";
    private static final String MODE_SLOW           = "slow";
    private static final String MODE_STOPPED        = "stopped";
    private static final String MODE_LONG_STOPPED   = "long_stopped";
    private static final long   MOVING_INTERVAL_MS  = 2000;   // ? ?????: 4000?2000ms ?????????????????
    private static final long   SLOW_INTERVAL_MS    = 4000;   // ? ?????: 10000?4000ms ??????/??????
    private static final long   SLOW_LOW_BATTERY_MS = 8000;   // ? ?????: 15000?8000ms
    private static final long   STOPPED_INTERVAL_MS = 25000;
    private static final long   STOPPED_LOW_BATT_MS = 30000;
    private static final long   LONG_STOPPED_MS     = 60000;
    private static final long   STOP_DETECT_MS      = 45000;
    private static final long   LONG_STOP_DETECT_MS = 12 * 60 * 1000;
    private static final float  MOVING_SPEED_KMH    = 5f;    // ? ?????: 10?5 km/h ???? 5 ??./??.???????????? moving
    private static final float  SLOW_SPEED_KMH      = 1f;
    private static final float  STOP_RADIUS_METERS  = 10f;  // ????? 20 ? 10 ???????? detect ???????????????
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
    private Location lastGpsFixLocation     = null; // ????? GPS ?????????? ????????????????????????????????
    private Location lastFirebaseLocation   = null;
    private Location lastModeLocation       = null;
    private Location stationaryAnchor       = null;
    private boolean forceNextLocationSend   = false;
    private String queueId = "car1";

    // ===== ????????? ? ??????? Firebase settings/queueRotation =====
    // ???????????????????????????????? ??????????? wake/start/end ????????????????
    private String queueBaseDate = "2026-06-14"; // fallback ??? Firebase ??????????
    private final java.util.Map<String, Integer> queueBaseMap = new java.util.HashMap<String, Integer>() {{
        put("car1", 1); put("car2", 2); put("car3", 3); put("car4", 4); // fallback
    }};
    // ???????????? (fallback ??? Firebase ??????????) format "HH:mm"
    private final String[][] QUEUE_SCHEDULE = {
        // { wakeTime, startTime, endTime }
        { "08:00", "09:00", "14:35" }, // ??? 1
        { "07:00", "08:00", "16:20" }, // ??? 2
        { "05:20", "06:20", "17:03" }, // ??? 3
        { "10:30", "11:30", "17:20" }, // ??? 4
    };
    private final java.util.Map<Integer, String[]> firebaseQueueSchedule = new java.util.HashMap<>();
    private int todayQueueNo = -1; // -1 = ??????????????
    private boolean scheduleLoaded = false;


    private PowerManager.WakeLock wakeLock;

    // ===== Network Callback =====
    private ConnectivityManager.NetworkCallback networkCallback;

    // ===== Accelerometer Dead Reckoning =====
    // ??? accelerometer ???????????????????? GPS gap ??? GPS ????????
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private float[] accelValues = new float[3];     // x, y, z ????????
    private double drLat, drLng;                    // ??????? dead reckoning ??????
    private double drVelNorth, drVelEast;           // ?????????????-???, ????????-?? (m/s)
    private long drLastMs;                          // timestamp ??? update ??????
    private float drHeading;                        // heading ????????? GPS (????)
    private boolean drActive = false;               // dead reckoning ?????????????????
    private static final float DR_STOP_THRESHOLD = 0.15f;  // m/s ? ???????????????????????????????????
    private static final long  DR_MAX_AGE_MS     = 8000;   // ms ? dead reckoning ???????????? 8 ??

    // ===== Kalman Filter =====
    private static final float KALMAN_Q  = 3f;
    private static final float KALMAN_R  = 10f;
    private double  kfLat, kfLng;
    private float   kfAccuracy;
    private long    kfTimestamp;
    private boolean kfInitialized = false;

    // ===== ACCELEROMETER DEAD RECKONING =====
    // ?????? anchor ?????????????? GPS ???? ? DR ?????????????????????
    private void resetDeadReckoning(Location gpsLoc) {
        drLat      = gpsLoc.getLatitude();
        drLng      = gpsLoc.getLongitude();
        drHeading  = gpsLoc.hasBearing() ? gpsLoc.getBearing() : drHeading;
        // init velocity ??? speed ?? GPS packet ?????
        float speedMs = gpsLoc.hasSpeed() ? gpsLoc.getSpeed() : 0f;
        drVelNorth = speedMs * Math.cos(Math.toRadians(drHeading));
        drVelEast  = speedMs * Math.sin(Math.toRadians(drHeading));
        drLastMs   = gpsLoc.getTime() > 0 ? gpsLoc.getTime() : System.currentTimeMillis();
        drActive   = true;
    }

    // ?????????????????????? accelerometer ??? GPS ??????????? DR ?????????
    // ??? DR ?????????????? active ??? null
    private Location getDeadReckoningLocation() {
        if (!drActive || drLastMs == 0) return null;
        long ageMs = System.currentTimeMillis() - drLastMs;
        if (ageMs > DR_MAX_AGE_MS) return null; // DR ?????????? ??????????????
        // ???????????
        double speedMs = Math.sqrt(drVelNorth * drVelNorth + drVelEast * drVelEast);
        if (speedMs < DR_STOP_THRESHOLD) return null; // ?????????? ??????? DR
        Location dr = new Location("dead_reckoning");
        dr.setLatitude(drLat);
        dr.setLongitude(drLng);
        dr.setSpeed((float) speedMs);
        dr.setBearing(drHeading);
        dr.setTime(System.currentTimeMillis());
        dr.setAccuracy(Math.min(20f + ageMs / 200f, 60f)); // accuracy ???????????
        return dr;
    }

    // SensorEventListener ? ?????? accelerometer ??? ~50ms (SENSOR_DELAY_UI)
    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!drActive || !running) return;
        if (event.sensor.getType() != Sensor.TYPE_LINEAR_ACCELERATION &&
            event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;

        float ax = event.values[0]; // ??????????? X (????-???)
        float ay = event.values[1]; // ??????????? Y (????-????)
        // az = event.values[2] ?????? (????-??)

        long nowMs = System.currentTimeMillis();
        if (drLastMs == 0) { drLastMs = nowMs; return; }
        double dtSec = Math.min((nowMs - drLastMs) / 1000.0, 0.5); // cap ??? 0.5 ??
        if (dtSec <= 0) return;
        drLastMs = nowMs;

        // ???? accelerometer (frame ?????????) ? North/East ?????? heading ??????
        double headRad = Math.toRadians(drHeading);
        double aN = ay * Math.cos(headRad) - ax * Math.sin(headRad); // North component
        double aE = ay * Math.sin(headRad) + ax * Math.cos(headRad); // East component

        // ?????? velocity (integrate acceleration)
        drVelNorth += aN * dtSec;
        drVelEast  += aE * dtSec;

        // velocity damping ? ?? drift ??????????? (????? brake signal ??? sensor)
        drVelNorth *= 0.98;
        drVelEast  *= 0.98;

        // cap ??????????????? 120 ??./??.
        double speedMs = Math.sqrt(drVelNorth * drVelNorth + drVelEast * drVelEast);
        if (speedMs > 33.3) {
            drVelNorth = drVelNorth / speedMs * 33.3;
            drVelEast  = drVelEast  / speedMs * 33.3;
            speedMs    = 33.3;
        }

        // ????????????? (integrate velocity)
        // 1 ??????????? ? 111320 ????
        drLat += (drVelNorth * dtSec) / 111320.0;
        drLng += (drVelEast  * dtSec) / (111320.0 * Math.cos(Math.toRadians(drLat)));

        // ?????? heading ??? velocity ???????????????????
        if (speedMs > 0.5) {
            drHeading = (float) ((Math.toDegrees(Math.atan2(drVelEast, drVelNorth)) + 360) % 360);
        }

        accelValues[0] = ax; accelValues[1] = ay; accelValues[2] = event.values[2];
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // ?????????????
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
            // ? ?????: ???? location ????? timestamp ??????? ? ????????? GPS provider ????
            // ???? Android flush cached location ??????????? batch
            if (raw.getTime() <= kfTimestamp) return null;
            double dtSec  = (raw.getTime() - kfTimestamp) / 1000.0;
            if (dtSec > 0) {
                double distM = Math.sqrt(Math.pow(raw.getLatitude() - kfLat, 2)
                        + Math.pow(raw.getLongitude() - kfLng, 2)) * 111000;
                if (distM / dtSec > 42f) return null; // > 150 km/h ????????
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

    // ===== Watchdog: ??????? Firebase WebSocket ???? (????????????????????? recent apps ??????????????????????) =====
    // ?? ??????: ??????? threshold ?????? 30 ?? ??????????????????? (MODE_LONG_STOPPED)
    // ????????????????????????????? 60 ?? ????? watchdog ???????????? Firebase ????????????
    // ??????? goOffline/goOnline ???????? 20 ?? ???????? ???????????????????? "Firebase ????" ????????????
    private static final long WATCHDOG_CHECK_MS = 20000;  // ??????? 20 ??????
    private static final long WATCHDOG_STALE_FLOOR_MS = 30000; // ???????????? threshold ????????? moving/slow
    private static final long WATCHDOG_STALE_MULTIPLIER = 2;   // ??????????????????????? 2 ????????????????????? ??????????????????
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
                    Log.w(TAG, "Firebase ???? " + (staleFor / 1000) + "s (threshold " + (staleThreshold / 1000) + "s, mode=" + trackingMode + ") ? force reconnect");
                    recordError("reconnecting (stale " + (staleFor / 1000) + "s)");
                    try {
                        FirebaseDatabase.getInstance().goOffline();
                        FirebaseDatabase.getInstance().goOnline();
                    } catch (Exception ignored) {}
                    // ????????? trigger ????????????????? reconnect ? ??????????????????
                    lastLocationSentAt = System.currentTimeMillis();
                }
            }
            handler.postDelayed(this, WATCHDOG_CHECK_MS);
        }
    };

    // ===== GPS Watchdog: ??????? GPS ???????? ?????? location ????????? =====
    // ?? ??????: ??????? threshold ?????? 90 ?? ?????????????????????? (MODE_LONG_STOPPED)
    // ???????????? GPS fix ?????????? 60 ?? (PRIORITY_BALANCED_POWER_ACCURACY ??????????????????????????)
    // ????? threshold ?????? margin ??? ~30 ?? ??? false-trigger ??????????????????
    private static final long GPS_STALE_FLOOR_MS = 90000; // ???????????? threshold ????????? moving/slow
    private static final long GPS_STALE_MULTIPLIER = 2;   // ????????? GPS ????????????? 2 ???????????? fix ????????
    private long currentGpsStaleMs() {
        long expectedIntervalMs = currentGpsRequestMs > 0 ? currentGpsRequestMs : selectedFirebaseIntervalMs();
        return Math.max(GPS_STALE_FLOOR_MS, expectedIntervalMs * GPS_STALE_MULTIPLIER);
    }
    private final Runnable gpsWatchdog = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (lastGpsUpdateAt > 0) {
                long gpsAgoMs = System.currentTimeMillis() - lastGpsUpdateAt;
                long staleThreshold = currentGpsStaleMs();
                if (gpsAgoMs > staleThreshold) {
                    Log.w(TAG, "GPS ??? " + (gpsAgoMs / 1000) + "s (threshold " + (staleThreshold / 1000) + "s, mode=" + trackingMode + ") ? recreate FusedLocationClient");
                    // recreate FusedLocationClient ??????????? ?????? restart GPS
                    try {
                        fusedClient.removeLocationUpdates(fusedCallback);
                    } catch (Exception ignored) {}
                    fusedClient = LocationServices.getFusedLocationProviderClient(GpsService.this);
                    currentGpsRequestMs = 0;
                    currentNetRequestMs = 0;
                    configureLocationRequests(true);
                    Log.d(TAG, "GPS watchdog: recreated FusedLocationClient");
                }

                // ? ????????????????? GPS ??????? 3 ???? (180s)
                // watchdog ??? recreate ??????????????????? ? ?????????????????????????????
                if (gpsAgoMs > 180000 && running) {
                    showGpsLostNotification(gpsAgoMs / 1000);
                }
            }
            handler.postDelayed(this, GPS_STALE_FLOOR_MS / 3); // ??????? 30 ?? (??????????????? ??????????????????????? moving)
        }
    };

    private long lastGpsNotifyAt = 0;
    private void showGpsLostNotification(long gpsAgoSec) {
        // ??????? ? ?????????????????? 3 ????????????
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
                        channelId, "????????? GPS", android.app.NotificationManager.IMPORTANCE_HIGH);
                ch.enableVibration(true);
                nm.createNotificationChannel(ch);
            }
            android.app.Notification n = new androidx.core.app.NotificationCompat.Builder(this, channelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_alert)
                    .setContentTitle("?? GPS ?????? " + (gpsAgoSec / 60) + " ????")
                    .setContentText("???????????????????? ?????????????????? GPS")
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
                        Log.d(TAG, "NetworkCallback: ?????????? ? force reconnect Firebase");
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
                        Log.w(TAG, "NetworkCallback: ???????");
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
                if (!remoteEnabled) return; // ? ?????????????? admin ? ?????????????
                // ? ?????: ????? location ??????????????????????? batch
                // ??? getLastLocation() ????????? cached location ???????
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
                // ? ??????????? GPS ?????????? (accuracy ? 50m) ??????????????????????????????????
                if (!filtered.hasAccuracy() || filtered.getAccuracy() <= 50f) {
                    lastGpsFixLocation = new Location(filtered);
                }
                prefs.edit().putLong(MainActivity.KEY_LAST_GPS_AT, System.currentTimeMillis()).apply();
                updateTrackingMode(filtered);
                lastGpsUpdateAt = System.currentTimeMillis();
                // ? reset dead reckoning anchor ?????????????? GPS ????
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
        // ? ?????: ???? accelerometer ?????? dead reckoning ??????? GPS gap
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            if (accelerometer == null) {
                // fallback: ??? accelerometer ?????? (??? gravity) ???????? linear
                accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
        }
    }

    // ===== ??????????????????? Firebase settings/queueRotation =====
    private void loadQueueSchedule() {
        try {
            FirebaseDatabase.getInstance()
                    .getReference("settings/queueRotation")
                    .addListenerForSingleValueEvent(new com.google.firebase.database.ValueEventListener() {
                @Override public void onDataChange(com.google.firebase.database.DataSnapshot snap) {
                    try {
                        // ???? baseDate
                        String bd = snap.child("baseDate").getValue(String.class);
                        if (bd != null && bd.matches("\\d{4}-\\d{2}-\\d{2}")) queueBaseDate = bd;
                        // ???? carQueueOnBaseDate
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
                    computeTodayQueue(); // ??? fallback hardcode
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
            // ????????????????????????? baseDate
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

    // ??????? wake/start/end ???????????? (index 0=wake, 1=start, 2=end)
    private String getScheduleTime(int index) {
        int q = todayQueueNo;
        if (q < 1 || q > 4) return null;
        String[] firebaseSchedule = firebaseQueueSchedule.get(q);
        if (firebaseSchedule != null && index >= 0 && index < firebaseSchedule.length && firebaseSchedule[index] != null) {
            return firebaseSchedule[index];
        }
        return QUEUE_SCHEDULE[q - 1][index];
    }

    // ?????????????????????????????????????????? (wakeTime <= now <= endTime)
    public boolean isWithinSchedule() {
        if (todayQueueNo < 1) return true; // ?????????? schedule ? ?????????????
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

    // ??? priority ?????????????????????
    // ??????? ? BALANCED (??????????), warm-up/????? ? HIGH (GPS chip ?????????)
    private int getSchedulePriority() {
        if (!isWithinSchedule()) {
            return Priority.PRIORITY_BALANCED_POWER_ACCURACY; // ??????? ? ??? network ??????????
        }
        return Priority.PRIORITY_HIGH_ACCURACY; // warm-up ????????? ? GPS chip ???????
    }

    // ????????????? (startTime ? endTime) ? GPS ????????? ???????? GPS ????
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

    // ???? warm-up (wakeTime ? startTime) ? GPS ??????????????????? 1 ???????
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
        loadQueueSchedule(); // ???????????????? Firebase (async, ?? fallback hardcode)
        auth = FirebaseAuth.getInstance();
        FirebaseDatabase db = FirebaseDatabase.getInstance();
        if (!persistenceConfigured) {
            try { db.setPersistenceEnabled(false); } catch (Exception ignored) {}
            // ??? persistence ? location realtime ?????????? cache ?? disk
            // ????????????? reconnect ???????????? app ???? ????? reuse connection ????
            persistenceConfigured = true;
        }
        busRef         = db.getReference("bus/"          + queueId);
        liveVehicleRef = db.getReference("liveVehicles/" + queueId);
        connectedRef   = db.getReference(".info/connected");
        // ?????? keepSynced ? ??????? Firebase sync queue ?????????????????????
        watchConnectionState();
        watchRemoteToggle();
    }

    // ? ??? settings/vehicles/{id}/trackingEnabled ? ??? admin ????????/????????????????????????????
    private void watchRemoteToggle() {
        if (remoteToggleRef != null && remoteToggleListener != null) {
            try { remoteToggleRef.removeEventListener(remoteToggleListener); } catch (Exception ignored) {}
        }
        remoteToggleRef = FirebaseDatabase.getInstance().getReference("settings/vehicles/" + queueId + "/trackingEnabled");
        remoteToggleListener = new com.google.firebase.database.ValueEventListener() {
            @Override public void onDataChange(com.google.firebase.database.DataSnapshot snapshot) {
                Boolean val = snapshot.getValue(Boolean.class);
                boolean enabled = (val == null) || val; // ??????????????????? ????????????????????
                boolean wasEnabled = remoteEnabled;
                remoteEnabled = enabled;
                if (!wasEnabled && enabled) {
                    // ???????????????? ? ??????????????
                    recordStatus("online / locating");
                    sendHeartbeat();
                } else if (wasEnabled && !enabled) {
                    // ????????????? admin ? ??????????????????? ??? service ???????????????????????????
                    recordStatus("paused (admin)");
                    markOffline();
                    updateNotification("?????????????????????? (???????????) [" + queueId + "]");
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
        // ? Force reconnect Firebase WebSocket ???????????????? tracking
        // ??????? stale connection ????????????????????? kill
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
        if (running) {
            setupDisconnectHandlers(); sendHeartbeat();
            handler.removeCallbacks(heartbeatTick);
            scheduleNextHeartbeat();
            return;
        }
        // ? ???? accelerometer listener ???????? tracking
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

        String queueLabel = todayQueueNo > 0 ? " ???" + todayQueueNo : "";
        Notification n = buildNotification("????????????? GPS... [" + queueId + queueLabel + "]", pi);
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
        // ? ??? accelerometer listener ??????? tracking
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

    // ===== AlarmManager Restart ?????? Honor/Huawei/Samsung =====
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
            // fallback: restart ????
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
        // ???????????? kill ????????
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
            updateNotification("?????? " + batteryLevel + "% - ?????????????????????????????");
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
        // ??? ??????? NPE: ????? fusedClient ?????????????? (?????????????????? ????? onCreate() ????????????
        // ????????????? ???? HONOR/Magic OS ?? lifecycle ?????????? ????????????????????)
        if (fusedClient == null) {
            Log.w(TAG, "configureLocationRequests: fusedClient ???? null ? ?????????");
            fusedClient = LocationServices.getFusedLocationProviderClient(this);
        }
        refreshBatteryState(true);
        long intervalMs;
        int priority;

        // ===== ????? priority ?????????????? =====
        // ???????????? (???? wakeTime / ???? endTime) ? Network location ??????????
        // ???? warm-up (wakeTime ? startTime) ? HIGH_ACCURACY ?????? GPS ????????
        // ????????? (startTime ? endTime) ? HIGH_ACCURACY ???? ????????? GPS chip ????
        boolean inWorking     = isInWorkingHours();
        boolean inWarmUp      = isInWarmUp();
        boolean useHighAccuracy = inWorking || inWarmUp; // ???????????????????????????? network

        if (MODE_MOVING.equals(trackingMode)) {
            intervalMs = batteryLow ? 5000 : MOVING_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else if (MODE_SLOW.equals(trackingMode)) {
            intervalMs = batteryLow ? SLOW_LOW_BATTERY_MS : SLOW_INTERVAL_MS;
            priority   = Priority.PRIORITY_HIGH_ACCURACY;
        } else if (MODE_LONG_STOPPED.equals(trackingMode)) {
            intervalMs = LONG_STOPPED_MS;
            priority   = useHighAccuracy ? Priority.PRIORITY_HIGH_ACCURACY
                                         : Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        } else {
            intervalMs = batteryLow ? STOPPED_LOW_BATT_MS : STOPPED_INTERVAL_MS;
            priority   = useHighAccuracy ? Priority.PRIORITY_HIGH_ACCURACY
                                         : Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        }
        if (!force && intervalMs == currentGpsRequestMs) return;
        currentGpsRequestMs = intervalMs;
        currentNetRequestMs = intervalMs;
        try {
            fusedClient.removeLocationUpdates(fusedCallback);

            // ? Network fallback request ? ?????????????? ???????????? ????? GPS fix
            // ???????? "GPS ??? 17 ???????" ??????????????????/???????????
            LocationRequest netReq = new LocationRequest.Builder(
                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, intervalMs)
                    .setMinUpdateIntervalMillis(intervalMs / 2)
                    .setMaxUpdateDelayMillis(intervalMs)
                    .setWaitForAccurateLocation(false)
                    .build();
            fusedClient.requestLocationUpdates(netReq, fusedCallback, Looper.getMainLooper());

            // ? GPS high-accuracy request ? ?????????? ?? override network location ????? fix ???
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
        if (!remoteEnabled) return; // ? ?????????????? admin
        refreshBatteryState(true);
        if (gpsErrorMessage != null && latestLocation == null) {
            writeData(buildStatusData(null, true, "gps_error", gpsErrorMessage), null, false); return;
        }
        if (latestLocation == null) {
            // ? DR fallback: ??????????? GPS ??? dead reckoning ????????? ? ??? DR location ???
            Location drLoc = getDeadReckoningLocation();
            if (drLoc != null) {
                Log.d(TAG, "sendHeartbeat: using dead reckoning location (no GPS yet)");
                writeData(buildData(drLoc, false), drLoc, false);
                return;
            }
            recordStatus("online / locating");
            updateNotification("???????? GPS... [" + queueId + "]");
            writeData(buildStatusData(null, true, "locating", null), null, false); return;
        }
        updateTrackingMode(latestLocation);
        if (MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode)) {
            // ? ????????????? + ??????? GPS ??????????? ? ???????? GPS ????????? (?????? network)
            // ????????? "????????????" ?????????????????? ????????????????????????
            if (isInWorkingHours() && lastGpsFixLocation != null) {
                Map<String, Object> d = buildData(lastGpsFixLocation, false);
                d.put("stopped", true); // flag ??????????????? ???????????????????
                writeData(d, null, false);
            } else {
                writeData(buildHeartbeatData(trackingMode, latestLocation), null, false);
            }
        } else {
            writeData(buildData(latestLocation, true), latestLocation, true);
        }
    }

    private void sendLocationUpdate(Location loc) {
        if (!running || loc == null) return;
        gpsErrorMessage = null;
        refreshBatteryState(true);
        long now = System.currentTimeMillis();

        // Speed-based wake: ?????????????????????? (speed > 2 ??./??.) ? force send ?????
        // ??????? marker ?????????????????????????????
        boolean justStartedMoving =
            (MODE_STOPPED.equals(trackingMode) || MODE_LONG_STOPPED.equals(trackingMode))
            && speedKmh(loc) > 2f;
        if (justStartedMoving) {
            forceNextLocationSend = true;
            Log.d(TAG, "speed-based wake: speed=" + speedKmh(loc) + " km/h, forcing send");
        }

        // ? DR bridge: ??????????? GPS > 2 ?? ??? DR active ? ??? DR location ???
        // ??????? marker ????????????????????? passenger.html ??? GPS packet ????????
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
                // ? ?????: ????? reconnect ??? set online:true ????? ???? setupDisconnectHandlers
                // ??????? onDisconnect handler ????????? passenger ???? online:false
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
            // ? ?????: ??? 0 ??? null ?????????? speed/heading ? ??????? Firebase null value warning
            data.put("speed",   loc.hasSpeed()   ? Math.round(loc.getSpeed() * 3.6f) : 0);
            data.put("heading", loc.hasBearing() ? loc.getBearing() : 0f);
            data.put("stopIdx", nearestStopIndex(loc.getLatitude(), loc.getLongitude()));
        }
        if (loc != null) {
            // ? ?????: ??? accuracy ???? (?????????????? 999 = unknown) ??????? field ???
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
        ch.setDescription("????????????????????? real-time");
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

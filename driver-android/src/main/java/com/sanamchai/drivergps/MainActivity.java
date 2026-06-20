package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.text.style.ForegroundColorSpan;
import android.os.BatteryManager;
import java.util.Map;

public class MainActivity extends Activity {
    static final String PREFS = "driver_gps";
    static final String KEY_ENABLED = "tracking_enabled";
    static final String KEY_LAST_STATUS = "last_status";
    static final String KEY_LAST_SENT = "last_sent";
    static final String KEY_LAST_COORDS = "last_coords";
    static final String KEY_LAST_ERROR = "last_error";
    static final String KEY_VEHICLE_ID = "vehicle_id";
    static final String KEY_BATTERY_PROMPTED  = "battery_prompted";
    static final String KEY_LAST_RESTART      = "last_restart";
    static final String KEY_RESTART_COUNT     = "restart_count";
    static final String KEY_LAST_GPS_AT       = "last_gps_at";
    static final String KEY_TODAY_QUEUE       = "today_queue_label";
    static final String KEY_FIREBASE_STATUS   = "firebase_status";

    private static final String DB_URL = "https://bus-booking-1d68c-default-rtdb.firebaseio.com";
    private static final String ST_TRANSIT_PHONE = "0XXXXXXXXX"; // TODO: ใส่เบอร์สำนักงาน ST Transit จริง

    // ===== S.L.Transit Theme =====
    private static final int COLOR_NAVY       = Color.parseColor("#0B1D3A");
    private static final int COLOR_OCEAN      = Color.parseColor("#123A63");
    private static final int COLOR_TEAL       = Color.parseColor("#00A7B5");
    private static final int COLOR_LIGHT_TEAL = Color.parseColor("#4DD3D9");
    private static final int COLOR_ORANGE     = Color.parseColor("#FF8A00");
    // ===== ธีมใหม่: พื้นหลังขาว (ข้อ 1) =====
    private static final int COLOR_BG_PAGE    = Color.parseColor("#F4F7FA");
    private static final int COLOR_TEXT_MUTED = Color.rgb(100, 116, 139);
    private static final int COLOR_GREEN      = Color.rgb(22, 163, 74);
    private static final int COLOR_RED        = Color.rgb(220, 38, 38);
    static final String KEY_DIAG_VISIBLE = "diag_visible";
    static final String KEY_SERVICE_STATUS = "service_status"; // "available" | "unavailable" — ข้อ 3
    // ===== OSRM road-routing สำหรับ ETA ตามเส้นทางจริง (ข้อ 6.2) =====
    private static final String OSRM_BASE = "https://router.project-osrm.org/route/v1/driving/";

    private static final String[] VEHICLE_IDS = {
        "car1", "car2", "car3", "car4", "car5"
    };

    private SharedPreferences prefs;
    private Button mainButton;
    private TextView vehiclePickerText;
    private TextView coordsText;
    private TextView statusBadge;
    private TextView sentTimeText;
    private TextView errorText;
    private TextView diagPanel;
    private TextView notifBell;
    private TextView notifCountBubble;
    private TextView versionLabel;
    private TextView summaryBookedCount;
    private TextView summaryCheckedCount;
    private TextView summaryPendingCount;
    private LinearLayout onlinePill;
    private TextView onlineDot;
    private TextView onlineLabel;
    private boolean diagVisible;
    private int unreadNotifCount = 0;
    private final java.util.List<String> notifMessages = new ArrayList<>();

    // ===== ข้อ 3: การ์ดคิว/เส้นทาง/รอบถัดไป + สถานะให้บริการ =====
    private TextView queueValueText;
    private TextView routeValueText;
    private TextView nextRoundValueText;
    private LinearLayout serviceStatusPill;
    private TextView serviceStatusLabel;
    private boolean serviceAvailable = true;
    private Boolean testMode = null;

    // ===== ข้อมูลจริงจากตารางคิว/ป้าย/เวลา (Firebase: routeData/stops, routeData/queues) =====
    private final Map<String, double[]> stopCoordsCache = new HashMap<>();
    private final Map<String, String> stopNameCache = new HashMap<>();
    private boolean stopsCacheLoaded = false;
    private final java.util.List<Trip> cachedTrips = new ArrayList<>();
    private Trip activeTrip = null;

    // โครงสร้างป้ายภายใน 1 รอบ (trip) ของคิวนั้นๆ
    private static class TripStop {
        String stopKey, stopTh, time, eventType;
        boolean isConditional;
        TripStop(String stopKey, String stopTh, String time, String eventType, boolean isConditional) {
            this.stopKey = stopKey; this.stopTh = stopTh; this.time = time;
            this.eventType = eventType; this.isConditional = isConditional;
        }
    }
    // โครงสร้าง 1 รอบ (trip) — ไป/กลับ 1 เที่ยว พร้อมลำดับป้ายทั้งหมด
    private static class Trip {
        String tripNo, direction, routeKey, routeNameTh;
        java.util.List<TripStop> stops = new ArrayList<>();
        int firstMinuteOfDay() { return toMinutes(stops.get(0).time); }
        int lastMinuteOfDay() { return toMinutes(stops.get(stops.size() - 1).time); }
        static int toMinutes(String hhmm) {
            try {
                String[] p = hhmm.split(":");
                return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
            } catch (Exception e) { return -1; }
        }
    }

    // ===== ข้อ 6.1: การ์ดความพร้อมการเดินทาง (เช็ค GPS + Firebase) =====
    private TextView readinessBadge;
    private TextView readinessReasonText;

    // ===== ข้อ 6.2: ป้ายตำแหน่งปัจจุบัน/จุดหมายถัดไป + เวลาโดยประมาณ =====
    private TextView currentStopLabel;
    private TextView nextStopLabel;
    private TextView etaText;
    private LinearLayout travelCard;
    private double[] nextStopCoords = null;
    private String lastEtaKey = ""; // กันยิง OSRM ซ้ำถ้าตำแหน่งไม่เปลี่ยน

    // ===== ข้อ 5: ปุ่ม "เริ่มงาน/หยุดงาน" แบบไอคอนในตาราง action =====
    private LinearLayout startWorkButton;
    private TextView startWorkIcon;
    private TextView startWorkLabel;
    private GradientDrawable startWorkIconBg;

    // ===== ข้อ 8: Bottom Navigation =====
    private static final String[] NAV_LABELS = {"หน้าหลัก", "รายงานวันนี้", "รายงาน", "แจ้งเตือน", "บัญชี"};
    private static final String[] NAV_ICONS  = {"🏠", "📋", "📊", "🔔", "👤"};
    private static final int COLOR_DEEP_NAVY = Color.parseColor("#0B1D3A");
    private FrameLayout contentContainer;
    private ScrollView homeScroll;
    private final LinearLayout[] navTabs = new LinearLayout[NAV_LABELS.length];
    private final TextView[] navTabIcons = new TextView[NAV_LABELS.length];
    private final TextView[] navTabLabels = new TextView[NAV_LABELS.length];
    private int currentNavIndex = 0;

    private String lastCoords = "";
    private String lastStatus = "";

    // auto-refresh สำหรับหน้า diagnostic
    private final Handler diagHandler = new Handler(Looper.getMainLooper());
    private Runnable diagRefreshRunnable;

    // Firebase สำหรับตรวจสอบสถานะรถ
    private DatabaseReference liveVehiclesRef;
    private final Map<String, Boolean> vehicleOnlineMap = new HashMap<>();

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private int uiTickCount = 0;
    private boolean serviceTransitionInProgress = false;
    private static final long SERVICE_TRANSITION_LOCK_MS = 2000;
    private final Runnable uiTick = new Runnable() {
        @Override public void run() {
            refreshUi();
            uiTickCount++;
            if (uiTickCount % 60 == 0) refreshTodaySchedule(); // รีเฟรชคิว/เส้นทาง ทุก 60 วินาที
            uiHandler.postDelayed(this, 1000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        serviceAvailable = !"unavailable".equals(prefs.getString(KEY_SERVICE_STATUS, "available"));
        if (prefs.getString(KEY_VEHICLE_ID, null) == null) {
            // ติดตั้งใหม่ — ยังไม่เลือกรถ ไม่ default เป็น car1
            autoSelectAvailableVehicle();
        }
        initFirebaseListener();
        buildUi();
        loadTestModeSetting();
        // ถ้า Service วิ่งอยู่แล้ว (ปิด app แล้วเปิดใหม่) — ไม่ต้อง start ซ้ำ
        // การ start ซ้ำทำให้ Firebase goOffline/goOnline กลางอากาศ → connection ค้าง
        if (prefs.getBoolean(KEY_ENABLED, false)) {
            refreshUi();
        } else {
            requestPermissionsThenStart();
        }
        uiHandler.post(uiTick);
        checkForUpdate();
        reportVersionToFirebase();
        refreshTodaySchedule();
    }

    // ===== เลือก car ที่ว่างอัตโนมัติตอนติดตั้งใหม่ =====
    private void autoSelectAvailableVehicle() {
        long staleMs = 30 * 60 * 1000; // ถือว่า "ว่าง" ถ้าไม่มีการส่งสัญญาณนานกว่า 30 นาที
        long now = System.currentTimeMillis();
        FirebaseDatabase.getInstance().getReference("liveVehicles")
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                for (String id : VEHICLE_IDS) {
                    DataSnapshot v = snap.child(id);
                    boolean online = Boolean.TRUE.equals(v.child("online").getValue(Boolean.class));
                    Long ts = v.child("sentTs").getValue(Long.class);
                    boolean recentlyActive = ts != null && (now - ts) < staleMs;
                    if (!online && !recentlyActive) {
                        // เจอ car ที่ว่าง — ตั้งค่าและอัพเดท UI
                        prefs.edit().putString(KEY_VEHICLE_ID, id).apply();
                        runOnUiThread(() -> {
                            if (vehiclePickerText != null)
                                vehiclePickerText.setText(id + "\n▾");
                            if (versionLabel != null)
                                versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + id + ")");
                            refreshTodaySchedule();
                        });
                        return;
                    }
                }
                // ถ้าทุก car ถูกใช้อยู่ — คง car1 ไว้แต่แสดงเตือน
                runOnUiThread(() -> {
                    if (vehiclePickerText != null)
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("⚠️ รถทุกคันถูกใช้งานอยู่")
                                .setMessage("กรุณาเลือกรหัสรถด้วยตนเอง")
                                .setPositiveButton("ตกลง", null).show();
                });
            }
            @Override public void onCancelled(DatabaseError e) {}
        });
    }


    private void reportVersionToFirebase() {
        try {
            String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
            Map<String, Object> data = new HashMap<>();
            data.put("appVersionCode", BuildConfig.VERSION_CODE);
            data.put("appVersionName", BuildConfig.VERSION_NAME);
            data.put("lastOpenAt", System.currentTimeMillis());
            FirebaseDatabase.getInstance()
                    .getReference("settings/vehicles/" + vehicleId)
                    .updateChildren(data);
        } catch (Exception ignored) {}
    }

    @Override protected void onDestroy() {
        uiHandler.removeCallbacks(uiTick);
        super.onDestroy();
    }

    // ---- เชื่อม Firebase ฟัง online status ของทุกคัน ----
    private void initFirebaseListener() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                        .setApiKey("AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw")
                        .setApplicationId("1:481251007816:web:d8554178d954e7de16e77d")
                        .setDatabaseUrl(DB_URL)
                        .setProjectId("bus-booking-1d68c")
                        .build();
                FirebaseApp.initializeApp(this, options);
            }
            liveVehiclesRef = FirebaseDatabase.getInstance().getReference("liveVehicles");
            liveVehiclesRef.addValueEventListener(new ValueEventListener() {
                @Override public void onDataChange(DataSnapshot snapshot) {
                    vehicleOnlineMap.clear();
                    for (DataSnapshot child : snapshot.getChildren()) {
                        Object onlineVal = child.child("online").getValue();
                        boolean online = Boolean.TRUE.equals(onlineVal);
                        vehicleOnlineMap.put(child.getKey(), online);
                    }
                }
                @Override public void onCancelled(DatabaseError error) {}
            });
        } catch (Exception e) {
            // Firebase init ล้มเหลว ปล่อยให้ใช้งานได้ปกติ
        }
    }

    // ===== ตรวจสอบเวอร์ชันแอพใหม่จาก Firebase และอัพเดทอัตโนมัติ =====
    private void checkForUpdate() {
        try {
            DatabaseReference ref = FirebaseDatabase.getInstance().getReference("settings/appUpdate");
            ref.addListenerForSingleValueEvent(new ValueEventListener() {
                @Override public void onDataChange(DataSnapshot snapshot) {
                    if (!snapshot.exists()) return;
                    Long latest = snapshot.child("versionCode").getValue(Long.class);
                    String apkUrl = snapshot.child("apkUrl").getValue(String.class);
                    String note = snapshot.child("note").getValue(String.class);
                    if (latest == null || apkUrl == null || apkUrl.isEmpty()) return;
                    if (latest > BuildConfig.VERSION_CODE) {
                        addNotification("✨ มีแอพเวอร์ชันใหม่ (v" + latest + ") — แตะเพื่ออัพเดท");
                        showUpdateDialog(apkUrl, note);
                    }
                }
                @Override public void onCancelled(DatabaseError error) {}
            });
        } catch (Exception ignored) {}
    }

    // ===== ระบบแจ้งเตือนแบบกระดิ่ง (ไม่หาย แสดงตัวเลขค้างไว้เหมือน Facebook) =====
    private void addNotification(String message) {
        // ลบข้อความเดิมที่ซ้ำออกก่อน แล้วเพิ่มใหม่ไว้บนสุด — ทำให้ปัญหาที่หายแล้วกลับมาเกิดซ้ำ
        // จะถูกแจ้งเตือนใหม่อีกครั้งแทนที่จะถูกกันซ้ำตลอดไป
        notifMessages.remove(message);
        notifMessages.add(0, message);
        if (notifMessages.size() > 20) notifMessages.remove(notifMessages.size() - 1);
        unreadNotifCount++;
        updateNotifBubble();
    }

    private void updateNotifBubble() {
        if (notifCountBubble == null) return;
        runOnUiThread(() -> {
            if (unreadNotifCount <= 0) {
                notifCountBubble.setVisibility(android.view.View.GONE);
            } else {
                notifCountBubble.setVisibility(android.view.View.VISIBLE);
                notifCountBubble.setText(unreadNotifCount > 9 ? "9+" : String.valueOf(unreadNotifCount));
            }
        });
    }

    private void showNotificationCenter() {
        unreadNotifCount = 0;
        updateNotifBubble();
        String msg = notifMessages.isEmpty() ? "ไม่มีการแจ้งเตือน" : String.join("\n\n", notifMessages);
        new AlertDialog.Builder(this)
                .setTitle("🔔 การแจ้งเตือน")
                .setMessage(msg)
                .setPositiveButton("ปิด", null)
                .show();
    }

    private void showUpdateDialog(String apkUrl, String note) {
        if (isFinishing()) return;
        String message = "มีแอพเวอร์ชันใหม่ กรุณาอัพเดทเพื่อให้ระบบทำงานได้ถูกต้อง"
                + (note != null && !note.isEmpty() ? "\n\nรายละเอียด: " + note : "");
        new AlertDialog.Builder(this)
                .setTitle("\u2728 มีอัพเดทใหม่")
                .setMessage(message)
                .setCancelable(false)
                .setPositiveButton("ดาวน์โหลดและติดตั้ง", (d, w) -> downloadAndInstallApk(apkUrl))
                .setNegativeButton("ภายหลัง", null)
                .show();
    }

    private void downloadAndInstallApk(String apkUrl) {
        try {
            File outFile = new File(getExternalFilesDir("Download"), "driver-update.apk");
            if (outFile.exists()) outFile.delete();

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("กำลังอัพเดทแอพคนขับ");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationUri(Uri.fromFile(outFile));
            request.setMimeType("application/vnd.android.package-archive");

            final long downloadId = dm.enqueue(request);

            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != downloadId) return;
                    try { unregisterReceiver(this); } catch (Exception ignored) {}
                    installApk(outFile);
                }
            };
            ContextCompat.registerReceiver(this, receiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    ContextCompat.RECEIVER_EXPORTED);
        } catch (Exception e) {
            new AlertDialog.Builder(this)
                    .setTitle("ดาวน์โหลดไม่สำเร็จ")
                    .setMessage(e.getMessage())
                    .setPositiveButton("ตกลง", null).show();
        }
    }

    // ===== ช่องตัวเลขในแถบสรุปผู้โดยสาร (ไอคอนวงกลมสี + จำนวน + ป้ายชื่อ) บนพื้นการ์ดสีขาว =====
    private LinearLayout buildSummaryColumn(String icon, TextView countView, String label, int accentColor) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);

        TextView iconView = new TextView(this);
        iconView.setText(icon);
        iconView.setTextSize(16);
        iconView.setGravity(Gravity.CENTER);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(Color.argb(28, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)));
        iconView.setBackground(iconBg);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(34), dp(34));
        col.addView(iconView, iconLp);

        countView.setText("0");
        countView.setTextColor(COLOR_NAVY);
        countView.setTextSize(20);
        countView.setTypeface(Typeface.DEFAULT_BOLD);
        countView.setGravity(Gravity.CENTER);
        countView.setPadding(0, dp(6), 0, 0);
        col.addView(countView);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.rgb(100, 116, 139));
        labelView.setTextSize(10);
        labelView.setGravity(Gravity.CENTER);
        col.addView(labelView);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        col.setLayoutParams(lp);
        return col;
    }

    private android.view.View buildSummaryDivider() {
        android.view.View div = new android.view.View(this);
        div.setBackgroundColor(Color.rgb(226, 232, 240));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(1), dp(40));
        lp.setMargins(dp(4), 0, dp(4), 0);
        div.setLayoutParams(lp);
        return div;
    }

    private void loadTestModeSetting() {
        FirebaseDatabase.getInstance().getReference("settings/testMode")
                .addValueEventListener(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                testMode = Boolean.TRUE.equals(snap.getValue(Boolean.class));
                refreshPassengerSummary();
            }
            @Override public void onCancelled(DatabaseError error) {
                testMode = null;
            }
        });
    }

    private String bookingsPath() {
        if (testMode == null) return null;
        return testMode ? "testBookings" : "bookings";
    }

    private boolean bookingBelongsToVehicle(DataSnapshot booking, String vehicleId) {
        if (booking == null || vehicleId == null || vehicleId.isEmpty()) return false;
        if (Boolean.TRUE.equals(booking.child("scheduleOnly").getValue(Boolean.class))
                || Boolean.TRUE.equals(booking.child("noLiveTracking").getValue(Boolean.class))) return false;
        String plannedVehicleId = booking.child("plannedVehicleId").getValue(String.class);
        return vehicleId.equals(plannedVehicleId);
    }
    private void loadBookingsForDate(String date, ValueEventListener listener) {
        DatabaseReference ref = FirebaseDatabase.getInstance().getReference(bookingsPath());
        if (Boolean.TRUE.equals(testMode)) {
            ref.addListenerForSingleValueEvent(listener);
        } else {
            ref.orderByChild("date").equalTo(date).addListenerForSingleValueEvent(listener);
        }
    }
    // ===== ดึงยอดผู้โดยสารวันนี้: จอง / เช็คอินแล้ว / ยังไม่มาเช็คอิน =====
    private void refreshPassengerSummary() {
        String bookingPath = bookingsPath();
        if (bookingPath == null) return;
        final String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        loadBookingsForDate(today, new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                int booked = 0;
                int checkedIn = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String bookingDate = child.child("date").getValue(String.class);
                    if (!today.equals(bookingDate)) continue;
                    String status = String.valueOf(child.child("status").getValue());
                    if ("cancelled".equals(status)) continue;
                    if (!bookingBelongsToVehicle(child, vehicleId)) continue;
                    booked++;
                    String checkinStatus = String.valueOf(child.child("originCheckin").child("status").getValue());
                    if ("boarded".equals(checkinStatus)) checkedIn++;
                }
                int pending = Math.max(0, booked - checkedIn);
                if (summaryBookedCount != null) summaryBookedCount.setText(String.valueOf(booked));
                if (summaryCheckedCount != null) summaryCheckedCount.setText(String.valueOf(checkedIn));
                if (summaryPendingCount != null) summaryPendingCount.setText(String.valueOf(pending));
            }
            @Override public void onCancelled(DatabaseError error) {}
        });
    }

    // ===== ข้อ 3: ดึงข้อมูลจริงจาก routeData/stops + routeData/queues/{คิว}/trips =====
    // โครงสร้างที่ใช้ (มาจากตาราง Excel ที่พี่ทำ — import เป็น JSON ตามที่ผมส่งให้):
    //   routeData/stops/{stopKey}            = { name, lat, lng, type, bookingEnabled, note }
    //   routeData/queues/{คิว}/trips/{tripNo} = { direction, routeKey, routeNameTh, stops: [{order, stopKey, stopTh, time, eventType, isConditional, note}, ...] }
    private void fetchStopsCacheIfNeeded(Runnable then) {
        if (stopsCacheLoaded) { if (then != null) then.run(); return; }
        FirebaseDatabase.getInstance().getReference("routeData/stops")
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                for (DataSnapshot s : snap.getChildren()) {
                    String key = s.getKey();
                    Double lat = s.child("lat").getValue(Double.class);
                    Double lng = s.child("lng").getValue(Double.class);
                    if (key != null && lat != null && lng != null) {
                        stopCoordsCache.put(key, new double[]{lat, lng});
                        stopNameCache.put(key, strOrDash(s.child("name").getValue()));
                    }
                }
                stopsCacheLoaded = true;
                if (then != null) runOnUiThread(then);
            }
            @Override public void onCancelled(DatabaseError error) { if (then != null) runOnUiThread(then); }
        });
    }

    private void refreshTodaySchedule() {
        final String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        if (vehicleId == null) {
            showUnassignedQueue("ยังไม่ได้เลือกรถ");
            return;
        }
        FirebaseDatabase.getInstance().getReference("settings/queueRotation")
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                String baseDate = snap.child("baseDate").getValue(String.class);
                if (baseDate == null || !baseDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    baseDate = "2026-06-14";
                }
                Long configuredBaseQueue = snap.child("carQueueOnBaseDate")
                        .child(vehicleId).getValue(Long.class);
                int baseQueue = configuredBaseQueue != null
                        ? configuredBaseQueue.intValue()
                        : fallbackBaseQueue(vehicleId);
                loadTodayScheduleForQueue(vehicleId, calculateTodayQueue(baseDate, baseQueue));
            }
            @Override public void onCancelled(DatabaseError error) {
                loadTodayScheduleForQueue(vehicleId,
                        calculateTodayQueue("2026-06-14", fallbackBaseQueue(vehicleId)));
            }
        });
    }

    private int fallbackBaseQueue(String vehicleId) {
        if ("car1".equals(vehicleId)) return 1;
        if ("car2".equals(vehicleId)) return 2;
        if ("car3".equals(vehicleId)) return 3;
        if ("car4".equals(vehicleId)) return 4;
        return -1;
    }

    private int calculateTodayQueue(String baseDate, int baseQueue) {
        if (baseQueue < 1 || baseQueue > 4) return -1;
        try {
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat(
                    "yyyy-MM-dd", java.util.Locale.US);
            java.util.Date base = sdf.parse(baseDate);
            java.util.Date today = sdf.parse(sdf.format(new java.util.Date()));
            if (base == null || today == null) return baseQueue;
            int diffDays = (int) ((today.getTime() - base.getTime()) / 86400000L);
            return ((baseQueue - 1 + diffDays) % 4 + 4) % 4 + 1;
        } catch (Exception e) {
            return baseQueue;
        }
    }

    private void showUnassignedQueue(String message) {
        runOnUiThread(() -> {
            cachedTrips.clear();
            activeTrip = null;
            if (queueValueText != null) queueValueText.setText("ยังไม่มีคิว");
            if (routeValueText != null) routeValueText.setText(message);
            if (nextRoundValueText != null) nextRoundValueText.setText("—");
        });
    }

    private void loadTodayScheduleForQueue(String vehicleId, int queueNo) {
        if (queueNo < 1 || queueNo > 4) {
            showUnassignedQueue("ยังไม่ได้กำหนดคิวให้ " + vehicleId);
            return;
        }
        fetchStopsCacheIfNeeded(null);
        FirebaseDatabase.getInstance().getReference("routeData/queues/" + queueNo + "/trips")
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                if (!vehicleId.equals(prefs.getString(KEY_VEHICLE_ID, null))) return;
                java.util.List<Trip> trips = new ArrayList<>();
                for (DataSnapshot tripSnap : snap.getChildren()) {
                    Trip trip = new Trip();
                    trip.tripNo = tripSnap.getKey();
                    trip.direction = strOrDash(tripSnap.child("direction").getValue());
                    trip.routeKey = strOrDash(tripSnap.child("routeKey").getValue());
                    trip.routeNameTh = strOrDash(tripSnap.child("routeNameTh").getValue());
                    for (DataSnapshot stopSnap : tripSnap.child("stops").getChildren()) {
                        trip.stops.add(new TripStop(
                                strOrDash(stopSnap.child("stopKey").getValue()),
                                strOrDash(stopSnap.child("stopTh").getValue()),
                                strOrDash(stopSnap.child("time").getValue()),
                                strOrDash(stopSnap.child("eventType").getValue()),
                                Boolean.TRUE.equals(stopSnap.child("isConditional").getValue(Boolean.class))));
                    }
                    if (!trip.stops.isEmpty()) trips.add(trip);
                }
                Collections.sort(trips, (a, b) -> {
                    try { return Integer.parseInt(a.tripNo) - Integer.parseInt(b.tripNo); }
                    catch (Exception e) { return 0; }
                });
                runOnUiThread(() -> {
                    cachedTrips.clear();
                    cachedTrips.addAll(trips);
                    computeActiveTripAndUpdateCard(String.valueOf(queueNo));
                });
            }
            @Override public void onCancelled(DatabaseError error) {
                showUnassignedQueue("โหลดตารางคิวไม่สำเร็จ");
            }
        });
    }

    // หาว่า "ตอนนี้" อยู่ในรอบ (trip) ไหนของคิวที่เลือก โดยเทียบกับเวลานาฬิกาจริง
    private void computeActiveTripAndUpdateCard(String queueNo) {
        if (queueValueText != null) queueValueText.setText("คิว " + queueNo);
        if (cachedTrips.isEmpty()) {
            if (routeValueText != null) routeValueText.setText("ยังไม่มีข้อมูลเที่ยววิ่งของคิวนี้");
            if (nextRoundValueText != null) nextRoundValueText.setText("—");
            activeTrip = null;
            return;
        }
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int nowMin = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);

        Trip current = null, next = null;
        for (int i = 0; i < cachedTrips.size(); i++) {
            Trip t = cachedTrips.get(i);
            int first = t.firstMinuteOfDay(), last = t.lastMinuteOfDay();
            if (first < 0 || last < 0) continue;
            if (nowMin >= first && nowMin <= last) {
                current = t;
                next = (i + 1 < cachedTrips.size()) ? cachedTrips.get(i + 1) : null;
                break;
            }
            if (nowMin < first) { next = t; break; }
        }
        activeTrip = current;
        if (routeValueText != null) {
            if (current != null) routeValueText.setText(current.routeNameTh);
            else routeValueText.setText(next != null ? "รอรอบถัดไป" : "หมดรอบวันนี้แล้ว");
        }
        if (nextRoundValueText != null) {
            if (next != null) {
                TripStop firstStop = next.stops.get(0);
                nextRoundValueText.setText(firstStop.time + " น.  (" + next.routeNameTh + ")");
            } else {
                nextRoundValueText.setText("หมดรอบวันนี้แล้ว");
            }
        }
    }

    private String strOrDash(Object v) {
        if (v == null) return "—";
        String s = String.valueOf(v);
        return (s.isEmpty() || s.equals("null")) ? "—" : s;
    }

    // ===== ข้อ 3: แตะเปลี่ยนสถานะ "กำลังให้บริการ / ไม่ให้บริการ" =====
    private void showServiceStatusDialog() {
        String[] options = {"🟢 กำลังให้บริการ", "⚪ ไม่ให้บริการ (หยุดชั่วคราว)"};
        int current = serviceAvailable ? 0 : 1;
        new AlertDialog.Builder(this)
                .setTitle("สถานะให้บริการ")
                .setSingleChoiceItems(options, current, (d, which) -> {
                    setServiceAvailable(which == 0);
                    d.dismiss();
                })
                .setNegativeButton("ปิด", null).show();
    }

    private void setServiceAvailable(boolean available) {
        serviceAvailable = available;
        prefs.edit().putString(KEY_SERVICE_STATUS, available ? "available" : "unavailable").apply();
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        // เขียนขึ้น liveVehicles ด้วย เพื่อให้แผนที่ผู้โดยสารรู้ว่ารถนี้ไม่พร้อมรับ แม้ GPS ยังส่งอยู่
        FirebaseDatabase.getInstance().getReference("liveVehicles/" + vehicleId + "/serviceStatus")
                .setValue(available ? "available" : "unavailable");
        updateServiceStatusPill();
    }

    private void updateServiceStatusPill() {
        if (serviceStatusPill == null) return;
        int color = serviceAvailable ? COLOR_GREEN : COLOR_TEXT_MUTED;
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.argb(28, Color.red(color), Color.green(color), Color.blue(color)));
        bg.setCornerRadius(dp(20));
        serviceStatusPill.setBackground(bg);
        serviceStatusLabel.setTextColor(color);
        serviceStatusLabel.setText(serviceAvailable ? "● กำลังให้บริการ" : "● ไม่ให้บริการ");
    }

    // ===== ข้อ 6.1: "การเดินทางปัจจุบัน" พร้อม/ไม่พร้อม — อิงสถานะ GPS + Firebase เดียวกับ diagnostic =====
    private void updateReadinessCard(long gpsAgoSec, long fbAgoSec) {
        if (readinessBadge == null) return;
        boolean gpsOk = gpsAgoSec >= 0 && gpsAgoSec < 30;
        boolean fbOk  = fbAgoSec  >= 0 && fbAgoSec  < 30;
        boolean ready = gpsOk && fbOk;
        readinessBadge.setText(ready ? "ออนไลน์" : "ออฟไลน์");
        readinessBadge.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(ready ? COLOR_GREEN : COLOR_RED);
        bg.setCornerRadius(dp(14));
        readinessBadge.setBackground(bg);

        if (ready) {
            readinessReasonText.setVisibility(android.view.View.GONE);
        } else {
            String reason = !gpsOk ? "สัญญาณ GPS อ่อนหรือขาดหาย" : "การเชื่อมต่อ Firebase ช้าหรือขาดหาย";
            readinessReasonText.setText(reason);
            readinessReasonText.setVisibility(android.view.View.VISIBLE);
        }
    }

    // ===== ข้อ 6.2: ป้ายตำแหน่งปัจจุบัน/จุดหมายถัดไป + ETA ตามเส้นทางจริง (OSRM) — ใช้ป้าย/พิกัดจริงจาก activeTrip =====
    private void refreshRouteProgress() {
        if (currentStopLabel == null) return;
        String coords = prefs.getString(KEY_LAST_COORDS, "");
        if (coords.isEmpty() || !coords.contains(",")) return;
        double lat, lng;
        try {
            String[] parts = coords.split(",");
            lat = Double.parseDouble(parts[0].trim());
            lng = Double.parseDouble(parts[1].trim());
        } catch (Exception e) { return; }

        if (activeTrip == null || activeTrip.stops.isEmpty() || !stopsCacheLoaded) {
            currentStopLabel.setText("—");
            nextStopLabel.setText("—");
            return;
        }

        java.util.List<TripStop> stops = activeTrip.stops;
        int passedIdx = 0;
        double best = Double.MAX_VALUE;
        for (int i = 0; i < stops.size(); i++) {
            double[] c = stopCoordsCache.get(stops.get(i).stopKey);
            if (c == null) continue;
            double d = haversineMeters(lat, lng, c[0], c[1]);
            if (d < best) { best = d; passedIdx = i; }
        }
        int nextIdx = Math.min(passedIdx + 1, stops.size() - 1);
        currentStopLabel.setText(stops.get(passedIdx).stopTh);
        nextStopLabel.setText(stops.get(nextIdx).stopTh);

        if (nextIdx != passedIdx) {
            double[] dest = stopCoordsCache.get(stops.get(nextIdx).stopKey);
            if (dest != null) {
                nextStopCoords = dest;
                String etaKey = lat + "," + lng + "->" + dest[0] + "," + dest[1];
                if (!etaKey.equals(lastEtaKey)) {
                    lastEtaKey = etaKey;
                    fetchRoadEta(lat, lng, dest[0], dest[1]);
                }
            }
        } else if (etaText != null) {
            etaText.setText("เวลาโดยประมาณถึง : ถึงปลายทางแล้ว");
        }
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // เรียก OSRM (เส้นทางถนนจริง ไม่ใช่เส้นตรง) — รันบน background thread เอง ไม่ใช้ library เพิ่ม
    private void fetchRoadEta(double lat1, double lon1, double lat2, double lon2) {
        new Thread(() -> {
            try {
                String url = OSRM_BASE + lon1 + "," + lat1 + ";" + lon2 + "," + lat2 + "?overview=false";
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                JSONObject root = new JSONObject(sb.toString());
                JSONArray routes = root.getJSONArray("routes");
                double durationSec = routes.getJSONObject(0).getDouble("duration");
                int minutes = Math.max(1, (int) Math.round(durationSec / 60));
                runOnUiThread(() -> {
                    if (etaText != null) etaText.setText("เวลาโดยประมาณถึง : " + minutes + " นาที");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (etaText != null) etaText.setText("เวลาโดยประมาณถึง : —");
                });
            }
        }).start();
    }

    // ===== สร้างปุ่มไอคอน 1 ช่อง (สแกน QR / ผู้โดยสาร / SOS) =====
    // ===== ปุ่มไอคอนสไตล์การ์ดขาว + วงกลมสี (ตามดีไซน์ต้นแบบ) =====
    private LinearLayout buildActionButton(String icon, String label, int accentColor, android.view.View.OnClickListener onClick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(8), dp(12), dp(8), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        box.setBackground(bg);
        box.setElevation(dp(1));
        box.setClickable(true);
        box.setOnClickListener(v -> { animateTap(box); onClick.onClick(v); });

        TextView iconView = new TextView(this);
        iconView.setText(icon);
        iconView.setTextSize(17);
        iconView.setGravity(Gravity.CENTER);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(accentColor);
        iconView.setBackground(iconBg);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        box.addView(iconView, iconLp);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_NAVY);
        labelView.setTextSize(10);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setGravity(Gravity.CENTER);
        labelView.setPadding(0, dp(6), 0, 0);
        box.addView(labelView);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        box.setLayoutParams(lp);
        return box;
    }

    // ===== 3.1) สแกน QR + เช็คอินผู้โดยสาร (เตรียมไว้สำหรับคิดยอดเงินเข้าคนขับในอนาคต) =====
    private void openQrScanner() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 30);
            return;
        }
        IntentIntegrator integrator = new IntentIntegrator(this);
        integrator.setOrientationLocked(false);
        integrator.setBeepEnabled(true);
        integrator.setPrompt("สแกน QR ตั๋วผู้โดยสารเพื่อเช็คอิน");
        integrator.initiateScan();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (result != null && result.getContents() != null) {
            handleScannedTicket(result.getContents().trim());
        }
    }

    private void handleScannedTicket(String code) {
        if (code.isEmpty()) return;
        // รองรับ QR ที่เป็นลิงก์ เช่น https://.../check_ticket.html?code=XXXX
        if (code.contains("code=")) {
            int idx = code.indexOf("code=");
            code = code.substring(idx + 5);
            int amp = code.indexOf('&');
            if (amp >= 0) code = code.substring(0, amp);
        }
        final String finalCode = code.toUpperCase(java.util.Locale.US);
        final String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        final String bookingPath = bookingsPath();
        if (bookingPath == null) {
            new AlertDialog.Builder(this).setTitle("กำลังโหลดโหมดระบบ")
                    .setMessage("กรุณาลองสแกนอีกครั้ง").setPositiveButton("ตกลง", null).show();
            return;
        }

        FirebaseDatabase.getInstance().getReference(bookingPath + "/" + finalCode)
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                if (!snap.exists()) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ไม่พบตั๋ว")
                            .setMessage("ไม่พบรหัสตั๋ว: " + finalCode)
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                if (!bookingBelongsToVehicle(snap, vehicleId)) {
                    String planned = snap.child("plannedVehicleId").getValue(String.class);
                    String detail = (planned == null || planned.isEmpty())
                            ? "ตั๋วนี้ไม่มีรถสำหรับติดตามสด"
                            : "ตั๋วนี้กำหนดให้ " + planned + " ไม่ใช่ " + vehicleId;
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("รถไม่ตรงกับตั๋ว")
                            .setMessage(detail)
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                String checkinStatus = String.valueOf(snap.child("originCheckin").child("status").getValue());
                if ("boarded".equals(checkinStatus)) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("⚠ เช็คอินไปแล้ว")
                            .setMessage("ตั๋ว " + finalCode + " ถูกเช็คอินไปก่อนหน้านี้แล้ว")
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                String name  = String.valueOf(snap.child("name").getValue());
                String phone = String.valueOf(snap.child("phone").getValue());
                String seats = String.valueOf(snap.child("seats").getValue());
                String route = String.valueOf(snap.child("route").getValue());
                double price = 0;
                try { price = Double.parseDouble(String.valueOf(snap.child("price").getValue())); }
                catch (Exception ignored) {}
                final double fare = price;

                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("✅ ตั๋ว " + finalCode)
                        .setMessage("ชื่อ: " + name + "\nเบอร์: " + phone + "\nที่นั่ง: " + seats
                                + "\nเส้นทาง: " + route
                                + (fare > 0 ? "\nค่าโดยสาร: ฿" + (long) fare : ""))
                        .setPositiveButton("เช็คอินขึ้นรถ", (d, w) -> {
                            Map<String, Object> data = new HashMap<>();
                            data.put("status", "boarded");
                            data.put("vehicleId", vehicleId);
                            data.put("checkedBy", "driver_qr");
                            data.put("ts", System.currentTimeMillis());
                            // เตรียมฟิลด์ไว้สำหรับฟังก์ชันคิดยอดเงินเข้าคนขับอัตโนมัติในอนาคต
                            data.put("farePaidToDriver", fare);
                            data.put("fareSettled", false);
                            FirebaseDatabase.getInstance()
                                    .getReference(bookingPath + "/" + finalCode + "/originCheckin")
                                    .updateChildren(data)
                                    .addOnSuccessListener(unused -> {
                                        refreshPassengerSummary();
                                    });
                        })
                        .setNegativeButton("ปิด", null).show();
            }
            @Override public void onCancelled(DatabaseError error) {}
        });
    }

    // ===== 3.2) ข้อมูลผู้โดยสารที่จองของคันนี้วันนี้ =====
    private void showPassengerList() {
        String bookingPath = bookingsPath();
        if (bookingPath == null) {
            new AlertDialog.Builder(this).setTitle("กำลังโหลดโหมดระบบ")
                    .setMessage("กรุณาลองอีกครั้ง").setPositiveButton("ตกลง", null).show();
            return;
        }
        final String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        loadBookingsForDate(today, new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                StringBuilder sb = new StringBuilder();
                int count = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String bookingDate = child.child("date").getValue(String.class);
                    if (!today.equals(bookingDate)) continue;
                    String status = String.valueOf(child.child("status").getValue());
                    if ("cancelled".equals(status)) continue;
                    if (!bookingBelongsToVehicle(child, vehicleId)) continue;
                    String name  = String.valueOf(child.child("name").getValue());
                    String phone = String.valueOf(child.child("phone").getValue());
                    String seats = String.valueOf(child.child("seats").getValue());
                    String time  = String.valueOf(child.child("time").getValue());
                    String checkinStatus = String.valueOf(child.child("originCheckin").child("status").getValue());
                    String mark = "boarded".equals(checkinStatus) ? "✅" : "⏳";
                    sb.append(mark).append(" ").append(time).append("  ").append(name)
                      .append("  (").append(phone).append(")  ที่นั่ง ").append(seats).append("\n");
                    count++;
                }
                String msg = count == 0 ? "ไม่มีผู้โดยสารจองวันนี้" : sb.toString();
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("👥 " + vehicleId + " วันนี้ (" + count + " รายการ)")
                        .setMessage(msg)
                        .setPositiveButton("ปิด", null).show();
            }
            @Override public void onCancelled(DatabaseError error) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("ดึงข้อมูลไม่สำเร็จ")
                        .setMessage(error.getMessage())
                        .setPositiveButton("ตกลง", null).show();
            }
        });
    }

    // ===== ข้อ 4: โครงสร้างข้อมูลวินิจฉัย 1 แถว (ไอคอน/หัวข้อ/รายละเอียด/สาเหตุที่เป็นไปได้/ตั้งค่าที่เกี่ยวข้อง) =====
    private static class DiagItem {
        final String icon, title, detail, cause, settingsType;
        final int severity; // 0 = ปกติ, 1 = เตือน, 2 = แดง
        DiagItem(String icon, String title, String detail, String cause, int severity, String settingsType) {
            this.icon = icon; this.title = title; this.detail = detail;
            this.cause = cause; this.severity = severity; this.settingsType = settingsType;
        }
    }

    private String getCurrentNetworkType() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkCapabilities caps = cm != null ? cm.getNetworkCapabilities(cm.getActiveNetwork()) : null;
            if (caps != null) {
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) return "WiFi";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) return "Mobile Data";
            }
        } catch (Exception ignored) {}
        return "ไม่มีเน็ต";
    }

    private java.util.List<DiagItem> buildDiagItems() {
        java.util.List<DiagItem> items = new ArrayList<>();

        long lastGpsAt = prefs.getLong(KEY_LAST_GPS_AT, 0);
        long gpsAgoSec = lastGpsAt > 0 ? (System.currentTimeMillis() - lastGpsAt) / 1000 : -1;
        if (gpsAgoSec < 0) {
            items.add(new DiagItem("🔴", "GPS", "ยังไม่ได้รับสัญญาณ", "เพิ่งเริ่มงาน หรือยังหาตำแหน่งดาวเทียมไม่เจอ", 2, "gps"));
        } else if (gpsAgoSec < 30) {
            items.add(new DiagItem("🟢", "GPS", "ปกติ (" + gpsAgoSec + "s ที่แล้ว)", null, 0, null));
        } else if (gpsAgoSec < 90) {
            items.add(new DiagItem("🟡", "GPS", "สัญญาณอ่อน (" + gpsAgoSec + "s ที่แล้ว)", "อาจอยู่ในพื้นที่กำบัง เช่น ใต้สะพานหรืออาคารสูง", 1, "gps"));
        } else {
            items.add(new DiagItem("🔴", "GPS", "ขาดหาย (" + gpsAgoSec + "s ที่แล้ว)", "ฝั่งฮาร์ดแวร์ GPS ของเครื่อง หรือสิ่งกีดขวางสัญญาณดาวเทียม", 2, "gps"));
        }

        long sentAt = prefs.getLong(KEY_LAST_SENT, 0);
        long fbAgoSec = sentAt > 0 ? (System.currentTimeMillis() - sentAt) / 1000 : -1;
        String net = getCurrentNetworkType();
        if (fbAgoSec < 0) {
            items.add(new DiagItem("🔴", "Firebase", "ยังไม่ได้ส่ง", "เครือข่ายขณะนี้: " + net, 2, "network"));
        } else if (fbAgoSec < 30) {
            items.add(new DiagItem("🟢", "Firebase", "ปกติ (" + fbAgoSec + "s ที่แล้ว)", null, 0, null));
        } else if (fbAgoSec < 90) {
            items.add(new DiagItem("🟡", "Firebase", "ช้า (" + fbAgoSec + "s ที่แล้ว)", "เครือข่ายขณะนี้: " + net, 1, "network"));
        } else {
            String cause = net.equals("ไม่มีเน็ต")
                    ? "ไม่มีสัญญาณอินเทอร์เน็ต — ฝั่งโทรศัพท์/พื้นที่"
                    : "มีเน็ต (" + net + ") แต่ส่งข้อมูลไม่ได้ — อาจเป็นที่เซิร์ฟเวอร์หรือการเชื่อมต่อไม่เสถียร";
            items.add(new DiagItem("🔴", "Firebase", "ขาดการเชื่อมต่อ (" + fbAgoSec + "s ที่แล้ว)", cause, 2, "network"));
        }

        int restartCount = prefs.getInt(KEY_RESTART_COUNT, 0);
        if (restartCount == 0) {
            items.add(new DiagItem("🟢", "Service", "ปกติ (ไม่เคยถูก kill)", null, 0, null));
        } else if (restartCount < 3) {
            items.add(new DiagItem("🟡", "Service", "restart " + restartCount + " ครั้ง", "ระบบปฏิบัติการอาจปิดแอปเบื้องหลังเพื่อประหยัดแบตเตอรี่", 1, "battery"));
        } else {
            items.add(new DiagItem("🔴", "Service", "restart บ่อย " + restartCount + " ครั้ง", "ระบบปฏิบัติการปิดแอปเบื้องหลังบ่อยเกินไป — ต้องปลดล็อคการจำกัดแบตเตอรี่", 2, "battery"));
        }

        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            boolean ignored = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            if (ignored) items.add(new DiagItem("🟢", "Battery", "ไม่จำกัด ✓", null, 0, null));
            else items.add(new DiagItem("🔴", "Battery", "ถูกจำกัด", "ฝั่งโทรศัพท์ — ระบบประหยัดแบตจำกัดแอปทำงานเบื้องหลัง", 2, "battery"));
        } else {
            items.add(new DiagItem("🟢", "Battery", "ไม่จำกัด ✓", null, 0, null));
        }

        if (Build.VERSION.SDK_INT >= 29) {
            boolean hasBg = checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (hasBg) items.add(new DiagItem("🟢", "Location", "อนุญาตตลอดเวลา ✓", null, 0, null));
            else items.add(new DiagItem("🟡", "Location", "อนุญาตเฉพาะตอนใช้งาน", "ฝั่งโทรศัพท์ — ต้องเปลี่ยนเป็น \"อนุญาตตลอดเวลา\" ในการตั้งค่าแอป", 1, "location"));
        } else {
            items.add(new DiagItem("🟢", "Location", "อนุญาตแล้ว ✓", null, 0, null));
        }

        return items;
    }

    // ===== ข้อ 4: กดแถวที่เป็นปัญหา → เด้งไปหน้าตั้งค่าที่เกี่ยวข้องโดยตรง ไม่ต้องเข้า settings เอง =====
    private void openRelevantSettings(String type) {
        try {
            Intent intent;
            switch (type) {
                case "battery":
                    intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    break;
                case "location":
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    break;
                case "gps":
                    intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    break;
                case "network":
                    intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                    break;
                default:
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(intent);
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) {}
        }
    }

    // ===== 3.3) รายงานปัญหา app — พิกัดปัจจุบัน + ข้อมูลการวินิจฉัยทั้งหมด (ย้ายมาจากหน้าหลักเดิม) =====
    private void showDiagnosticReport() {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String coords = prefs.getString(KEY_LAST_COORDS, "---.-----,  ---.-----");
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        long sent = prefs.getLong(KEY_LAST_SENT, 0);
        String sentTime = sent > 0
                ? new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(sent))
                : "--:--:--";

        ScrollView scroll = new ScrollView(this);
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dp(20), dp(12), dp(20), dp(4));
        scroll.addView(container);

        TextView header = new TextView(this);
        header.setText("รถ: " + vehicleId + "\nสถานะส่งตำแหน่ง: " + (enabled ? "กำลังส่ง" : "ปิดอยู่")
                + "\nพิกัดปัจจุบัน: " + coords + "\nส่งล่าสุด: " + sentTime);
        header.setTextColor(COLOR_TEXT_MUTED);
        header.setTextSize(13);
        header.setPadding(0, 0, 0, dp(14));
        container.addView(header);

        if (!enabled) {
            TextView empty = new TextView(this);
            empty.setText("ยังไม่มีข้อมูลการวินิจฉัย (ต้องเปิดส่งตำแหน่งก่อน)");
            empty.setTextColor(COLOR_TEXT_MUTED);
            container.addView(empty);
        } else {
            for (DiagItem item : buildDiagItems()) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.VERTICAL);
                row.setPadding(dp(12), dp(10), dp(12), dp(10));
                GradientDrawable rowBg = new GradientDrawable();
                rowBg.setColor(item.severity > 0 ? Color.rgb(254, 242, 242) : Color.rgb(240, 253, 244));
                rowBg.setCornerRadius(dp(10));
                row.setBackground(rowBg);
                LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                rowLp.setMargins(0, 0, 0, dp(8));
                row.setLayoutParams(rowLp);

                TextView line = new TextView(this);
                line.setText(item.icon + " " + item.title + ": " + item.detail);
                line.setTextColor(COLOR_NAVY);
                line.setTypeface(Typeface.DEFAULT_BOLD);
                line.setTextSize(13);
                row.addView(line);

                if (item.cause != null) {
                    TextView causeView = new TextView(this);
                    causeView.setText("สาเหตุที่เป็นไปได้: " + item.cause);
                    causeView.setTextColor(COLOR_TEXT_MUTED);
                    causeView.setTextSize(11);
                    causeView.setPadding(0, dp(4), 0, 0);
                    row.addView(causeView);
                }

                if (item.settingsType != null) {
                    TextView fixHint = new TextView(this);
                    fixHint.setText("แตะเพื่อไปตั้งค่าที่เกี่ยวข้อง ▸");
                    fixHint.setTextColor(COLOR_TEAL);
                    fixHint.setTextSize(11);
                    fixHint.setTypeface(Typeface.DEFAULT_BOLD);
                    fixHint.setPadding(0, dp(6), 0, 0);
                    row.addView(fixHint);
                    row.setClickable(true);
                    row.setOnClickListener(v -> openRelevantSettings(item.settingsType));
                }
                container.addView(row);
            }
        }

        new AlertDialog.Builder(this)
                .setTitle("🐞 รายงานปัญหา App")
                .setView(scroll)
                .setPositiveButton("ส่งรายงานเข้าระบบ", (d, w) -> {
                    logIssueToFirebase("ผู้ใช้กดส่งรายงานปัญหาด้วยตนเอง", -1, -1, true);
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ส่งแล้ว")
                            .setMessage("รายงานปัญหาของ " + vehicleId + " ถูกส่งเข้าระบบแล้ว")
                            .setPositiveButton("ตกลง", null).show();
                })
                .setNegativeButton("ปิด", null).show();
    }

    // ===== แจ้งเหตุขัดข้อง — เลือกประเภท แล้วส่ง SOS + โทรได้ทันที =====
    private void showIncidentDialog() {
        // ประเภทเหตุขัดข้องทางการ (อ้างอิง กรมการขนส่งทางบก / ระบบรถโดยสารสาธารณะ)
        final String[] incidentTypes = {
            "🛞  ยางแตก / ยางรั่ว",
            "💥  อุบัติเหตุชนกัน",
            "🔥  รถเสีย / เครื่องยนต์ขัดข้อง",
            "⚡  ระบบไฟฟ้า / แบตเตอรี่ขัดข้อง",
            "🌊  น้ำท่วม / ถนนปิด",
            "🚨  เหตุฉุกเฉินทางการแพทย์",
            "🆘  ส่งสัญญาณ SOS (อื่นๆ)"
        };
        new AlertDialog.Builder(this)
            .setTitle("⚠️ แจ้งเหตุขัดข้อง — เลือกประเภท")
            .setItems(incidentTypes, (d, which) -> {
                String incidentLabel = incidentTypes[which].substring(3).trim(); // ตัด emoji ออก
                showIncidentConfirmDialog(incidentLabel);
            })
            .setNegativeButton("ยกเลิก", null)
            .show();
    }

    private void showIncidentConfirmDialog(String incidentType) {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String coords = prefs.getString(KEY_LAST_COORDS, "ไม่มีพิกัด");

        new AlertDialog.Builder(this)
            .setTitle("ยืนยันการแจ้งเหตุ")
            .setMessage("รถ " + vehicleId + "\nเหตุ: " + incidentType
                + "\nพิกัด: " + coords
                + "\n\nระบบจะแจ้งแอดมินทันที")
            .setPositiveButton("แจ้งเหตุ", (d, w) -> {
                sendIncidentToFirebase(incidentType, coords, vehicleId);
                showPostIncidentOptions();
            })
            .setNegativeButton("ยกเลิก", null)
            .show();
    }

    private void sendIncidentToFirebase(String incidentType, String coords, String vehicleId) {
        Map<String, Object> data = new HashMap<>();
        data.put("vehicleId", vehicleId);
        data.put("incidentType", incidentType);
        data.put("coords", coords);
        data.put("ts", System.currentTimeMillis());
        data.put("resolved", false);
        FirebaseDatabase.getInstance().getReference("sosAlerts/" + vehicleId).setValue(data);
        addNotification("🆘 แจ้งเหตุ \"" + incidentType + "\" ถูกส่งเข้าระบบแล้ว");
    }

    private void showPostIncidentOptions() {
        String[] options = {
            "🚓  โทร 191 — ตำรวจ / เหตุฉุกเฉินทั่วไป",
            "🚑  โทร 1669 — กู้ภัย / รถพยาบาล",
            "✅  ปิด (แจ้งแอดมินแล้ว)"
        };
        new AlertDialog.Builder(this)
            .setTitle("✅ แจ้งเหตุเข้าระบบแล้ว")
            .setMessage("ต้องการโทรเพิ่มเติมหรือไม่?")
            .setItems(options, (d, which) -> {
                if (which == 0) callNumber("191");
                else if (which == 1) callNumber("1669");
            })
            .show();
    }

    // ===== SOS signal เดิม (ยังใช้ใน sendIncidentToFirebase ผ่าน sosAlerts) =====
    private void showSosDialog() {
        showIncidentDialog();
    }

    private void callNumber(String number) {
        Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number));
        startActivity(dial);
    }

    private void sendSosSignal() {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String coords = prefs.getString(KEY_LAST_COORDS, "");
        Map<String, Object> data = new HashMap<>();
        data.put("vehicleId", vehicleId);
        data.put("coords", coords);
        data.put("ts", System.currentTimeMillis());
        data.put("resolved", false);
        FirebaseDatabase.getInstance().getReference("sosAlerts/" + vehicleId).setValue(data);
        new AlertDialog.Builder(this)
                .setTitle("ส่งสัญญาณแล้ว")
                .setMessage("ระบบได้รับแจ้งเหตุฉุกเฉินจากรถ " + vehicleId + " แล้ว")
                .setPositiveButton("ตกลง", null).show();
    }

    private void installApk(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", apkFile);
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installIntent);
        } catch (Exception e) {
            new AlertDialog.Builder(this)
                    .setTitle("ติดตั้งไม่สำเร็จ")
                    .setMessage(e.getMessage())
                    .setPositiveButton("ตกลง", null).show();
        }
    }

    // ===== สร้างคำว่า "S.L.TRANSIT" แบบมีจุดสีเหมือนโลโก้ (เทียลและส้มสลับ) =====
    private CharSequence buildWordmark() {
        String text = "S.L.TRANSIT";
        android.text.SpannableString span = new android.text.SpannableString(text);
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '.') {
                int color = (i == 1) ? COLOR_TEAL : COLOR_ORANGE;
                span.setSpan(new android.text.style.ForegroundColorSpan(color),
                        i, i + 1, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
        return span;
    }

    private void buildUi() {
        diagVisible = prefs.getBoolean(KEY_DIAG_VISIBLE, false);

        // ===== ข้อ 8: outer container = หน้าเนื้อหา (สลับได้ตามแท็บ) + bottom nav คงที่ =====
        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setBackgroundColor(COLOR_BG_PAGE);
        // ไม่ต้องตั้ง fitsSystemWindows — ใช้ listener ด้านล่างแทน

        contentContainer = new FrameLayout(this);
        LinearLayout.LayoutParams containerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        outer.addView(contentContainer, containerLp);

        // ===== หน้าหลัก (เนื้อหาเดิมทั้งหมด อยู่ใน ScrollView) =====
        homeScroll = new ScrollView(this);
        homeScroll.setFillViewport(true);
        homeScroll.setBackgroundColor(COLOR_BG_PAGE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_BG_PAGE);
        // ใช้ WindowInsets เพื่อดัน padding บนหนีสถานะบาร์ทุกขนาดหน้าจอ
        if (Build.VERSION.SDK_INT >= 21) {
            outer.setOnApplyWindowInsetsListener((v, insets) -> {
                int top = insets.getSystemWindowInsetTop();
                int bottom = insets.getSystemWindowInsetBottom();
                root.setPadding(dp(16), top + dp(12), dp(16), dp(8));
                return insets;
            });
        } else {
            root.setPadding(dp(16), dp(28), dp(16), dp(8));
        }
        homeScroll.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));
        contentContainer.addView(homeScroll);

        // ===== ข้อ 2: หัวข้อ S.L.TRANSIT ชิดซ้ายสุด + กระดิ่งแจ้งเตือนชิดขวา =====
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText(buildWordmark());
        title.setTextColor(COLOR_NAVY);
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setLetterSpacing(0.02f);
        title.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        headerRow.addView(title, titleLp);

        // ไอคอนกระดิ่งแจ้งเตือน พร้อมตัวเลขค้างไว้แบบ Facebook (ไม่หายเอง จนกว่าจะกดดู)
        FrameLayout bellFrame = new FrameLayout(this);

        notifBell = new TextView(this);
        notifBell.setText("🔔");
        notifBell.setTextSize(20);
        notifBell.setGravity(Gravity.CENTER);
        notifBell.setOnClickListener(v -> {
            animateTap(notifBell);
            showNotificationCenter();
        });
        FrameLayout.LayoutParams bellLp = new FrameLayout.LayoutParams(dp(32), dp(32));
        bellFrame.addView(notifBell, bellLp);

        notifCountBubble = new TextView(this);
        notifCountBubble.setText("1");
        notifCountBubble.setTextSize(10);
        notifCountBubble.setTypeface(Typeface.DEFAULT_BOLD);
        notifCountBubble.setTextColor(Color.WHITE);
        notifCountBubble.setGravity(Gravity.CENTER);
        notifCountBubble.setVisibility(android.view.View.GONE);
        GradientDrawable bubbleBg = new GradientDrawable();
        bubbleBg.setShape(GradientDrawable.OVAL);
        bubbleBg.setColor(COLOR_ORANGE);
        notifCountBubble.setBackground(bubbleBg);
        FrameLayout.LayoutParams bubbleLp = new FrameLayout.LayoutParams(dp(16), dp(16));
        bubbleLp.gravity = Gravity.TOP | Gravity.END;
        bubbleLp.setMargins(0, -dp(2), -dp(2), 0);
        bellFrame.addView(notifCountBubble, bubbleLp);

        LinearLayout.LayoutParams bellFrameLp = new LinearLayout.LayoutParams(dp(32), dp(32));
        headerRow.addView(bellFrame, bellFrameLp);

        LinearLayout.LayoutParams headerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        headerLp.setMargins(0, 0, 0, dp(14));
        root.addView(headerRow, headerLp);

        // ===== ป้ายออนไลน์ (hidden — ยังคง ref ไว้ให้ refreshUi ใช้ แต่ไม่แสดงบนหน้าจอ) =====
        onlinePill = new LinearLayout(this);
        onlinePill.setVisibility(android.view.View.GONE);
        onlineDot = new TextView(this);
        onlineLabel = new TextView(this);
        onlinePill.addView(onlineDot);
        onlinePill.addView(onlineLabel);

        // versionLabel สร้างไว้ก่อน จะ addView ที่ท้ายสุด (ข้อ 2)
        versionLabel = new TextView(this);
        versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]) + ")");
        versionLabel.setTextColor(COLOR_TEXT_MUTED);
        versionLabel.setTextSize(10);
        versionLabel.setGravity(Gravity.CENTER);

        // vehiclePickerText สร้างไว้ก่อน จะ addView ในการ์ดคิว (ข้อ 1)
        vehiclePickerText = new TextView(this);
        vehiclePickerText.setTextColor(COLOR_LIGHT_TEAL);
        vehiclePickerText.setTextSize(12);
        vehiclePickerText.setTypeface(Typeface.DEFAULT_BOLD);
        vehiclePickerText.setGravity(Gravity.CENTER);
        vehiclePickerText.setPadding(dp(10), dp(6), dp(10), dp(6));
        // ถ้ายังไม่ได้เลือกรถ แสดง "เลือกรถ ▾" แทนค่า default
        String savedVehicle = prefs.getString(KEY_VEHICLE_ID, null);
        vehiclePickerText.setText(savedVehicle != null ? savedVehicle + "\n▾" : "เลือกรถ\n▾");
        GradientDrawable pickerBg = new GradientDrawable();
        pickerBg.setColor(Color.argb(50, 0, 167, 181));
        pickerBg.setCornerRadius(dp(10));
        vehiclePickerText.setBackground(pickerBg);
        vehiclePickerText.setOnClickListener(v -> {
            animateTap(vehiclePickerText);
            showVehicleDialog();
        });

        // ===== ข้อ 3: การ์ดคิววันนี้ / เส้นทาง / รอบถัดไป / สถานะให้บริการ =====
        LinearLayout queueCard = new LinearLayout(this);
        queueCard.setOrientation(LinearLayout.VERTICAL);
        queueCard.setPadding(dp(18), dp(18), dp(18), dp(16));
        GradientDrawable queueBg = new GradientDrawable();
        queueBg.setColor(COLOR_OCEAN);
        queueBg.setCornerRadius(dp(18));
        queueCard.setBackground(queueBg);
        queueCard.setElevation(dp(2));

        LinearLayout queueTopRow = new LinearLayout(this);
        queueTopRow.setOrientation(LinearLayout.HORIZONTAL);
        queueTopRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView busIcon = new TextView(this);
        busIcon.setText("🚌");
        busIcon.setTextSize(20);
        busIcon.setPadding(0, 0, dp(10), 0);
        // ไม่มี onClick — คิวมาจาก Firebase อัตโนมัติ
        queueTopRow.addView(busIcon);
        queueValueText = new TextView(this);
        queueValueText.setText("กำลังโหลดคิว…");
        queueValueText.setTextColor(Color.WHITE);
        queueValueText.setTextSize(17);
        queueValueText.setTypeface(Typeface.DEFAULT_BOLD);
        // ไม่มี onClick — ระบบดึงคิวจาก Firebase เอง
        LinearLayout.LayoutParams queueValLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        queueTopRow.addView(queueValueText, queueValLp);
        // ===== ข้อ 1: ปุ่มเลือกรหัสรถ ย้ายมาอยู่ในการ์ดคิว ขวาบน =====
        LinearLayout.LayoutParams carPickerLp = new LinearLayout.LayoutParams(
                dp(72), LinearLayout.LayoutParams.WRAP_CONTENT);
        queueTopRow.addView(vehiclePickerText, carPickerLp);
        queueCard.addView(queueTopRow);

        routeValueText = new TextView(this);
        routeValueText.setText("—");
        routeValueText.setTextColor(Color.rgb(203, 224, 240));
        routeValueText.setTextSize(14);
        routeValueText.setPadding(dp(30), dp(4), 0, dp(14));
        queueCard.addView(routeValueText);

        queueCard.addView(buildDashDivider());

        LinearLayout queueBottomRow = new LinearLayout(this);
        queueBottomRow.setOrientation(LinearLayout.HORIZONTAL);
        queueBottomRow.setGravity(Gravity.CENTER_VERTICAL);
        queueBottomRow.setPadding(0, dp(14), 0, 0);

        LinearLayout nextRoundCol = new LinearLayout(this);
        nextRoundCol.setOrientation(LinearLayout.VERTICAL);
        TextView nextRoundLabel = new TextView(this);
        nextRoundLabel.setText("รอบถัดไป");
        nextRoundLabel.setTextColor(Color.rgb(160, 190, 215));
        nextRoundLabel.setTextSize(10);
        nextRoundCol.addView(nextRoundLabel);
        nextRoundValueText = new TextView(this);
        nextRoundValueText.setText("—");
        nextRoundValueText.setTextColor(Color.WHITE);
        nextRoundValueText.setTextSize(14);
        nextRoundValueText.setTypeface(Typeface.DEFAULT_BOLD);
        nextRoundCol.addView(nextRoundValueText);
        LinearLayout.LayoutParams nextRoundColLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        queueBottomRow.addView(nextRoundCol, nextRoundColLp);

        serviceStatusPill = new LinearLayout(this);
        serviceStatusPill.setOrientation(LinearLayout.HORIZONTAL);
        serviceStatusPill.setGravity(Gravity.CENTER);
        serviceStatusPill.setPadding(dp(12), dp(7), dp(12), dp(7));
        serviceStatusLabel = new TextView(this);
        serviceStatusLabel.setTextSize(12);
        serviceStatusLabel.setTypeface(Typeface.DEFAULT_BOLD);
        serviceStatusPill.addView(serviceStatusLabel);
        serviceStatusPill.setOnClickListener(v -> {
            animateTap(serviceStatusPill);
            showServiceStatusDialog();
        });
        queueBottomRow.addView(serviceStatusPill);
        queueCard.addView(queueBottomRow);

        LinearLayout.LayoutParams queueCardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        queueCardLp.setMargins(0, 0, 0, dp(16));
        root.addView(queueCard, queueCardLp);
        updateServiceStatusPill();

        // ===== ข้อ 6: การ์ด "การเดินทางปัจจุบัน" (พร้อม/ไม่พร้อม + ป้ายตำแหน่ง + ETA) =====
        travelCard = new LinearLayout(this);
        travelCard.setOrientation(LinearLayout.VERTICAL);
        travelCard.setPadding(dp(18), dp(18), dp(18), dp(18));
        GradientDrawable travelBg = new GradientDrawable();
        travelBg.setColor(Color.WHITE);
        travelBg.setCornerRadius(dp(18));
        travelCard.setBackground(travelBg);
        travelCard.setElevation(dp(2));

        LinearLayout travelTitleRow = new LinearLayout(this);
        travelTitleRow.setOrientation(LinearLayout.HORIZONTAL);
        travelTitleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView travelTitle = new TextView(this);
        travelTitle.setText("การเดินทางปัจจุบัน");
        travelTitle.setTextColor(COLOR_NAVY);
        travelTitle.setTextSize(14);
        travelTitle.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams travelTitleLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        travelTitleRow.addView(travelTitle, travelTitleLp);

        readinessBadge = new TextView(this);
        readinessBadge.setTextSize(12);
        readinessBadge.setTypeface(Typeface.DEFAULT_BOLD);
        readinessBadge.setPadding(dp(12), dp(5), dp(12), dp(5));
        readinessBadge.setText("ออฟไลน์");
        travelTitleRow.addView(readinessBadge);
        travelCard.addView(travelTitleRow);

        readinessReasonText = new TextView(this);
        readinessReasonText.setTextColor(COLOR_RED);
        readinessReasonText.setTextSize(11);
        readinessReasonText.setPadding(0, dp(6), 0, 0);
        readinessReasonText.setVisibility(android.view.View.GONE);
        travelCard.addView(readinessReasonText);

        travelCard.addView(buildStationBox());

        etaText = new TextView(this);
        etaText.setText("เวลาโดยประมาณถึง : —");
        etaText.setTextColor(COLOR_TEXT_MUTED);
        etaText.setTextSize(12);
        etaText.setPadding(0, dp(12), 0, 0);
        travelCard.addView(etaText);

        LinearLayout.LayoutParams travelCardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        travelCardLp.setMargins(0, 0, 0, dp(16));
        root.addView(travelCard, travelCardLp);

        // ===== ข้อ 7: การ์ดสรุปผู้โดยสาร (หัวข้ออยู่ในกรอบขาวเดียวกัน) =====
        LinearLayout summaryCard = new LinearLayout(this);
        summaryCard.setOrientation(LinearLayout.VERTICAL);
        summaryCard.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable summaryBg = new GradientDrawable();
        summaryBg.setColor(Color.WHITE);
        summaryBg.setCornerRadius(dp(18));
        summaryCard.setBackground(summaryBg);
        summaryCard.setElevation(dp(2));

        TextView summaryTitle = new TextView(this);
        summaryTitle.setText("สรุปผู้โดยสาร");
        summaryTitle.setTextColor(COLOR_NAVY);
        summaryTitle.setTextSize(13);
        summaryTitle.setTypeface(Typeface.DEFAULT_BOLD);
        summaryTitle.setLetterSpacing(0.02f);
        summaryTitle.setPadding(dp(4), 0, 0, dp(12));
        summaryCard.addView(summaryTitle);

        LinearLayout summaryRow = new LinearLayout(this);
        summaryRow.setOrientation(LinearLayout.HORIZONTAL);
        summaryRow.setGravity(Gravity.CENTER);

        summaryBookedCount = new TextView(this);
        summaryCheckedCount = new TextView(this);
        summaryPendingCount = new TextView(this);

        summaryRow.addView(buildSummaryColumn("👥", summaryBookedCount, "ผู้โดยสาร", COLOR_OCEAN));
        summaryRow.addView(buildSummaryDivider());
        summaryRow.addView(buildSummaryColumn("🎫", summaryCheckedCount, "เช็คตั๋วแล้ว", COLOR_TEAL));
        summaryRow.addView(buildSummaryDivider());
        summaryRow.addView(buildSummaryColumn("⏳", summaryPendingCount, "ยังไม่มาเช็คอิน", COLOR_ORANGE));
        summaryCard.addView(summaryRow);

        LinearLayout.LayoutParams summaryLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        summaryLp.setMargins(0, 0, 0, dp(20));
        root.addView(summaryCard, summaryLp);
        refreshPassengerSummary();

        errorText = new TextView(this);
        errorText.setTextColor(COLOR_RED);
        errorText.setTextSize(13);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(0, 0, 0, dp(16));
        errorText.setVisibility(android.view.View.GONE);
        root.addView(errorText);

        // ===== ตัวแปรที่ยังใช้ภายใน (ไม่แสดงผลบนหน้าจอแล้ว — ย้ายไปข้อ 6.1/รายงานปัญหาแทน) =====
        diagPanel = new TextView(this);
        diagPanel.setVisibility(android.view.View.GONE);
        coordsText = new TextView(this);
        coordsText.setVisibility(android.view.View.GONE);
        sentTimeText = new TextView(this);
        sentTimeText.setVisibility(android.view.View.GONE);
        statusBadge = new TextView(this);
        statusBadge.setVisibility(android.view.View.GONE);
        mainButton = new Button(this);
        mainButton.setVisibility(android.view.View.GONE);

        // ===== ตาราง 2x2 ไอคอน =====
        LinearLayout actionsRowTop = new LinearLayout(this);
        actionsRowTop.setOrientation(LinearLayout.HORIZONTAL);
        actionsRowTop.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsRowTop.addView(buildActionButton("🎫", "สแกนตั๋ว", COLOR_TEAL, v -> openQrScanner()));
        actionsRowTop.addView(buildActionButton("📋", "ข้อมูล\nการจอง", COLOR_OCEAN, v -> showPassengerList()));
        root.addView(actionsRowTop, actionsRowLp);

        LinearLayout actionsRowBottom = new LinearLayout(this);
        actionsRowBottom.setOrientation(LinearLayout.HORIZONTAL);
        actionsRowBottom.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsRowBottomLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsRowBottomLp.setMargins(0, dp(8), 0, dp(12));
        actionsRowBottom.addView(buildActionButton("📡", "รายงาน\nสถานะ", COLOR_LIGHT_TEAL, v -> showDiagnosticPage()));
        actionsRowBottom.addView(buildActionButton("⚠️", "แจ้งเหตุ\nขัดข้อง", COLOR_ORANGE, v -> showIncidentDialog()));
        root.addView(actionsRowBottom, actionsRowBottomLp);

        // ===== ข้อ 3: แถบ เริ่มงาน/หยุดงาน แบบ full-width bar ใต้ไอคอน =====
        root.addView(buildStartWorkBar());

        // ===== ข้อ 2: version label อยู่ล่างสุด =====
        LinearLayout.LayoutParams versionLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        versionLp.setMargins(0, dp(16), 0, dp(8));
        root.addView(versionLabel, versionLp);

        // ===== สร้างหน้า nav ทั้ง 4 หน้าจริง =====
        contentContainer.addView(buildTodayReportPage());   // index 1: รายงานวันนี้
        contentContainer.addView(buildReportHistoryPage()); // index 2: รายงาน
        contentContainer.addView(buildNotificationPage());  // index 3: แจ้งเตือน
        contentContainer.addView(buildAccountPage());       // index 4: บัญชี

        // ===== ข้อ 8: Bottom Navigation =====
        outer.addView(buildBottomNavBar());

        setContentView(outer);
        selectNavTab(0);
        refreshUi();
    }

    // ===== ข้อ 3: เส้นประ 4 ขีดจางๆ คั่นระหว่างเส้นทางกับรอบถัดไป (ตามดีไซน์ภาพ 2) =====
    private LinearLayout buildDashDivider() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        for (int i = 0; i < 4; i++) {
            android.view.View seg = new android.view.View(this);
            seg.setBackgroundColor(Color.argb(70, 255, 255, 255));
            LinearLayout.LayoutParams segLp = new LinearLayout.LayoutParams(0, dp(2), 1f);
            segLp.setMargins(dp(2), 0, dp(2), 0);
            row.addView(seg, segLp);
        }
        return row;
    }

    // ===== ข้อ 6.2: กล่องเล็ก "ตำแหน่งปัจจุบัน → จุดหมายถัดไป" พร้อมเส้นถนน + ไอคอนรถ =====
    private LinearLayout buildStationBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable boxBg = new GradientDrawable();
        boxBg.setColor(COLOR_BG_PAGE);
        boxBg.setCornerRadius(dp(14));
        box.setBackground(boxBg);
        LinearLayout.LayoutParams boxLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        boxLp.setMargins(0, dp(12), 0, 0);
        box.setLayoutParams(boxLp);

        LinearLayout leftCol = new LinearLayout(this);
        leftCol.setOrientation(LinearLayout.VERTICAL);
        TextView leftLabel = new TextView(this);
        leftLabel.setText("ตำแหน่งปัจจุบัน");
        leftLabel.setTextColor(COLOR_TEXT_MUTED);
        leftLabel.setTextSize(10);
        leftCol.addView(leftLabel);
        currentStopLabel = new TextView(this);
        currentStopLabel.setText("—");
        currentStopLabel.setTextColor(COLOR_NAVY);
        currentStopLabel.setTextSize(14);
        currentStopLabel.setTypeface(Typeface.DEFAULT_BOLD);
        leftCol.addView(currentStopLabel);
        box.addView(leftCol);

        android.view.View line1 = new android.view.View(this);
        line1.setBackgroundColor(Color.rgb(203, 213, 225));
        LinearLayout.LayoutParams line1Lp = new LinearLayout.LayoutParams(0, dp(2), 1f);
        line1Lp.setMargins(dp(8), 0, dp(4), 0);
        box.addView(line1, line1Lp);

        TextView roadBus = new TextView(this);
        roadBus.setText("🚌");
        roadBus.setTextSize(16);
        box.addView(roadBus);

        android.view.View line2 = new android.view.View(this);
        line2.setBackgroundColor(Color.rgb(203, 213, 225));
        LinearLayout.LayoutParams line2Lp = new LinearLayout.LayoutParams(0, dp(2), 1f);
        line2Lp.setMargins(dp(4), 0, dp(8), 0);
        box.addView(line2, line2Lp);

        LinearLayout rightCol = new LinearLayout(this);
        rightCol.setOrientation(LinearLayout.VERTICAL);
        rightCol.setGravity(Gravity.END);
        TextView rightLabel = new TextView(this);
        rightLabel.setText("จุดหมายถัดไป");
        rightLabel.setTextColor(COLOR_TEXT_MUTED);
        rightLabel.setTextSize(10);
        rightLabel.setGravity(Gravity.END);
        rightCol.addView(rightLabel);
        nextStopLabel = new TextView(this);
        nextStopLabel.setText("—");
        nextStopLabel.setTextColor(COLOR_NAVY);
        nextStopLabel.setTextSize(14);
        nextStopLabel.setTypeface(Typeface.DEFAULT_BOLD);
        nextStopLabel.setGravity(Gravity.END);
        rightCol.addView(nextStopLabel);
        box.addView(rightCol);

        return box;
    }

    // ===== ข้อ 3: แถบ เริ่มงาน/หยุดงาน แบบ full-width bar =====
    private LinearLayout buildStartWorkBar() {
        startWorkButton = new LinearLayout(this);
        startWorkButton.setOrientation(LinearLayout.HORIZONTAL);
        startWorkButton.setGravity(Gravity.CENTER);
        startWorkButton.setPadding(dp(20), dp(16), dp(20), dp(16));
        startWorkButton.setClickable(true);
        startWorkButton.setOnClickListener(v -> {
            if (serviceTransitionInProgress) return;
            animateTap(startWorkButton);
            toggleServiceSafely();
        });
        startWorkIconBg = new GradientDrawable();
        startWorkIconBg.setShape(GradientDrawable.OVAL);
        startWorkIconBg.setColor(COLOR_GREEN);
        startWorkIcon = new TextView(this);
        startWorkIcon.setText("▶");
        startWorkIcon.setTextSize(18);
        startWorkIcon.setTextColor(Color.WHITE);
        startWorkIcon.setGravity(Gravity.CENTER);
        startWorkIcon.setBackground(startWorkIconBg);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(38), dp(38));
        iconLp.setMargins(0, 0, dp(12), 0);
        startWorkButton.addView(startWorkIcon, iconLp);
        startWorkLabel = new TextView(this);
        startWorkLabel.setText("เริ่มงาน");
        startWorkLabel.setTextColor(Color.WHITE);
        startWorkLabel.setTextSize(16);
        startWorkLabel.setTypeface(Typeface.DEFAULT_BOLD);
        startWorkButton.addView(startWorkLabel);

        GradientDrawable barBg = new GradientDrawable();
        barBg.setColor(COLOR_GREEN);
        barBg.setCornerRadius(dp(16));
        startWorkButton.setBackground(barBg);
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        startWorkButton.setLayoutParams(barLp);
        return startWorkButton;
    }

    // ===== ข้อ 3: รายงานปัญหาแอพ — เปิดหน้าใหม่เต็มจอ (ไม่ใช่ popup) =====
    private void showDiagnosticPage() {
        String tag = "nav_page_diagnostic";
        android.view.View existing = contentContainer.findViewWithTag(tag);
        if (existing == null) {
            contentContainer.addView(buildDiagnosticFullPage());
        }
        for (int i = 0; i < contentContainer.getChildCount(); i++) {
            contentContainer.getChildAt(i).setVisibility(android.view.View.GONE);
        }
        android.view.View diagPage = contentContainer.findViewWithTag(tag);
        if (diagPage != null) diagPage.setVisibility(android.view.View.VISIBLE);
        // deselect bottom nav — ใช้สีขาวจางเพราะ bg = Navy
        for (int i = 0; i < navTabs.length; i++) {
            navTabIcons[i].setTextColor(Color.argb(153, 255, 255, 255));
            navTabLabels[i].setTextColor(Color.argb(153, 255, 255, 255));
            navTabLabels[i].setTypeface(Typeface.DEFAULT);
            navTabIcons[i].setCompoundDrawablesWithIntrinsicBounds(null, null, null, null);
        }
        refreshDiagPageContent(diagPage);

        // เริ่ม auto-refresh ทุก 3 วินาที
        stopDiagRefresh();
        diagRefreshRunnable = new Runnable() {
            @Override public void run() {
                android.view.View p = contentContainer.findViewWithTag(tag);
                if (p != null && p.getVisibility() == android.view.View.VISIBLE) {
                    refreshDiagPageContent(p);
                    diagHandler.postDelayed(this, 3000);
                }
            }
        };
        diagHandler.postDelayed(diagRefreshRunnable, 3000);
    }

    private void stopDiagRefresh() {
        if (diagRefreshRunnable != null) {
            diagHandler.removeCallbacks(diagRefreshRunnable);
            diagRefreshRunnable = null;
        }
    }

    private android.view.View buildDiagnosticFullPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_diagnostic");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        sv.setVisibility(android.view.View.GONE);

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dp(20), dp(52), dp(20), dp(24)); // dp(52) เผื่อ status bar
        container.setTag("diag_container");

        // ===== ปุ่มกลับ (คงที่ ไม่ต้อง rebuild) =====
        LinearLayout backRow = new LinearLayout(this);
        backRow.setOrientation(LinearLayout.HORIZONTAL);
        backRow.setGravity(Gravity.CENTER_VERTICAL);
        backRow.setPadding(0, 0, 0, dp(12));
        backRow.setClickable(true);
        backRow.setOnClickListener(v -> { stopDiagRefresh(); selectNavTab(0); });
        TextView backBtn = new TextView(this);
        backBtn.setText("← หน้าหลัก");
        backBtn.setTextColor(COLOR_TEAL);
        backBtn.setTextSize(14);
        backBtn.setTypeface(Typeface.DEFAULT_BOLD);
        backRow.addView(backBtn);
        container.addView(backRow);

        // ===== หัวข้อ + นาฬิกา (refresh เฉพาะ clock) =====
        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleRowLp.setMargins(0, 0, 0, dp(14));
        titleRow.setLayoutParams(titleRowLp);
        TextView pageTitle = new TextView(this);
        pageTitle.setText("📡 สถานะรถ & สัญญาณ");
        pageTitle.setTextColor(COLOR_NAVY);
        pageTitle.setTextSize(18);
        pageTitle.setTypeface(Typeface.DEFAULT_BOLD);
        titleRow.addView(pageTitle, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView clockTv = new TextView(this);
        clockTv.setTag("diag_clock");
        clockTv.setTextColor(COLOR_TEAL);
        clockTv.setTextSize(11);
        clockTv.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        titleRow.addView(clockTv);
        container.addView(titleRow);

        // ===== การ์ดสถานะใหญ่ (icon/title/sub มี tag) =====
        LinearLayout statusCard = new LinearLayout(this);
        statusCard.setOrientation(LinearLayout.HORIZONTAL);
        statusCard.setGravity(Gravity.CENTER_VERTICAL);
        statusCard.setPadding(dp(16), dp(16), dp(16), dp(16));
        statusCard.setTag("diag_status_card");
        LinearLayout.LayoutParams scLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        scLp.setMargins(0, 0, 0, dp(10));
        statusCard.setLayoutParams(scLp);
        TextView statusIcon = new TextView(this);
        statusIcon.setTag("diag_status_icon");
        statusIcon.setTextSize(32);
        LinearLayout.LayoutParams siLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        siLp.setMargins(0, 0, dp(14), 0);
        statusCard.addView(statusIcon, siLp);
        LinearLayout statusTextCol = new LinearLayout(this);
        statusTextCol.setOrientation(LinearLayout.VERTICAL);
        TextView statusTitle = new TextView(this);
        statusTitle.setTag("diag_status_title");
        statusTitle.setTextColor(COLOR_NAVY);
        statusTitle.setTextSize(17);
        statusTitle.setTypeface(Typeface.DEFAULT_BOLD);
        statusTextCol.addView(statusTitle);
        TextView statusSub = new TextView(this);
        statusSub.setTag("diag_status_sub");
        statusSub.setTextColor(COLOR_TEXT_MUTED);
        statusSub.setTextSize(12);
        statusTextCol.addView(statusSub);
        statusCard.addView(statusTextCol);
        container.addView(statusCard);

        // ===== row1: รหัสรถ + ส่งล่าสุด =====
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams r1Lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        r1Lp.setMargins(0, 0, 0, dp(8));
        row1.setLayoutParams(r1Lp);
        LinearLayout card1a = buildDiagMiniCardTagged("🚌  รหัสรถ", "diag_val_vehicle");
        LinearLayout card1b = buildDiagMiniCardTagged("📡  ส่งล่าสุด", "diag_val_sent");
        row1.addView(card1a, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row1.addView(new android.view.View(this), new LinearLayout.LayoutParams(dp(8), 1));
        row1.addView(card1b, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        container.addView(row1);

        // ===== row2: พิกัด + แบต =====
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams r2Lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        r2Lp.setMargins(0, 0, 0, dp(8));
        row2.setLayoutParams(r2Lp);
        LinearLayout card2a = buildDiagMiniCardTagged("📍  พิกัดล่าสุด", "diag_val_coords");
        LinearLayout card2b = buildDiagMiniCardTagged("🔋  แบตเตอรี่", "diag_val_battery");
        row2.addView(card2a, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row2.addView(new android.view.View(this), new LinearLayout.LayoutParams(dp(8), 1));
        row2.addView(card2b, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        container.addView(row2);

        // ===== กล่อง DiagItems (rebuild ทุกรอบ เพราะ severity เปลี่ยนได้) =====
        LinearLayout diagItemsContainer = new LinearLayout(this);
        diagItemsContainer.setOrientation(LinearLayout.VERTICAL);
        diagItemsContainer.setTag("diag_items_container");
        container.addView(diagItemsContainer);

        // ===== ปุ่มส่งรายงาน (คงที่) =====
        TextView sendBtn = new TextView(this);
        sendBtn.setText("📤  ส่งรายงานเข้าระบบ");
        sendBtn.setTextColor(Color.WHITE);
        sendBtn.setTextSize(15);
        sendBtn.setTypeface(Typeface.DEFAULT_BOLD);
        sendBtn.setGravity(Gravity.CENTER);
        sendBtn.setPadding(dp(20), dp(16), dp(20), dp(16));
        GradientDrawable sendBg = new GradientDrawable();
        sendBg.setColor(COLOR_TEAL);
        sendBg.setCornerRadius(dp(12));
        sendBtn.setBackground(sendBg);
        LinearLayout.LayoutParams sendLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sendLp.setMargins(0, dp(16), 0, dp(8));
        sendBtn.setLayoutParams(sendLp);
        sendBtn.setOnClickListener(v -> {
            String vid = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
            logIssueToFirebase("ผู้ใช้กดส่งรายงานปัญหาด้วยตนเอง", -1, -1, true);
            new AlertDialog.Builder(this)
                    .setTitle("ส่งแล้ว ✓")
                    .setMessage("รายงานของ " + vid + " ถูกส่งเข้าระบบแล้ว")
                    .setPositiveButton("ตกลง", null).show();
        });
        container.addView(sendBtn);

        sv.addView(container);
        return sv;
    }

    // Mini card ที่ label คงที่ แต่ value มี tag สำหรับ update
    private LinearLayout buildDiagMiniCardTagged(String label, String valueTag) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(12));
        card.setBackground(bg);
        card.setElevation(dp(1));
        TextView lbl = new TextView(this);
        lbl.setText(label);
        lbl.setTextColor(COLOR_TEXT_MUTED);
        lbl.setTextSize(11);
        card.addView(lbl);
        TextView val = new TextView(this);
        val.setTag(valueTag);
        val.setTextColor(COLOR_NAVY);
        val.setTextSize(16);
        val.setTypeface(Typeface.DEFAULT_BOLD);
        val.setPadding(0, dp(4), 0, 0);
        card.addView(val);
        return card;
    }

    private void refreshDiagPageContent(android.view.View page) {
        if (page == null) return;
        ScrollView sv = (page instanceof ScrollView) ? (ScrollView) page : null;
        if (sv == null) return;
        LinearLayout container = (LinearLayout) sv.findViewWithTag("diag_container");
        if (container == null) return;

        // ===== ดึงข้อมูลปัจจุบัน =====
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String coords    = prefs.getString(KEY_LAST_COORDS, "—");
        boolean enabled  = prefs.getBoolean(KEY_ENABLED, false);
        long sent = prefs.getLong(KEY_LAST_SENT, 0);
        long sentAgoMs   = sent > 0 ? System.currentTimeMillis() - sent : -1;
        String sentAgo   = sentAgoMs >= 0 ? (sentAgoMs / 1000) + " วินาที" : "—";
        String nowTime   = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date());

        // ===== อัพเดทค่าโดยตรง (ไม่ rebuild layout) =====
        TextView clock = sv.findViewWithTag("diag_clock");
        if (clock != null) clock.setText("🔄 " + nowTime);

        // status card
        GradientDrawable statusBg = new GradientDrawable();
        statusBg.setColor(enabled ? Color.rgb(240, 253, 244) : Color.rgb(254, 242, 242));
        statusBg.setCornerRadius(dp(14));
        android.view.View statusCard = sv.findViewWithTag("diag_status_card");
        if (statusCard != null) statusCard.setBackground(statusBg);
        TextView statusIcon = sv.findViewWithTag("diag_status_icon");
        if (statusIcon != null) statusIcon.setText(enabled ? "🟢" : "🔴");
        TextView statusTitle = sv.findViewWithTag("diag_status_title");
        if (statusTitle != null) statusTitle.setText(enabled ? "กำลังส่งสัญญาณ" : "ปิดการส่งสัญญาณ");
        TextView statusSub = sv.findViewWithTag("diag_status_sub");
        if (statusSub != null) statusSub.setText(enabled ? "ระบบทำงานปกติ" : "กดปุ่ม 'เริ่มงาน' ที่หน้าหลัก");

        // mini cards
        TextView valVehicle = sv.findViewWithTag("diag_val_vehicle");
        if (valVehicle != null) valVehicle.setText(vehicleId);
        TextView valSent = sv.findViewWithTag("diag_val_sent");
        if (valSent != null) valSent.setText(sentAgo);
        String coordsShort = coords.length() > 16 ? coords.substring(0, 16) + "…" : coords;
        TextView valCoords = sv.findViewWithTag("diag_val_coords");
        if (valCoords != null) valCoords.setText(coordsShort);
        TextView valBattery = sv.findViewWithTag("diag_val_battery");
        if (valBattery != null) valBattery.setText(getBatteryPct() + "%");

        // ===== DiagItems — rebuild เฉพาะกล่องนี้ =====
        LinearLayout diagItemsContainer = sv.findViewWithTag("diag_items_container");
        if (diagItemsContainer != null) {
            diagItemsContainer.removeAllViews();
            if (enabled) {
                TextView diagTitle = new TextView(this);
                diagTitle.setText("การตรวจสอบระบบ");
                diagTitle.setTextColor(COLOR_NAVY);
                diagTitle.setTextSize(14);
                diagTitle.setTypeface(Typeface.DEFAULT_BOLD);
                LinearLayout.LayoutParams dTLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                dTLp.setMargins(0, dp(12), 0, dp(8));
                diagTitle.setLayoutParams(dTLp);
                diagItemsContainer.addView(diagTitle);

                for (DiagItem item : buildDiagItems()) {
                    LinearLayout row = new LinearLayout(this);
                    row.setOrientation(LinearLayout.VERTICAL);
                    row.setPadding(dp(14), dp(14), dp(14), dp(14));
                    GradientDrawable rowBg = new GradientDrawable();
                    rowBg.setColor(item.severity > 0 ? Color.rgb(254, 242, 242) : Color.rgb(240, 253, 244));
                    rowBg.setCornerRadius(dp(12));
                    row.setBackground(rowBg);
                    LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                    rowLp.setMargins(0, 0, 0, dp(8));
                    row.setLayoutParams(rowLp);

                    LinearLayout itemHead = new LinearLayout(this);
                    itemHead.setOrientation(LinearLayout.HORIZONTAL);
                    itemHead.setGravity(Gravity.CENTER_VERTICAL);
                    TextView itemIcon = new TextView(this);
                    itemIcon.setText(item.icon);
                    itemIcon.setTextSize(18);
                    LinearLayout.LayoutParams iiLp = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                    iiLp.setMargins(0, 0, dp(8), 0);
                    itemHead.addView(itemIcon, iiLp);
                    TextView itemTitle = new TextView(this);
                    itemTitle.setText(item.title);
                    itemTitle.setTextColor(COLOR_NAVY);
                    itemTitle.setTypeface(Typeface.DEFAULT_BOLD);
                    itemTitle.setTextSize(14);
                    itemHead.addView(itemTitle);
                    row.addView(itemHead);

                    TextView detailView = new TextView(this);
                    detailView.setText(item.detail);
                    detailView.setTextColor(item.severity > 0 ? COLOR_RED : COLOR_GREEN);
                    detailView.setTextSize(13);
                    detailView.setPadding(dp(26), dp(4), 0, 0);
                    detailView.setTypeface(Typeface.DEFAULT_BOLD);
                    row.addView(detailView);

                    if (item.cause != null) {
                        TextView causeView = new TextView(this);
                        causeView.setText(item.cause);
                        causeView.setTextColor(COLOR_TEXT_MUTED);
                        causeView.setTextSize(12);
                        causeView.setPadding(dp(26), dp(2), 0, 0);
                        row.addView(causeView);
                    }
                    if (item.settingsType != null) {
                        TextView fixHint = new TextView(this);
                        fixHint.setText("แตะเพื่อไปตั้งค่า ▸");
                        fixHint.setTextColor(COLOR_TEAL);
                        fixHint.setTextSize(12);
                        fixHint.setTypeface(Typeface.DEFAULT_BOLD);
                        fixHint.setPadding(dp(26), dp(6), 0, 0);
                        row.addView(fixHint);
                        row.setClickable(true);
                        row.setOnClickListener(v -> openRelevantSettings(item.settingsType));
                    }
                    diagItemsContainer.addView(row);
                }
            }
        }
    }

    // ===== Helper: การ์ดสถานะใหญ่ =====
    private LinearLayout buildDiagCard(String icon, String title, String sub, int bgColor) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dp(14));
        card.setBackground(bg);
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, 0, 0, dp(10));
        card.setLayoutParams(cardLp);

        TextView ic = new TextView(this);
        ic.setText(icon);
        ic.setTextSize(32);
        LinearLayout.LayoutParams icLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        icLp.setMargins(0, 0, dp(14), 0);
        card.addView(ic, icLp);

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        TextView t = new TextView(this);
        t.setText(title);
        t.setTextColor(COLOR_NAVY);
        t.setTextSize(17);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        textCol.addView(t);
        TextView s = new TextView(this);
        s.setText(sub);
        s.setTextColor(COLOR_TEXT_MUTED);
        s.setTextSize(12);
        textCol.addView(s);
        card.addView(textCol);
        return card;
    }

    // ===== Helper: แถว 2 คอลัมน์ข้อมูล =====
    private LinearLayout buildDiagRow2Col(String ic1, String lbl1, String val1,
                                           String ic2, String lbl2, String val2) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rowLp.setMargins(0, 0, 0, dp(8));
        row.setLayoutParams(rowLp);
        row.addView(buildDiagMiniCard(ic1, lbl1, val1), new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(dp(8), LinearLayout.LayoutParams.WRAP_CONTENT);
        row.addView(new android.view.View(this), gap);
        row.addView(buildDiagMiniCard(ic2, lbl2, val2), new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private LinearLayout buildDiagMiniCard(String icon, String label, String value) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(12));
        card.setBackground(bg);
        card.setElevation(dp(1));

        TextView ic = new TextView(this);
        ic.setText(icon + "  " + label);
        ic.setTextColor(COLOR_TEXT_MUTED);
        ic.setTextSize(11);
        card.addView(ic);

        TextView val = new TextView(this);
        val.setText(value);
        val.setTextColor(COLOR_NAVY);
        val.setTextSize(16);
        val.setTypeface(Typeface.DEFAULT_BOLD);
        val.setPadding(0, dp(4), 0, 0);
        card.addView(val);
        return card;
    }

    // ===== Helper: ดึง battery % =====
    private int getBatteryPct() {
        android.content.Intent bi = registerReceiver(null,
            new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
        if (bi == null) return -1;
        int level = bi.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
        int scale = bi.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
        return scale > 0 ? (int)(level * 100f / scale) : -1;
    }

    // ===== ข้อ 8: แถบ bottom nav 5 แท็บ =====
    private LinearLayout buildBottomNavBar() {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setBackgroundColor(COLOR_DEEP_NAVY);  // #0B1D3A
        nav.setElevation(dp(8));
        nav.setPadding(0, dp(8), 0, dp(12));

        for (int i = 0; i < NAV_LABELS.length; i++) {
            final int idx = i;
            LinearLayout tab = new LinearLayout(this);
            tab.setOrientation(LinearLayout.VERTICAL);
            tab.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.CENTER_VERTICAL);
            tab.setClickable(true);
            tab.setPadding(dp(4), dp(4), dp(4), dp(4));
            tab.setOnClickListener(v -> {
                animateTap(tab);
                selectNavTab(idx);
            });

            TextView icon = new TextView(this);
            icon.setText(NAV_ICONS[i]);
            icon.setTextSize(20);
            icon.setGravity(Gravity.CENTER);
            icon.setIncludeFontPadding(false);
            tab.addView(icon);

            TextView label = new TextView(this);
            label.setText(NAV_LABELS[i]);
            label.setTextSize(10);
            label.setGravity(Gravity.CENTER);
            label.setIncludeFontPadding(false);
            label.setPadding(0, dp(3), 0, 0);
            tab.addView(label);

            navTabs[i] = tab;
            navTabIcons[i] = icon;
            navTabLabels[i] = label;

            LinearLayout.LayoutParams tabLp = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            nav.addView(tab, tabLp);
        }

        LinearLayout.LayoutParams navLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        nav.setLayoutParams(navLp);
        return nav;
    }

    // ===== ข้อ 8: หน้า "เร็วๆนี้" สำหรับแท็บที่ยังไม่มีเนื้อหา — กันแอป crash ตอนกดแท็บ =====
    // =====================================================================
    // หน้า 1: รายงานวันนี้ — สรุปกะทำงาน รายได้ เส้นทาง (Grab/Lalamove style)
    // =====================================================================
    private ScrollView buildTodayReportPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_รายงานวันนี้");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setVisibility(android.view.View.GONE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(52), dp(16), dp(80));
        root.setTag("today_report_root");
        sv.addView(root);
        buildTodayReportContent(root);
        return sv;
    }

    private void buildTodayReportContent(LinearLayout root) {
        root.removeAllViews();
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String today = new java.text.SimpleDateFormat("dd MMM yyyy", new java.util.Locale("th")).format(new java.util.Date());

        // Header
        TextView header = new TextView(this);
        header.setText("📋  รายงานวันนี้");
        header.setTextColor(COLOR_NAVY);
        header.setTextSize(20);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        header.setPadding(0, 0, 0, dp(4));
        root.addView(header);
        TextView dateLabel = new TextView(this);
        dateLabel.setText(today + "  |  " + vehicleId);
        dateLabel.setTextColor(COLOR_TEXT_MUTED);
        dateLabel.setTextSize(12);
        LinearLayout.LayoutParams dateLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dateLp.setMargins(0, 0, 0, dp(16));
        dateLabel.setLayoutParams(dateLp);
        root.addView(dateLabel);

        // === การ์ดสรุปกะ ===
        root.addView(buildSectionCard("⏱  สรุปกะวันนี้", new String[][]{
            {"เวลาเริ่มงาน",  prefs.getString("today_start_time", "--:--")},
            {"เวลาสิ้นสุด",   prefs.getString("today_end_time",   "--:--")},
            {"ชั่วโมงทำงาน", prefs.getString("today_active_hrs", "0") + " ชม."},
            {"สัญญาณ GPS หาย", prefs.getString("today_gps_down", "0") + " นาที"},
        }));

        // === การ์ดผู้โดยสาร ===
        int totalPax = prefs.getInt("today_total_pax", 0);
        int checkedIn = prefs.getInt("today_checked_in", 0);
        int notChecked = totalPax - checkedIn;
        root.addView(buildSectionCard("🧑‍🤝‍🧑  ผู้โดยสารวันนี้", new String[][]{
            {"จองทั้งหมด",   String.valueOf(totalPax) + " คน"},
            {"เช็คอินแล้ว",  String.valueOf(checkedIn) + " คน"},
            {"ยังไม่เช็คอิน", String.valueOf(notChecked) + " คน"},
        }));

        // === การ์ดเส้นทาง ===
        root.addView(buildSectionCard("🗺  เส้นทางวันนี้", new String[][]{
            {"เส้นทาง",   "สนามชัยเขต → ฉะเชิงเทรา"},
            {"คิวที่วิ่ง", prefs.getString(KEY_TODAY_QUEUE, "—")},
            {"เที่ยวทั้งหมด", prefs.getString("today_trips", "—") + " เที่ยว"},
        }));

        // === ปุ่ม refresh ===
        TextView refreshBtn = new TextView(this);
        refreshBtn.setText("🔄  รีเฟรชข้อมูล");
        refreshBtn.setTextColor(COLOR_TEAL);
        refreshBtn.setTextSize(13);
        refreshBtn.setTypeface(Typeface.DEFAULT_BOLD);
        refreshBtn.setGravity(Gravity.CENTER);
        refreshBtn.setPadding(0, dp(16), 0, 0);
        refreshBtn.setOnClickListener(v -> buildTodayReportContent(root));
        root.addView(refreshBtn);
    }

    // =====================================================================
    // หน้า 2: รายงาน — ประวัติย้อนหลัง + สถิติ (Lalamove earnings history)
    // =====================================================================
    private ScrollView buildReportHistoryPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_รายงาน");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setVisibility(android.view.View.GONE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(52), dp(16), dp(80));
        sv.addView(root);

        TextView header = new TextView(this);
        header.setText("📊  รายงาน & สถิติ");
        header.setTextColor(COLOR_NAVY);
        header.setTextSize(20);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams hLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hLp.setMargins(0, 0, 0, dp(16));
        header.setLayoutParams(hLp);
        root.addView(header);

        // สถิติรวม
        root.addView(buildSectionCard("📈  สถิติรวมทั้งหมด", new String[][]{
            {"วันที่ทำงาน",   prefs.getString("stat_total_days", "0") + " วัน"},
            {"เที่ยวรวม",     prefs.getString("stat_total_trips", "0") + " เที่ยว"},
            {"ผู้โดยสารรวม",  prefs.getString("stat_total_pax", "0") + " คน"},
            {"ชั่วโมงรวม",    prefs.getString("stat_total_hrs", "0") + " ชม."},
        }));

        // สัปดาห์นี้
        root.addView(buildSectionCard("📅  สัปดาห์นี้", new String[][]{
            {"วันทำงาน",   prefs.getString("stat_week_days", "0") + " วัน"},
            {"เที่ยววิ่ง",  prefs.getString("stat_week_trips", "0") + " เที่ยว"},
            {"ผู้โดยสาร",  prefs.getString("stat_week_pax", "0") + " คน"},
        }));

        // ประวัติ GPS
        root.addView(buildSectionCard("📡  ประวัติสัญญาณ GPS", new String[][]{
            {"เฉลี่ยสัญญาณหาย/วัน", prefs.getString("stat_avg_gps_down", "0") + " นาที"},
            {"ครั้งที่ reconnect",    prefs.getString("stat_reconnect_count", "0") + " ครั้ง"},
            {"uptime เฉลี่ย",         prefs.getString("stat_avg_uptime", "—")},
        }));

        // หมายเหตุ
        TextView note = new TextView(this);
        note.setText("* ข้อมูลอัพเดทจากระบบทุกครั้งที่สิ้นสุดกะ");
        note.setTextColor(COLOR_TEXT_MUTED);
        note.setTextSize(11);
        note.setPadding(0, dp(8), 0, 0);
        root.addView(note);
        return sv;
    }

    // =====================================================================
    // หน้า 3: แจ้งเตือน — รายการ notification พร้อมประเภทและเวลา
    // =====================================================================
    private ScrollView buildNotificationPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_แจ้งเตือน");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setVisibility(android.view.View.GONE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(52), dp(16), dp(80));
        root.setTag("notif_page_root");
        sv.addView(root);
        buildNotifContent(root);
        return sv;
    }

    private void buildNotifContent(LinearLayout root) {
        root.removeAllViews();

        // Header row
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams hrLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hrLp.setMargins(0, 0, 0, dp(16));
        headerRow.setLayoutParams(hrLp);
        TextView header = new TextView(this);
        header.setText("🔔  การแจ้งเตือน");
        header.setTextColor(COLOR_NAVY);
        header.setTextSize(20);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        headerRow.addView(header, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        // ปุ่มล้าง
        TextView clearBtn = new TextView(this);
        clearBtn.setText("ล้างทั้งหมด");
        clearBtn.setTextColor(COLOR_TEAL);
        clearBtn.setTextSize(12);
        clearBtn.setTypeface(Typeface.DEFAULT_BOLD);
        clearBtn.setOnClickListener(v -> {
            notifMessages.clear();
            unreadNotifCount = 0;
            updateNotifBubble();
            buildNotifContent(root);
        });
        headerRow.addView(clearBtn);
        root.addView(headerRow);

        if (notifMessages.isEmpty()) {
            LinearLayout empty = new LinearLayout(this);
            empty.setOrientation(LinearLayout.VERTICAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, dp(60), 0, 0);
            TextView emptyIcon = new TextView(this);
            emptyIcon.setText("🔕");
            emptyIcon.setTextSize(40);
            emptyIcon.setGravity(Gravity.CENTER);
            empty.addView(emptyIcon);
            TextView emptyText = new TextView(this);
            emptyText.setText("ยังไม่มีการแจ้งเตือน");
            emptyText.setTextColor(COLOR_TEXT_MUTED);
            emptyText.setTextSize(14);
            emptyText.setGravity(Gravity.CENTER);
            emptyText.setPadding(0, dp(8), 0, 0);
            empty.addView(emptyText);
            root.addView(empty);
            return;
        }

        // แสดงรายการล่าสุดก่อน
        java.util.List<String> reversed = new java.util.ArrayList<>(notifMessages);
        java.util.Collections.reverse(reversed);
        for (String msg : reversed) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.HORIZONTAL);
            card.setPadding(dp(14), dp(14), dp(14), dp(14));
            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(Color.WHITE);
            cardBg.setCornerRadius(dp(12));
            card.setBackground(cardBg);
            card.setElevation(dp(1));
            LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            cardLp.setMargins(0, 0, 0, dp(8));
            card.setLayoutParams(cardLp);

            // dot indicator
            android.view.View dot = new android.view.View(this);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setShape(GradientDrawable.OVAL);
            dotBg.setColor(COLOR_TEAL);
            dot.setBackground(dotBg);
            LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(8), dp(8));
            dotLp.gravity = Gravity.CENTER_VERTICAL;
            dotLp.setMargins(0, 0, dp(12), 0);
            card.addView(dot, dotLp);

            TextView msgView = new TextView(this);
            msgView.setText(msg);
            msgView.setTextColor(COLOR_NAVY);
            msgView.setTextSize(13);
            card.addView(msgView);
            root.addView(card);
        }

        // เมื่อเปิดหน้านี้ reset badge
        unreadNotifCount = 0;
        updateNotifBubble();
    }

    // =====================================================================
    // หน้า 4: บัญชี — ข้อมูลคนขับ ตั้งค่า (Grab driver profile)
    // =====================================================================
    private ScrollView buildAccountPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_บัญชี");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setVisibility(android.view.View.GONE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(52), dp(16), dp(80));
        sv.addView(root);

        // Profile header card
        LinearLayout profileCard = new LinearLayout(this);
        profileCard.setOrientation(LinearLayout.HORIZONTAL);
        profileCard.setGravity(Gravity.CENTER_VERTICAL);
        profileCard.setPadding(dp(16), dp(20), dp(16), dp(20));
        GradientDrawable profileBg = new GradientDrawable();
        profileBg.setColor(COLOR_NAVY);
        profileBg.setCornerRadius(dp(16));
        profileCard.setBackground(profileBg);
        LinearLayout.LayoutParams pcLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pcLp.setMargins(0, 0, 0, dp(16));
        profileCard.setLayoutParams(pcLp);

        // Avatar วงกลม
        FrameLayout avatar = new FrameLayout(this);
        GradientDrawable avBg = new GradientDrawable();
        avBg.setShape(GradientDrawable.OVAL);
        avBg.setColor(COLOR_TEAL);
        avatar.setBackground(avBg);
        LinearLayout.LayoutParams avLp = new LinearLayout.LayoutParams(dp(56), dp(56));
        avLp.setMargins(0, 0, dp(14), 0);
        avatar.setLayoutParams(avLp);
        TextView avIcon = new TextView(this);
        avIcon.setText("👤");
        avIcon.setTextSize(24);
        avIcon.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams avIconLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        avIconLp.gravity = Gravity.CENTER;
        avatar.addView(avIcon, avIconLp);
        profileCard.addView(avatar);

        LinearLayout profileInfo = new LinearLayout(this);
        profileInfo.setOrientation(LinearLayout.VERTICAL);
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, "—");
        TextView driverName = new TextView(this);
        driverName.setText("คนขับ — " + vehicleId);
        driverName.setTextColor(Color.WHITE);
        driverName.setTextSize(16);
        driverName.setTypeface(Typeface.DEFAULT_BOLD);
        profileInfo.addView(driverName);
        TextView driverSub = new TextView(this);
        driverSub.setText("ST Transit  •  v" + BuildConfig.VERSION_NAME);
        driverSub.setTextColor(Color.argb(180, 255, 255, 255));
        driverSub.setTextSize(12);
        driverSub.setPadding(0, dp(4), 0, 0);
        profileInfo.addView(driverSub);
        profileCard.addView(profileInfo);
        root.addView(profileCard);

        // ข้อมูลรถ
        root.addView(buildSectionCard("🚌  ข้อมูลรถที่ใช้", new String[][]{
            {"รหัสรถ",       vehicleId},
            {"เวอร์ชันแอพ",  BuildConfig.VERSION_NAME + " (code " + BuildConfig.VERSION_CODE + ")"},
            {"คิววันนี้",     prefs.getString(KEY_TODAY_QUEUE, "—")},
        }));

        // ตั้งค่าแอพ
        root.addView(buildMenuCard("⚙️  ตั้งค่า", new String[][]{
            {"📍", "ตั้งค่า Location",     "เปิด High Accuracy",       "location"},
            {"🔋", "ตั้งค่าแบตเตอรี่",     "ปิดการประหยัดพลังงาน",     "battery"},
            {"🔔", "การแจ้งเตือน",          "ตั้งค่าการแจ้งเตือนแอพ",   "notification"},
        }));

        // เกี่ยวกับ
        root.addView(buildSectionCard("ℹ️  เกี่ยวกับ", new String[][]{
            {"ผู้พัฒนา",     "S.L. Transit"},
            {"เส้นทาง",     "สนามชัยเขต → ฉะเชิงเทรา"},
            {"ติดต่อ",       "admin@st-transit.com"},
        }));

        // ปุ่ม logout / เปลี่ยนรถ
        TextView changeVehicleBtn = new TextView(this);
        changeVehicleBtn.setText("🔄  เปลี่ยนรหัสรถ");
        changeVehicleBtn.setTextColor(Color.WHITE);
        changeVehicleBtn.setTextSize(14);
        changeVehicleBtn.setTypeface(Typeface.DEFAULT_BOLD);
        changeVehicleBtn.setGravity(Gravity.CENTER);
        changeVehicleBtn.setPadding(dp(20), dp(14), dp(20), dp(14));
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(COLOR_OCEAN);
        btnBg.setCornerRadius(dp(12));
        changeVehicleBtn.setBackground(btnBg);
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnLp.setMargins(0, dp(8), 0, dp(8));
        changeVehicleBtn.setLayoutParams(btnLp);
        changeVehicleBtn.setOnClickListener(v -> showVehicleDialog());
        root.addView(changeVehicleBtn);
        return sv;
    }

    // ===== Helper: Section card (label → value rows) =====
    private LinearLayout buildSectionCard(String title, String[][] rows) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        card.setBackground(bg);
        card.setElevation(dp(1));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, 0, 0, dp(12));
        card.setLayoutParams(cardLp);

        TextView titleTv = new TextView(this);
        titleTv.setText(title);
        titleTv.setTextColor(COLOR_NAVY);
        titleTv.setTextSize(13);
        titleTv.setTypeface(Typeface.DEFAULT_BOLD);
        titleTv.setPadding(0, 0, 0, dp(10));
        card.addView(titleTv);

        for (String[] row : rows) {
            LinearLayout rowLayout = new LinearLayout(this);
            rowLayout.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            rowLp.setMargins(0, 0, 0, dp(6));
            rowLayout.setLayoutParams(rowLp);
            TextView labelTv = new TextView(this);
            labelTv.setText(row[0]);
            labelTv.setTextColor(COLOR_TEXT_MUTED);
            labelTv.setTextSize(13);
            rowLayout.addView(labelTv, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            TextView valueTv = new TextView(this);
            valueTv.setText(row[1]);
            valueTv.setTextColor(COLOR_NAVY);
            valueTv.setTextSize(13);
            valueTv.setTypeface(Typeface.DEFAULT_BOLD);
            valueTv.setGravity(Gravity.END);
            rowLayout.addView(valueTv, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            card.addView(rowLayout);
        }
        return card;
    }

    // ===== Helper: Menu card (settings rows with tap action) =====
    private LinearLayout buildMenuCard(String title, String[][] items) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(4));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        card.setBackground(bg);
        card.setElevation(dp(1));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, 0, 0, dp(12));
        card.setLayoutParams(cardLp);

        TextView titleTv = new TextView(this);
        titleTv.setText(title);
        titleTv.setTextColor(COLOR_NAVY);
        titleTv.setTextSize(13);
        titleTv.setTypeface(Typeface.DEFAULT_BOLD);
        titleTv.setPadding(0, 0, 0, dp(10));
        card.addView(titleTv);

        for (String[] item : items) {
            // item = {icon, label, subtitle, settingsType}
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(10), 0, dp(10));
            row.setClickable(true);
            String settingsType = item[3];
            row.setOnClickListener(v -> openRelevantSettings(settingsType));

            TextView iconTv = new TextView(this);
            iconTv.setText(item[0]);
            iconTv.setTextSize(18);
            LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            iconLp.setMargins(0, 0, dp(12), 0);
            row.addView(iconTv, iconLp);

            LinearLayout textCol = new LinearLayout(this);
            textCol.setOrientation(LinearLayout.VERTICAL);
            TextView labelTv = new TextView(this);
            labelTv.setText(item[1]);
            labelTv.setTextColor(COLOR_NAVY);
            labelTv.setTextSize(13);
            labelTv.setTypeface(Typeface.DEFAULT_BOLD);
            textCol.addView(labelTv);
            TextView subTv = new TextView(this);
            subTv.setText(item[2]);
            subTv.setTextColor(COLOR_TEXT_MUTED);
            subTv.setTextSize(11);
            textCol.addView(subTv);
            row.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            TextView chevron = new TextView(this);
            chevron.setText("›");
            chevron.setTextColor(COLOR_TEXT_MUTED);
            chevron.setTextSize(20);
            row.addView(chevron);
            card.addView(row);

            // divider (ยกเว้นบรรทัดสุดท้าย)
            if (!item.equals(items[items.length - 1])) {
                android.view.View divider = new android.view.View(this);
                divider.setBackgroundColor(Color.argb(30, 0, 0, 0));
                card.addView(divider, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, 1));
            }
        }
        return card;
    }

    // =====================================================================
    // buildComingSoonPage — fallback กรณี index เกิน
    // =====================================================================
    private LinearLayout buildComingSoonPage(String label) {
        // ไม่ควรถูกเรียกแล้ว เหลือไว้ป้องกัน index เกิน
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setBackgroundColor(COLOR_BG_PAGE);
        page.setVisibility(android.view.View.GONE);
        page.setTag("nav_page_" + label);
        TextView text = new TextView(this);
        text.setText("🚧  " + label);
        text.setTextColor(COLOR_TEXT_MUTED);
        text.setTextSize(14);
        text.setGravity(Gravity.CENTER);
        page.addView(text);
        page.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        return page;
    }

    // ===== ข้อ 8: สลับหน้าตามแท็บที่กด + ไฮไลท์แท็บที่เลือก =====
    private void selectNavTab(int index) {
        // หยุด auto-refresh ถ้าออกจากหน้า diagnostic
        if (currentNavIndex != index) stopDiagRefresh();
        currentNavIndex = index;
        for (int i = 0; i < contentContainer.getChildCount(); i++) {
            android.view.View child = contentContainer.getChildAt(i);
            boolean isHome = (child == homeScroll);
            boolean shouldShow = (index == 0 && isHome) || (!isHome && ("nav_page_" + NAV_LABELS[index]).equals(child.getTag()));
            child.setVisibility(shouldShow ? android.view.View.VISIBLE : android.view.View.GONE);
        }
        // refresh หน้าแจ้งเตือน + reset badge เมื่อเปิด
        if (index == 3) {
            android.view.View notifPage = contentContainer.findViewWithTag("nav_page_แจ้งเตือน");
            if (notifPage instanceof ScrollView) {
                LinearLayout notifRoot = ((LinearLayout)((ScrollView) notifPage).getChildAt(0));
                if (notifRoot != null && "notif_page_root".equals(notifRoot.getTag())) {
                    buildNotifContent(notifRoot);
                }
            }
        }
        for (int i = 0; i < navTabs.length; i++) {
            boolean active = (i == index);
            // bg = Navy #0B1D3A → active=ขาว, inactive=ขาวจาง 60%
            int color = active ? Color.WHITE : Color.argb(153, 255, 255, 255);
            navTabIcons[i].setTextColor(color);
            navTabLabels[i].setTextColor(color);
            navTabLabels[i].setTypeface(active ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            // underline indicator ใต้ไอคอน active
            if (active) {
                GradientDrawable dot = new GradientDrawable();
                dot.setShape(GradientDrawable.RECTANGLE);
                dot.setCornerRadius(dp(2));
                dot.setColor(COLOR_TEAL);
                dot.setSize(dp(20), dp(3));
                navTabIcons[i].setCompoundDrawablesWithIntrinsicBounds(null, null, null, dot);
            } else {
                navTabIcons[i].setCompoundDrawablesWithIntrinsicBounds(null, null, null, null);
            }
        }
    }

    // ===== ข้อ 5: "นำทาง" — เปิด Google Maps มุ่งหน้าไปป้ายถัดไป (ถ้ามีข้อมูลพิกัดแล้ว) =====
    private void openExternalNavigation() {
        if (nextStopCoords == null) {
            new AlertDialog.Builder(this)
                    .setTitle("ยังไม่มีพิกัดจุดหมายถัดไป")
                    .setMessage("ระบบยังไม่มีรายชื่อป้าย/พิกัดของเส้นทางนี้ กรุณารอข้อมูลจาก ST Transit")
                    .setPositiveButton("ตกลง", null).show();
            return;
        }
        try {
            Uri uri = Uri.parse("google.navigation:q=" + nextStopCoords[0] + "," + nextStopCoords[1]);
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.setPackage("com.google.android.apps.maps");
            startActivity(intent);
        } catch (Exception e) {
            Uri uri = Uri.parse("geo:" + nextStopCoords[0] + "," + nextStopCoords[1]);
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        }
    }

    // ===== ข้อ 5: "ติดตามตำแหน่ง" — เลื่อนไปโชว์การ์ดการเดินทางปัจจุบัน =====
    private void scrollToTravelCard() {
        if (currentNavIndex != 0) selectNavTab(0);
        if (homeScroll != null && travelCard != null) {
            homeScroll.post(() -> homeScroll.smoothScrollTo(0, travelCard.getTop()));
        }
    }

    private void animateTap(android.view.View v) {
        v.animate().scaleX(0.95f).scaleY(0.95f).setDuration(80)
                .setInterpolator(new DecelerateInterpolator())
                .withEndAction(() ->
                        v.animate().scaleX(1f).scaleY(1f).setDuration(120)
                                .setInterpolator(new DecelerateInterpolator()).start()
                ).start();
    }

    private void animateCoordsChange(String newCoords) {
        if (newCoords.equals(lastCoords)) return;
        lastCoords = newCoords;
        coordsText.animate().translationY(dp(8)).alpha(0f).setDuration(150)
                .setInterpolator(new AccelerateDecelerateInterpolator())
                .withEndAction(() -> {
                    coordsText.setText(newCoords);
                    coordsText.setTranslationY(-dp(8));
                    coordsText.animate().translationY(0f).alpha(1f).setDuration(200)
                            .setInterpolator(new DecelerateInterpolator()).start();
                }).start();
    }

    private void animateStatusChange(String newStatus, int color) {
        if (newStatus.equals(lastStatus)) return;
        lastStatus = newStatus;
        statusBadge.animate().alpha(0f).setDuration(150).withEndAction(() -> {
            statusBadge.setText(newStatus);
            statusBadge.setTextColor(color);
            statusBadge.animate().alpha(1f).setDuration(200).start();
        }).start();
    }

    private void animateSentTime(String time) {
        sentTimeText.animate().alpha(0.3f).setDuration(100).withEndAction(() -> {
            sentTimeText.setText(time);
            sentTimeText.animate().alpha(1f).setDuration(200).start();
        }).start();
    }

    // ---- Dialog เลือกรถ + ล็อคคันที่ online อยู่ ----
    private void showVehicleDialog() {
        String myCurrentId = prefs.getString(KEY_VEHICLE_ID, null);
        boolean iAmOnline = prefs.getBoolean(KEY_ENABLED, false);

        // สร้าง label แต่ละตัวเลือก — ขีดค่าถ้าถูกใช้อยู่
        android.text.SpannableString[] labels = new android.text.SpannableString[VEHICLE_IDS.length];
        boolean[] isBlocked = new boolean[VEHICLE_IDS.length];
        for (int i = 0; i < VEHICLE_IDS.length; i++) {
            String id = VEHICLE_IDS[i];
            boolean onlineByOther = Boolean.TRUE.equals(vehicleOnlineMap.get(id))
                    && !(id.equals(myCurrentId) && iAmOnline);
            isBlocked[i] = onlineByOther;
            String raw = onlineByOther ? id + "  (ใช้งานอยู่)" : id;
            android.text.SpannableString ss = new android.text.SpannableString(raw);
            if (onlineByOther) {
                ss.setSpan(new android.text.style.StrikethroughSpan(), 0, raw.length(), 0);
                ss.setSpan(new android.text.style.ForegroundColorSpan(COLOR_TEXT_MUTED), 0, raw.length(), 0);
            }
            labels[i] = ss;
        }

        int currentIdx = -1;
        for (int i = 0; i < VEHICLE_IDS.length; i++) {
            if (VEHICLE_IDS[i].equals(myCurrentId)) { currentIdx = i; break; }
        }

        new AlertDialog.Builder(this)
                .setTitle("เลือกรหัสรถ")
                .setSingleChoiceItems(labels, currentIdx, (dialog, which) -> {
                    if (isBlocked[which]) {
                        new AlertDialog.Builder(this)
                                .setTitle("ไม่สามารถเลือกได้")
                                .setMessage(VEHICLE_IDS[which] + " กำลังถูกใช้งานอยู่\nกรุณาเลือกรหัสรถอื่น")
                                .setPositiveButton("ตกลง", null).show();
                        return;
                    }
                    String selectedId = VEHICLE_IDS[which];
                    prefs.edit().putString(KEY_VEHICLE_ID, selectedId).apply();
                    vehiclePickerText.setText(selectedId + "\n▾");
                    if (versionLabel != null)
                        versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + selectedId + ")");
                    dialog.dismiss();
                    refreshTodaySchedule();
                    if (iAmOnline) { stopGpsService(); startGpsService(); }
                })
                .setNegativeButton("ยกเลิก", null)
                .show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requestPermissionsThenStart() {
        if (Build.VERSION.SDK_INT < 23) { startGpsService(); return; }
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if (permissions.isEmpty()) startGpsService();
        else requestPermissions(permissions.toArray(new String[0]), 10);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == 10 && hasLocationPermission()) startGpsService();
        else if (requestCode == 30) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) openQrScanner();
        }
        else refreshUi();
    }

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void toggleServiceSafely() {
        if (serviceTransitionInProgress) return;
        serviceTransitionInProgress = true;
        setServiceControlsEnabled(false);
        try {
            toggleService();
        } catch (Exception error) {
            handleServiceCommandError(error);
        }
        uiHandler.postDelayed(() -> {
            serviceTransitionInProgress = false;
            setServiceControlsEnabled(true);
            refreshUi();
        }, SERVICE_TRANSITION_LOCK_MS);
    }

    private void setServiceControlsEnabled(boolean enabled) {
        if (startWorkButton != null) {
            startWorkButton.setClickable(enabled);
            startWorkButton.setAlpha(enabled ? 1f : 0.6f);
        }
        if (mainButton != null) mainButton.setEnabled(enabled);
    }

    private void handleServiceCommandError(Exception error) {
        prefs.edit().putBoolean(KEY_ENABLED, false)
                .putString(KEY_LAST_ERROR, error.getMessage() == null ? "service command failed" : error.getMessage())
                .apply();
        serviceTransitionInProgress = false;
        setServiceControlsEnabled(true);
        refreshUi();
    }

    private void toggleService() {
        if (prefs.getBoolean(KEY_ENABLED, false)) stopGpsService();
        else requestPermissionsThenStart();
    }

    private void startGpsService() {
        prefs.edit().putBoolean(KEY_ENABLED, true).apply();
        try { FirebaseDatabase.getInstance().goOffline(); } catch (Exception ignored) {}
        uiHandler.postDelayed(() -> {
            try {
                FirebaseDatabase.getInstance().goOnline();
                Intent intent = new Intent(this, GpsService.class);
                intent.setAction(GpsService.ACTION_START);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
                else startService(intent);
                requestBatteryUnrestrictedIfNeeded();
                refreshUi();
            } catch (Exception error) {
                handleServiceCommandError(error);
            }
        }, 600);
    }

    private void stopGpsService() {
        try {
            Intent intent = new Intent(this, GpsService.class);
            intent.setAction(GpsService.ACTION_STOP);
            startService(intent);
            prefs.edit().putBoolean(KEY_ENABLED, false).apply();
            refreshUi();
        } catch (Exception error) {
            handleServiceCommandError(error);
        }
    }
    private void requestBatteryUnrestrictedIfNeeded() {
        if (Build.VERSION.SDK_INT < 23) return;
        if (prefs.getBoolean(KEY_BATTERY_PROMPTED, false)) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            prefs.edit().putBoolean(KEY_BATTERY_PROMPTED, true).apply();
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            try {
                Intent settings = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivity(settings);
            } catch (Exception ignored) {}
        }
    }

    // ===== Diagnostic Panel =====
    private void refreshDiagnostics() {
        if (diagPanel == null) return;
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        if (!enabled) { diagPanel.setVisibility(android.view.View.GONE); return; }
        diagPanel.setVisibility(diagVisible ? android.view.View.VISIBLE : android.view.View.GONE);

        // 1. GPS Health
        long lastGpsAt = prefs.getLong(KEY_LAST_GPS_AT, 0);
        long gpsAgoSec = lastGpsAt > 0 ? (System.currentTimeMillis() - lastGpsAt) / 1000 : -1;
        String gpsIcon, gpsDiag;
        if (gpsAgoSec < 0)       { gpsIcon = "🔴"; gpsDiag = "GPS: ยังไม่ได้รับสัญญาณ"; }
        else if (gpsAgoSec < 30) { gpsIcon = "🟢"; gpsDiag = "GPS: ปกติ (" + gpsAgoSec + "s ที่แล้ว)"; }
        else if (gpsAgoSec < 90) { gpsIcon = "🟡"; gpsDiag = "GPS: สัญญาณอ่อน (" + gpsAgoSec + "s ที่แล้ว)"; }
        else                     { gpsIcon = "🔴"; gpsDiag = "GPS: หาย (" + gpsAgoSec + "s ที่แล้ว)"; }

        // 2. Firebase Health
        long sentAt = prefs.getLong(KEY_LAST_SENT, 0);
        long fbAgoSec = sentAt > 0 ? (System.currentTimeMillis() - sentAt) / 1000 : -1;
        String fbIcon, fbDiag;
        if (fbAgoSec < 0)        { fbIcon = "🔴"; fbDiag = "Firebase: ยังไม่ได้ส่ง"; }
        else if (fbAgoSec < 30)  { fbIcon = "🟢"; fbDiag = "Firebase: ปกติ (" + fbAgoSec + "s ที่แล้ว)"; }
        else if (fbAgoSec < 90)  { fbIcon = "🟡"; fbDiag = "Firebase: ช้า (" + fbAgoSec + "s ที่แล้ว)"; }
        else                     { fbIcon = "🔴"; fbDiag = "Firebase: ขาดการเชื่อมต่อ (" + fbAgoSec + "s ที่แล้ว)"; }

        // 3. Service Health (kill detection)
        long lastRestart = prefs.getLong(KEY_LAST_RESTART, 0);
        int restartCount = prefs.getInt(KEY_RESTART_COUNT, 0);
        String svcIcon, svcDiag;
        if (restartCount == 0)   { svcIcon = "🟢"; svcDiag = "Service: ปกติ (ไม่เคยถูก kill)"; }
        else if (restartCount < 3) { svcIcon = "🟡"; svcDiag = "Service: restart " + restartCount + " ครั้ง"; }
        else                     { svcIcon = "🔴"; svcDiag = "Service: restart บ่อย " + restartCount + " ครั้ง"; }

        // 4. Battery Optimization
        String battIcon, battDiag;
        if (Build.VERSION.SDK_INT >= 23) {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            boolean ignored = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            battIcon = ignored ? "🟢" : "🔴";
            battDiag = ignored ? "Battery: ไม่จำกัด ✓" : "Battery: ถูกจำกัด (กดเพื่อแก้ไข)";
        } else {
            battIcon = "🟢"; battDiag = "Battery: ไม่จำกัด ✓";
        }

        // 5. Background Location
        String bgLocIcon, bgLocDiag;
        if (Build.VERSION.SDK_INT >= 29) {
            boolean hasBg = checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
            bgLocIcon = hasBg ? "🟢" : "🟡";
            bgLocDiag = hasBg ? "Location: อนุญาตตลอดเวลา ✓" : "Location: อนุญาตเฉพาะตอนใช้งาน";
        } else {
            bgLocIcon = "🟢"; bgLocDiag = "Location: อนุญาตแล้ว ✓";
        }

        StringBuilder sb = new StringBuilder();
        sb.append(gpsIcon).append(" ").append(gpsDiag).append("\n");
        sb.append(fbIcon).append(" ").append(fbDiag).append("\n");
        sb.append(svcIcon).append(" ").append(svcDiag).append("\n");
        sb.append(battIcon).append(" ").append(battDiag).append("\n");
        sb.append(bgLocIcon).append(" ").append(bgLocDiag);
        String report = sb.toString();

        diagPanel.setText(report);
        updateReadinessCard(gpsAgoSec, fbAgoSec);
        refreshRouteProgress();

        // แจ้งเตือนถ้ามีปัญหา — แสดงผลในหน้าจอ + บันทึกขึ้น Firebase เท่านั้น (ไม่ขึ้นกระดิ่ง)
        StringBuilder errSb = new StringBuilder();
        if (gpsAgoSec > 90) errSb.append("⚠ GPS หาย กรุณาตรวจสอบสัญญาณ\n");
        if (fbAgoSec > 90)  errSb.append("⚠ Firebase ขาดการเชื่อมต่อ ตรวจสอบอินเทอร์เน็ต\n");
        if (restartCount >= 3) errSb.append("⚠ แอปถูก kill บ่อย ตรวจสอบการตั้งค่า Battery\n");
        // ===== บันทึกสถิติ "สัญญาณหาย" รายวัน เพื่อดูว่าทำงานครบทั้งวันไหม =====
        trackDailyUptime(gpsAgoSec > 90, fbAgoSec > 90);

        if (errSb.length() > 0) {
            errorText.setText(errSb.toString().trim());
            errorText.setVisibility(android.view.View.VISIBLE);
            logIssueToFirebase(errSb.toString().trim(), gpsAgoSec, fbAgoSec);
        }
    }

    // ===== สถิติสัญญาณหายรายวัน (เช็คว่าทำงานต่อเนื่องตลอดวันไหม) =====
    private long lastDailyStatsWriteAt = 0;
    private void trackDailyUptime(boolean gpsDown, boolean fbDown) {
        try {
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
            String dateKey = prefs.getString("daily_stats_date", "");
            int gpsDownSec = prefs.getInt("daily_gps_down_sec", 0);
            int fbDownSec  = prefs.getInt("daily_fb_down_sec", 0);
            int activeSec  = prefs.getInt("daily_active_sec", 0);
            if (!today.equals(dateKey)) {
                dateKey = today; gpsDownSec = 0; fbDownSec = 0; activeSec = 0;
            }
            activeSec += 1;
            if (gpsDown) gpsDownSec += 1;
            if (fbDown)  fbDownSec  += 1;

            // เขียน SharedPreferences ทุก 10 วินาที (ไม่ใช่ทุก 1 วินาที — ลด I/O บน Android รุ่นเก่า)
            if (activeSec % 10 == 0) {
                prefs.edit()
                        .putString("daily_stats_date", dateKey)
                        .putInt("daily_gps_down_sec", gpsDownSec)
                        .putInt("daily_fb_down_sec",  fbDownSec)
                        .putInt("daily_active_sec",   activeSec)
                        .apply();
            }

            // เขียนขึ้น Firebase ทุก 30 วินาที
            long now = System.currentTimeMillis();
            if (now - lastDailyStatsWriteAt < 30000) return;
            lastDailyStatsWriteAt = now;
            refreshPassengerSummary(); // อัพเดทแถบสรุปผู้โดยสารพร้อมกันทุก 30 วินาที
            try {
                String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
                Map<String, Object> data = new HashMap<>();
                data.put("date", dateKey);
                data.put("activeSec", activeSec);
                data.put("gpsDownSec", gpsDownSec);
                data.put("fbDownSec",  fbDownSec);
                data.put("updatedAt",  now);
                FirebaseDatabase.getInstance()
                        .getReference("settings/vehicles/" + vehicleId + "/dailyStats")
                        .setValue(data);
            } catch (Exception ignored) {}
        } catch (Exception ignored) {}
    }

    // ===== "กล่องดำ" — ส่งบันทึกปัญหาขึ้น Firebase ให้ admin ตรวจสอบได้ =====
    private long lastIssueLogAt = 0;
    private void logIssueToFirebase(String message, long gpsAgoSec, long fbAgoSec) {
        logIssueToFirebase(message, gpsAgoSec, fbAgoSec, false);
    }
    private void logIssueToFirebase(String message, long gpsAgoSec, long fbAgoSec, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastIssueLogAt < 5 * 60 * 1000) return; // กันสแปม ส่งซ้ำห่างกันอย่างน้อย 5 นาที (ยกเว้นรายงานที่คนขับกดส่งเอง)
        lastIssueLogAt = now;
        try {
            String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
            DatabaseReference logRef = FirebaseDatabase.getInstance()
                    .getReference("driverLogs/" + vehicleId).push();
            Map<String, Object> data = new HashMap<>();
            data.put("message", message.replace("⚠ ", "").replace("\n", " | "));
            data.put("timestamp", now);
            data.put("device", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")");
            data.put("appVersion", BuildConfig.VERSION_NAME);
            data.put("gpsAgoSec", gpsAgoSec);
            data.put("fbAgoSec", fbAgoSec);
            data.put("restartCount", prefs.getInt(KEY_RESTART_COUNT, 0));

            // แบตเตอรี่ % — อ่านจาก sticky broadcast (ปลอดภัยบน Android 14+)
            try {
                Intent batteryStatus = getApplicationContext()
                        .registerReceiver(null,
                                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (batteryStatus != null) {
                    int level = batteryStatus.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                    int scale = batteryStatus.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                    if (level >= 0 && scale > 0) data.put("batteryPct", Math.round(level * 100f / scale));
                }
            } catch (Exception ignored2) {}

            // สถานะ battery optimization
            if (Build.VERSION.SDK_INT >= 23) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                boolean ignored3 = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
                data.put("batteryUnrestricted", ignored3);
            }

            // ประเภทเน็ตขณะนั้น
            try {
                android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                android.net.NetworkCapabilities caps = cm != null ? cm.getNetworkCapabilities(cm.getActiveNetwork()) : null;
                String net = "ไม่มีเน็ต";
                if (caps != null) {
                    if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) net = "WiFi";
                    else if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) net = "Mobile Data";
                }
                data.put("network", net);
            } catch (Exception ignored4) {}

            logRef.setValue(data);
        } catch (Exception ignored) {}
    }

    // ===== อัพเดทป้าย "ออนไลน์/ออฟไลน์" ใต้โลโก้ ให้ตรงกับสถานะส่งตำแหน่งจริง =====
    private void updateOnlinePill(boolean isOnline) {
        if (onlinePill == null) return;
        int dotColor   = isOnline ? Color.rgb(34, 197, 94)  : Color.rgb(148, 163, 184);
        int textColor  = isOnline ? Color.rgb(187, 247, 208) : Color.rgb(203, 213, 225);
        int bgColor    = isOnline ? Color.argb(40, 34, 197, 94) : Color.argb(40, 100, 116, 139);
        onlineDot.setTextColor(dotColor);
        onlineLabel.setTextColor(textColor);
        onlineLabel.setText(isOnline ? " ออนไลน์" : " ออฟไลน์");
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setColor(bgColor);
        pillBg.setCornerRadius(dp(20));
        onlinePill.setBackground(pillBg);
    }

    private void refreshUi() {
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        vehiclePickerText.setText(vehicleId + "\n▾");

        if (!hasLocationPermission()) {
            animateStatusChange("⚠ ไม่มีสิทธิ์ตำแหน่ง", Color.rgb(248, 113, 113));
            mainButton.setText("ขอสิทธิ์ตำแหน่ง");
            setButtonStyle(false);
            updateOnlinePill(false);
            setStartWorkVisual(false, "ขอสิทธิ์");
            if (readinessBadge != null) {
                readinessBadge.setText("ออฟไลน์");
                GradientDrawable bg = new GradientDrawable();
                bg.setColor(COLOR_RED);
                bg.setCornerRadius(dp(14));
                readinessBadge.setBackground(bg);
                readinessBadge.setTextColor(Color.WHITE);
                readinessReasonText.setText("ยังไม่ได้อนุญาตสิทธิ์ตำแหน่ง (GPS)");
                readinessReasonText.setVisibility(android.view.View.VISIBLE);
            }
            return;
        }

        if (enabled) {
            String coords = prefs.getString(KEY_LAST_COORDS, "--");
            String status = prefs.getString(KEY_LAST_STATUS, "locating");
            String error = prefs.getString(KEY_LAST_ERROR, "");
            long sent = prefs.getLong(KEY_LAST_SENT, 0);
            String time = sent > 0
                    ? new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(sent))
                    : "--:--:--";

            if (status.equals("sent") || status.equals("moving")) {
                animateStatusChange("● กำลังส่ง GPS", Color.rgb(34, 197, 94));
            } else if (status.equals("locating") || status.contains("locating")) {
                animateStatusChange("● กำลังหาสัญญาณ", Color.rgb(234, 179, 8));
            } else {
                animateStatusChange("● " + status, Color.rgb(148, 163, 184));
            }

            if (!coords.equals("--")) animateCoordsChange(coords);
            animateSentTime(time);

            if (!error.isEmpty()) {
                errorText.setText("⚠ " + error);
                errorText.setVisibility(android.view.View.VISIBLE);
            } else {
                errorText.setVisibility(android.view.View.GONE);
            }

            mainButton.setText("หยุดส่งตำแหน่ง");
            setButtonStyle(true);
            updateOnlinePill(true);
            setStartWorkVisual(true, "หยุดงาน");
            refreshDiagnostics();
        } else {
            animateStatusChange("○ ไม่ได้ส่ง", Color.rgb(100, 116, 139));
            animateCoordsChange("---.-----,  ---.-----");
            animateSentTime("--:--:--");
            errorText.setVisibility(android.view.View.GONE);
            mainButton.setText("เริ่มส่งตำแหน่ง");
            setButtonStyle(false);
            updateOnlinePill(false);
            setStartWorkVisual(false, "เริ่มงาน");
            if (readinessBadge != null) {
                readinessBadge.setText("ออฟไลน์");
                GradientDrawable bg = new GradientDrawable();
                bg.setColor(COLOR_TEXT_MUTED);
                bg.setCornerRadius(dp(14));
                readinessBadge.setBackground(bg);
                readinessBadge.setTextColor(Color.WHITE);
                readinessReasonText.setText("ยังไม่ได้เริ่มงาน");
                readinessReasonText.setVisibility(android.view.View.VISIBLE);
            }
        }
    }

    // ===== ข้อ 5: อัพเดทไอคอน/ป้าย/สีของปุ่มเริ่มงาน-หยุดงาน =====
    private void setStartWorkVisual(boolean isWorking, String label) {
        if (startWorkIcon == null) return;
        startWorkIcon.setText(isWorking ? "■" : "▶");
        int barColor = isWorking ? COLOR_RED : COLOR_GREEN;
        startWorkIconBg.setColor(Color.argb(80, 255, 255, 255));
        startWorkIcon.setBackground(startWorkIconBg);
        GradientDrawable barBg = new GradientDrawable();
        barBg.setColor(barColor);
        barBg.setCornerRadius(dp(16));
        startWorkButton.setBackground(barBg);
        startWorkLabel.setText(label);
        startWorkLabel.setTextColor(Color.WHITE);
    }

    private void setButtonStyle(boolean isStop) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        bg.setColor(isStop ? Color.rgb(220, 38, 38) : COLOR_ORANGE);
        mainButton.setBackground(bg);
    }
}

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
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.ArrayList;
import java.util.HashMap;
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
    static final String KEY_FIREBASE_STATUS   = "firebase_status";

    private static final String DB_URL = "https://bus-booking-1d68c-default-rtdb.firebaseio.com";
    private static final String ST_TRANSIT_PHONE = "0XXXXXXXXX"; // TODO: ใส่เบอร์สำนักงาน ST Transit จริง

    // ===== S.L.Transit Theme =====
    private static final int COLOR_NAVY       = Color.parseColor("#0B1D3A");
    private static final int COLOR_OCEAN      = Color.parseColor("#123A63");
    private static final int COLOR_TEAL       = Color.parseColor("#00A7B5");
    private static final int COLOR_LIGHT_TEAL = Color.parseColor("#4DD3D9");
    private static final int COLOR_ORANGE     = Color.parseColor("#FF8A00");
    static final String KEY_DIAG_VISIBLE = "diag_visible";

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

    private String lastCoords = "";
    private String lastStatus = "";

    // Firebase สำหรับตรวจสอบสถานะรถ
    private DatabaseReference liveVehiclesRef;
    private final Map<String, Boolean> vehicleOnlineMap = new HashMap<>();

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final Runnable uiTick = new Runnable() {
        @Override public void run() {
            refreshUi();
            uiHandler.postDelayed(this, 1000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getString(KEY_VEHICLE_ID, null) == null) {
            // ติดตั้งใหม่ — เช็ค Firebase ว่า car ไหนว่างอยู่ แล้ว auto-select
            prefs.edit().putString(KEY_VEHICLE_ID, VEHICLE_IDS[0]).apply(); // default ชั่วคราว
            autoSelectAvailableVehicle();
        }
        initFirebaseListener();
        buildUi();
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
                                vehiclePickerText.setText(id + "  ▾");
                            if (versionLabel != null)
                                versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + id + ")");
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

    // ===== ดึงยอดผู้โดยสารวันนี้: จอง / เช็คอินแล้ว / ยังไม่มาเช็คอิน =====
    private void refreshPassengerSummary() {
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        FirebaseDatabase.getInstance().getReference("bookings")
                .orderByChild("date").equalTo(today)
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                int booked = 0;
                int checkedIn = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String status = String.valueOf(child.child("status").getValue());
                    if ("cancelled".equals(status)) continue;
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

    // ===== สร้างปุ่มไอคอน 1 ช่อง (สแกน QR / ผู้โดยสาร / SOS) =====
    // ===== ปุ่มไอคอนสไตล์การ์ดขาว + วงกลมสี (ตามดีไซน์ต้นแบบ) =====
    private LinearLayout buildActionButton(String icon, String label, int accentColor, android.view.View.OnClickListener onClick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(10), dp(16), dp(10), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(16));
        box.setBackground(bg);
        box.setElevation(dp(1));
        box.setClickable(true);
        box.setOnClickListener(v -> { animateTap(box); onClick.onClick(v); });

        TextView iconView = new TextView(this);
        iconView.setText(icon);
        iconView.setTextSize(20);
        iconView.setGravity(Gravity.CENTER);
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(accentColor);
        iconView.setBackground(iconBg);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(44), dp(44));
        box.addView(iconView, iconLp);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_NAVY);
        labelView.setTextSize(12);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setGravity(Gravity.CENTER);
        labelView.setPadding(0, dp(8), 0, 0);
        box.addView(labelView);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(5), dp(5), dp(5), dp(5));
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
        final String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);

        FirebaseDatabase.getInstance().getReference("bookings/" + finalCode)
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                if (!snap.exists()) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ไม่พบตั๋ว")
                            .setMessage("ไม่พบรหัสตั๋ว: " + finalCode)
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
                                    .getReference("bookings/" + finalCode + "/originCheckin")
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
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        FirebaseDatabase.getInstance().getReference("bookings")
                .orderByChild("date").equalTo(today)
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                StringBuilder sb = new StringBuilder();
                int count = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String status = String.valueOf(child.child("status").getValue());
                    if ("cancelled".equals(status)) continue;
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
                        .setTitle("👥 ผู้โดยสารวันนี้ (" + count + " รายการ)")
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

    // ===== 3.3) รายงานปัญหา app — พิกัดปัจจุบัน + ข้อมูลการวินิจฉัยทั้งหมด (ย้ายมาจากหน้าหลักเดิม) =====
    private void showDiagnosticReport() {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        String coords = prefs.getString(KEY_LAST_COORDS, "---.-----,  ---.-----");
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);

        StringBuilder sb = new StringBuilder();
        sb.append("รถ: ").append(vehicleId).append("\n");
        sb.append("สถานะส่งตำแหน่ง: ").append(enabled ? "กำลังส่ง" : "ปิดอยู่").append("\n");
        sb.append("พิกัดปัจจุบัน: ").append(coords).append("\n\n");
        sb.append("--- ข้อมูลการวินิจฉัย ---\n");
        if (diagPanel != null && diagPanel.getText() != null && diagPanel.getText().length() > 0) {
            sb.append(diagPanel.getText());
        } else {
            sb.append("ยังไม่มีข้อมูลการวินิจฉัย (ต้องเปิดส่งตำแหน่งก่อน)");
        }

        new AlertDialog.Builder(this)
                .setTitle("🐞 รายงานปัญหา App")
                .setMessage(sb.toString())
                .setPositiveButton("ส่งรายงานเข้าระบบ", (d, w) -> {
                    logIssueToFirebase("ผู้ใช้กดส่งรายงานปัญหาด้วยตนเอง", -1, -1, true);
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ส่งแล้ว")
                            .setMessage("รายงานปัญหาของ " + vehicleId + " ถูกส่งเข้าระบบแล้ว")
                            .setPositiveButton("ตกลง", null).show();
                })
                .setNegativeButton("ปิด", null).show();
    }

    // ===== 3.4 / 3.5) แจ้งปัญหา — เบอร์ฉุกเฉินสำคัญ + ส่งสัญญาณ SOS เข้าระบบ =====
    private void showSosDialog() {
        String[] options = {
                "🆘 ส่งสัญญาณ SOS เข้าระบบ (แจ้งแอดมิน)",
                "🚓 โทร 191 — ตำรวจ / เหตุฉุกเฉินทั่วไป",
                "🚑 โทร 1669 — กู้ภัย / รถพยาบาล",
                "📞 โทร ST Transit — ติดต่อสำนักงาน"
        };
        new AlertDialog.Builder(this)
                .setTitle("🆘 แจ้งปัญหา / เหตุฉุกเฉิน")
                .setItems(options, (d, which) -> {
                    switch (which) {
                        case 0: sendSosSignal(); break;
                        case 1: callNumber("191"); break;
                        case 2: callNumber("1669"); break;
                        case 3: callNumber(ST_TRANSIT_PHONE); break;
                    }
                })
                .setNegativeButton("ยกเลิก", null).show();
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

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(COLOR_NAVY);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.CENTER_VERTICAL);
        root.setPadding(dp(20), dp(40), dp(20), dp(40));
        root.setBackgroundColor(COLOR_NAVY);
        // ให้ root สูงเต็มหน้าจอเพื่อให้ content อยู่กึ่งกลางได้
        root.setMinimumHeight(getResources().getDisplayMetrics().heightPixels);
        scroll.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.MATCH_PARENT));

        // ===== หัวข้อ S.L.TRANSIT (สไตล์โลโก้: ตัวอักษรเว้นจุดสี) + กระดิ่งแจ้งเตือนอัพเดท =====
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        android.view.View spacerLeft = new android.view.View(this);
        LinearLayout.LayoutParams spacerLp = new LinearLayout.LayoutParams(dp(28), dp(1));
        headerRow.addView(spacerLeft, spacerLp);

        TextView title = new TextView(this);
        title.setText(buildWordmark());
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setLetterSpacing(0.02f);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        headerRow.addView(title, titleLp);

        // ไอคอนกระดิ่งแจ้งเตือน พร้อมตัวเลขค้างไว้แบบ Facebook (ไม่หายเอง จนกว่าจะกดดู)
        android.widget.FrameLayout bellFrame = new android.widget.FrameLayout(this);

        notifBell = new TextView(this);
        notifBell.setText("🔔");
        notifBell.setTextSize(20);
        notifBell.setGravity(Gravity.CENTER);
        notifBell.setOnClickListener(v -> {
            animateTap(notifBell);
            showNotificationCenter();
        });
        android.widget.FrameLayout.LayoutParams bellLp = new android.widget.FrameLayout.LayoutParams(dp(32), dp(32));
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
        android.widget.FrameLayout.LayoutParams bubbleLp = new android.widget.FrameLayout.LayoutParams(dp(16), dp(16));
        bubbleLp.gravity = Gravity.TOP | Gravity.END;
        bubbleLp.setMargins(0, -dp(2), -dp(2), 0);
        bellFrame.addView(notifCountBubble, bubbleLp);

        LinearLayout.LayoutParams bellFrameLp = new LinearLayout.LayoutParams(dp(32), dp(32));
        headerRow.addView(bellFrame, bellFrameLp);

        LinearLayout.LayoutParams headerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        headerLp.setMargins(0, 0, 0, dp(10));
        root.addView(headerRow, headerLp);

        // ===== ป้ายสถานะออนไลน์ใต้โลโก้ (ตามดีไซน์ต้นแบบ) — อัพเดทตามสถานะส่งตำแหน่งจริงใน refreshUi() =====
        onlinePill = new LinearLayout(this);
        onlinePill.setOrientation(LinearLayout.HORIZONTAL);
        onlinePill.setGravity(Gravity.CENTER_VERTICAL);
        onlinePill.setPadding(dp(10), dp(4), dp(10), dp(4));

        onlineDot = new TextView(this);
        onlineDot.setText("●");
        onlineDot.setTextSize(10);
        onlinePill.addView(onlineDot);

        onlineLabel = new TextView(this);
        onlineLabel.setTextSize(11);
        onlineLabel.setTypeface(Typeface.DEFAULT_BOLD);
        onlinePill.addView(onlineLabel);

        LinearLayout.LayoutParams onlinePillLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        onlinePillLp.gravity = Gravity.CENTER_HORIZONTAL;
        onlinePillLp.setMargins(0, 0, 0, dp(14));
        root.addView(onlinePill, onlinePillLp);

        versionLabel = new TextView(this);
        versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]) + ")");
        versionLabel.setTextColor(Color.rgb(110, 140, 170));
        versionLabel.setTextSize(11);
        versionLabel.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams versionLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        versionLp.setMargins(0, 0, 0, dp(20));
        root.addView(versionLabel, versionLp);

        // ===== แบนเนอร์ "เดินทางปลอดภัยทุกเส้นทาง" =====
        LinearLayout banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setGravity(Gravity.CENTER);
        banner.setPadding(dp(20), dp(22), dp(20), dp(22));
        GradientDrawable bannerBg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{COLOR_OCEAN, COLOR_TEAL});
        bannerBg.setCornerRadius(dp(16));
        banner.setBackground(bannerBg);

        TextView bannerText = new TextView(this);
        bannerText.setText("เดินทางปลอดภัยทุกเส้นทาง");
        bannerText.setTextColor(Color.WHITE);
        bannerText.setTextSize(16);
        bannerText.setTypeface(Typeface.DEFAULT_BOLD);
        bannerText.setGravity(Gravity.CENTER);
        banner.addView(bannerText);

        LinearLayout.LayoutParams bannerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bannerLp.setMargins(0, 0, 0, dp(28));
        root.addView(banner, bannerLp);

        TextView vehicleLabel = new TextView(this);
        vehicleLabel.setText("รหัสรถ");
        vehicleLabel.setTextColor(Color.rgb(100, 116, 139));
        vehicleLabel.setTextSize(11);
        vehicleLabel.setLetterSpacing(0.1f);
        vehicleLabel.setGravity(Gravity.CENTER);
        root.addView(vehicleLabel);

        vehiclePickerText = new TextView(this);
        vehiclePickerText.setTextColor(Color.WHITE);
        vehiclePickerText.setTextSize(22);
        vehiclePickerText.setTypeface(Typeface.DEFAULT_BOLD);
        vehiclePickerText.setGravity(Gravity.CENTER);
        vehiclePickerText.setPadding(dp(20), dp(14), dp(20), dp(14));
        vehiclePickerText.setText(prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]) + "  ▾");

        GradientDrawable pickerBg = new GradientDrawable();
        pickerBg.setColor(COLOR_OCEAN);
        pickerBg.setCornerRadius(dp(14));
        pickerBg.setStroke(dp(1), COLOR_TEAL);
        vehiclePickerText.setBackground(pickerBg);
        vehiclePickerText.setOnClickListener(v -> {
            animateTap(vehiclePickerText);
            showVehicleDialog();
        });

        LinearLayout.LayoutParams pickerLp = new LinearLayout.LayoutParams(dp(160), LinearLayout.LayoutParams.WRAP_CONTENT);
        pickerLp.gravity = Gravity.CENTER_HORIZONTAL;
        pickerLp.setMargins(0, dp(6), 0, dp(28));
        root.addView(vehiclePickerText, pickerLp);

        // ===== สรุปผู้โดยสารวันนี้: จอง / เช็คอินแล้ว / ยังไม่มาเช็คอิน =====
        TextView summaryTitle = new TextView(this);
        summaryTitle.setText("สรุปผู้โดยสาร");
        summaryTitle.setTextColor(Color.rgb(148, 188, 210));
        summaryTitle.setTextSize(12);
        summaryTitle.setTypeface(Typeface.DEFAULT_BOLD);
        summaryTitle.setLetterSpacing(0.04f);
        LinearLayout.LayoutParams summaryTitleLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        summaryTitleLp.setMargins(dp(4), 0, 0, dp(8));
        root.addView(summaryTitle, summaryTitleLp);

        LinearLayout summaryCard = new LinearLayout(this);
        summaryCard.setOrientation(LinearLayout.HORIZONTAL);
        summaryCard.setGravity(Gravity.CENTER);
        summaryCard.setPadding(dp(12), dp(18), dp(12), dp(18));
        GradientDrawable summaryBg = new GradientDrawable();
        summaryBg.setColor(Color.WHITE);
        summaryBg.setCornerRadius(dp(18));
        summaryCard.setBackground(summaryBg);
        summaryCard.setElevation(dp(2));

        summaryBookedCount = new TextView(this);
        summaryCheckedCount = new TextView(this);
        summaryPendingCount = new TextView(this);

        summaryCard.addView(buildSummaryColumn("👥", summaryBookedCount, "ผู้โดยสาร", COLOR_OCEAN));
        summaryCard.addView(buildSummaryDivider());
        summaryCard.addView(buildSummaryColumn("🎫", summaryCheckedCount, "เช็คตั๋วแล้ว", COLOR_TEAL));
        summaryCard.addView(buildSummaryDivider());
        summaryCard.addView(buildSummaryColumn("⏳", summaryPendingCount, "ยังไม่มาเช็คอิน", COLOR_ORANGE));

        LinearLayout.LayoutParams summaryLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        summaryLp.setMargins(0, 0, 0, dp(20));
        root.addView(summaryCard, summaryLp);
        refreshPassengerSummary();

        // GPS Card
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(COLOR_OCEAN);
        cardBg.setCornerRadius(dp(20));
        cardBg.setStroke(dp(1), COLOR_TEAL);
        card.setBackground(cardBg);

        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, 0, 0, dp(20));

        LinearLayout badgeRow = new LinearLayout(this);
        badgeRow.setOrientation(LinearLayout.HORIZONTAL);
        badgeRow.setGravity(Gravity.CENTER_VERTICAL);

        statusBadge = new TextView(this);
        statusBadge.setText("● รอสัญญาณ");
        statusBadge.setTextColor(Color.rgb(234, 179, 8));
        statusBadge.setTextSize(13);
        statusBadge.setTypeface(Typeface.DEFAULT_BOLD);
        badgeRow.addView(statusBadge);
        card.addView(badgeRow);

        android.view.View divider = new android.view.View(this);
        divider.setBackgroundColor(Color.rgb(31, 41, 55));
        LinearLayout.LayoutParams divLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        divLp.setMargins(0, dp(12), 0, dp(12));
        card.addView(divider, divLp);

        TextView coordsLabel = new TextView(this);
        coordsLabel.setText("พิกัดปัจจุบัน");
        coordsLabel.setTextColor(Color.rgb(100, 116, 139));
        coordsLabel.setTextSize(11);
        coordsLabel.setLetterSpacing(0.08f);
        card.addView(coordsLabel);

        coordsText = new TextView(this);
        coordsText.setText("---.-----,  ---.-----");
        coordsText.setTextColor(Color.WHITE);
        coordsText.setTextSize(20);
        coordsText.setTypeface(Typeface.MONOSPACE);
        coordsText.setPadding(0, dp(4), 0, dp(14));
        card.addView(coordsText);

        TextView sentLabel = new TextView(this);
        sentLabel.setText("ส่งล่าสุด");
        sentLabel.setTextColor(Color.rgb(100, 116, 139));
        sentLabel.setTextSize(11);
        sentLabel.setLetterSpacing(0.08f);
        card.addView(sentLabel);

        sentTimeText = new TextView(this);
        sentTimeText.setText("--:--:--");
        sentTimeText.setTextColor(Color.rgb(148, 163, 184));
        sentTimeText.setTextSize(16);
        sentTimeText.setTypeface(Typeface.MONOSPACE);
        sentTimeText.setPadding(0, dp(4), 0, 0);
        card.addView(sentTimeText);

        root.addView(card, cardLp);

        errorText = new TextView(this);
        errorText.setTextColor(Color.rgb(248, 113, 113));
        errorText.setTextSize(13);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(0, 0, 0, dp(16));
        errorText.setVisibility(android.view.View.GONE);
        root.addView(errorText);

        // ===== ข้อมูลการวินิจฉัยย้ายไปอยู่ในไอคอน "🐞 รายงานปัญหา App" แล้ว =====
        // diagPanel เก็บข้อความไว้ใช้งานภายใน (ไม่แสดงบนหน้าหลักอีกต่อไป)
        diagPanel = new TextView(this);
        diagPanel.setVisibility(android.view.View.GONE);

        mainButton = new Button(this);
        mainButton.setAllCaps(false);
        mainButton.setTextSize(18);
        mainButton.setTextColor(Color.WHITE);
        mainButton.setTypeface(Typeface.DEFAULT_BOLD);
        mainButton.setPadding(dp(16), dp(18), dp(16), dp(18));
        mainButton.setOnClickListener(v -> {
            animateTap(mainButton);
            uiHandler.postDelayed(() -> toggleService(), 120);
        });

        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        root.addView(mainButton, btnLp);

        // ===== แถบไอคอน 2x2: สแกน QR+เช็คอิน / ข้อมูลผู้โดยสาร / รายงานปัญหา app / แจ้งปัญหา-ฉุกเฉิน =====
        LinearLayout actionsRowTop = new LinearLayout(this);
        actionsRowTop.setOrientation(LinearLayout.HORIZONTAL);
        actionsRowTop.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);

        actionsRowTop.addView(buildActionButton("📷", "สแกน QR\nเช็คอิน", COLOR_TEAL, v -> openQrScanner()));
        actionsRowTop.addView(buildActionButton("👥", "ข้อมูล\nผู้โดยสาร", COLOR_OCEAN, v -> showPassengerList()));
        root.addView(actionsRowTop, actionsRowLp);

        LinearLayout actionsRowBottom = new LinearLayout(this);
        actionsRowBottom.setOrientation(LinearLayout.HORIZONTAL);
        actionsRowBottom.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsRowBottomLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsRowBottomLp.setMargins(0, dp(10), 0, 0);

        actionsRowBottom.addView(buildActionButton("🐞", "รายงาน\nปัญหา App", COLOR_LIGHT_TEAL, v -> showDiagnosticReport()));
        actionsRowBottom.addView(buildActionButton("🆘", "แจ้งปัญหา\nฉุกเฉิน", Color.rgb(220, 38, 38), v -> showSosDialog()));
        root.addView(actionsRowBottom, actionsRowBottomLp);

        setContentView(scroll);
        refreshUi();
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
        String myCurrentId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        boolean iAmOnline = prefs.getBoolean(KEY_ENABLED, false);

        // สร้าง label แต่ละตัวเลือก
        String[] labels = new String[VEHICLE_IDS.length];
        for (int i = 0; i < VEHICLE_IDS.length; i++) {
            String id = VEHICLE_IDS[i];
            boolean onlineByOther = Boolean.TRUE.equals(vehicleOnlineMap.get(id))
                    && !(id.equals(myCurrentId) && iAmOnline);
            labels[i] = onlineByOther ? id + "  🔴 ใช้งานอยู่" : id;
        }

        int currentIdx = 0;
        for (int i = 0; i < VEHICLE_IDS.length; i++) {
            if (VEHICLE_IDS[i].equals(myCurrentId)) { currentIdx = i; break; }
        }

        new AlertDialog.Builder(this)
                .setTitle("เลือกรหัสรถ")
                .setSingleChoiceItems(labels, currentIdx, (dialog, which) -> {
                    String selectedId = VEHICLE_IDS[which];

                    // ตรวจสอบว่าคันนี้ถูกใช้อยู่โดยคนอื่นหรือไม่
                    boolean onlineByOther = Boolean.TRUE.equals(vehicleOnlineMap.get(selectedId))
                            && !(selectedId.equals(myCurrentId) && iAmOnline);

                    if (onlineByOther) {
                        // แจ้งเตือนและปิด dialog
                        dialog.dismiss();
                        new AlertDialog.Builder(this)
                                .setTitle("ไม่สามารถเลือกได้")
                                .setMessage(selectedId + " กำลังถูกใช้งานอยู่โดยคนขับคนอื่น\nกรุณาเลือกรหัสรถอื่น")
                                .setPositiveButton("ตกลง", null)
                                .show();
                        return;
                    }

                    prefs.edit().putString(KEY_VEHICLE_ID, selectedId).apply();
                    vehiclePickerText.setText(selectedId + "  ▾");
                    dialog.dismiss();
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

    private void toggleService() {
        if (prefs.getBoolean(KEY_ENABLED, false)) stopGpsService();
        else requestPermissionsThenStart();
    }

    private void startGpsService() {
        prefs.edit().putBoolean(KEY_ENABLED, true).apply();
        // Force reconnect Firebase WebSocket ก่อน start service
        // ป้องกัน connection เก่าค้างจาก session ก่อนหน้า
        try { FirebaseDatabase.getInstance().goOffline(); } catch (Exception ignored) {}
        uiHandler.postDelayed(() -> {
            try { FirebaseDatabase.getInstance().goOnline(); } catch (Exception ignored) {}
            Intent intent = new Intent(this, GpsService.class);
            intent.setAction(GpsService.ACTION_START);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
            requestBatteryUnrestrictedIfNeeded();
            refreshUi();
        }, 600);
    }

    private void stopGpsService() {
        Intent intent = new Intent(this, GpsService.class);
        intent.setAction(GpsService.ACTION_STOP);
        startService(intent);
        prefs.edit().putBoolean(KEY_ENABLED, false).apply();
        refreshUi();
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
        vehiclePickerText.setText(vehicleId + "  ▾");

        if (!hasLocationPermission()) {
            animateStatusChange("⚠ ไม่มีสิทธิ์ตำแหน่ง", Color.rgb(248, 113, 113));
            mainButton.setText("ขอสิทธิ์ตำแหน่ง");
            setButtonStyle(false);
            updateOnlinePill(false);
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
            refreshDiagnostics();
        } else {
            animateStatusChange("○ ไม่ได้ส่ง", Color.rgb(100, 116, 139));
            animateCoordsChange("---.-----,  ---.-----");
            animateSentTime("--:--:--");
            errorText.setVisibility(android.view.View.GONE);
            mainButton.setText("เริ่มส่งตำแหน่ง");
            setButtonStyle(false);
            updateOnlinePill(false);
        }
    }

    private void setButtonStyle(boolean isStop) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        bg.setColor(isStop ? Color.rgb(220, 38, 38) : COLOR_ORANGE);
        mainButton.setBackground(bg);
    }
}

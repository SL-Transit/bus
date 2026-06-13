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
    private TextView diagToggle;
    private TextView updateBadge;
    private boolean diagVisible;

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
            prefs.edit().putString(KEY_VEHICLE_ID, VEHICLE_IDS[0]).apply();
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

    // ===== รายงานเวอร์ชันแอพปัจจุบันไปที่ Firebase ให้ admin ดูได้ว่ารถไหนยังไม่อัพเดท =====
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
                        if (updateBadge != null) updateBadge.setVisibility(android.view.View.VISIBLE);
                        showUpdateDialog(apkUrl, note);
                    }
                }
                @Override public void onCancelled(DatabaseError error) {}
            });
        } catch (Exception ignored) {}
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

    // ===== สร้างปุ่มไอคอน 1 ช่อง (สแกน QR / ผู้โดยสาร / SOS) =====
    private LinearLayout buildActionButton(String icon, String label, int accentColor, android.view.View.OnClickListener onClick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(8), dp(14), dp(8), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(COLOR_OCEAN);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), accentColor);
        box.setBackground(bg);
        box.setClickable(true);
        box.setOnClickListener(v -> { animateTap(box); onClick.onClick(v); });

        TextView iconView = new TextView(this);
        iconView.setText(icon);
        iconView.setTextSize(24);
        iconView.setGravity(Gravity.CENTER);
        box.addView(iconView);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.WHITE);
        labelView.setTextSize(12);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setGravity(Gravity.CENTER);
        labelView.setPadding(0, dp(4), 0, 0);
        box.addView(labelView);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(4), 0, dp(4), 0);
        box.setLayoutParams(lp);
        return box;
    }

    // ===== 1) สแกน QR เช็คอินผู้โดยสาร =====
    private void openQrScanner() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 30);
            return;
        }
        IntentIntegrator integrator = new IntentIntegrator(this);
        integrator.setOrientationLocked(false);
        integrator.setBeepEnabled(true);
        integrator.setPrompt("สแกน QR ตั๋วผู้โดยสาร");
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
                String name  = String.valueOf(snap.child("name").getValue());
                String phone = String.valueOf(snap.child("phone").getValue());
                String seats = String.valueOf(snap.child("seats").getValue());
                String route = String.valueOf(snap.child("route").getValue());

                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("✅ ตั๋ว " + finalCode)
                        .setMessage("ชื่อ: " + name + "\nเบอร์: " + phone + "\nที่นั่ง: " + seats + "\nเส้นทาง: " + route)
                        .setPositiveButton("เช็คอินขึ้นรถ", (d, w) -> {
                            Map<String, Object> data = new HashMap<>();
                            data.put("status", "boarded");
                            data.put("vehicleId", vehicleId);
                            data.put("checkedBy", "driver_qr");
                            data.put("ts", System.currentTimeMillis());
                            FirebaseDatabase.getInstance()
                                    .getReference("bookings/" + finalCode + "/originCheckin")
                                    .updateChildren(data);
                        })
                        .setNegativeButton("ปิด", null).show();
            }
            @Override public void onCancelled(DatabaseError error) {}
        });
    }

    // ===== 2) รายชื่อผู้โดยสารที่จองวันนี้ =====
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
                    sb.append("• ").append(time).append("  ").append(name)
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

    // ===== 3) SOS — ไม่โทรหาบริษัท แต่ส่งสัญญาณเข้าระบบ / โทรฉุกเฉิน 191 =====
    private void showSosDialog() {
        new AlertDialog.Builder(this)
                .setTitle("🆘 ฉุกเฉิน")
                .setMessage("เลือกการดำเนินการ")
                .setPositiveButton("ส่งสัญญาณ SOS เข้าระบบ", (d, w) -> sendSosSignal())
                .setNeutralButton("โทร 191 (ฉุกเฉิน)", (d, w) -> {
                    Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:191"));
                    startActivity(dial);
                })
                .setNegativeButton("ยกเลิก", null).show();
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

        // ===== หัวข้อ S.L.TRANSIT + ไอคอนแจ้งเตือนอัพเดท =====
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        android.view.View spacerLeft = new android.view.View(this);
        LinearLayout.LayoutParams spacerLp = new LinearLayout.LayoutParams(dp(28), dp(1));
        headerRow.addView(spacerLeft, spacerLp);

        TextView title = new TextView(this);
        title.setText("S.L.TRANSIT");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setLetterSpacing(0.05f);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        headerRow.addView(title, titleLp);

        // ไอคอนกระดิ่งแจ้งเตือนเมื่อมีอัพเดทแอพใหม่
        updateBadge = new TextView(this);
        updateBadge.setText("🔔");
        updateBadge.setTextSize(20);
        updateBadge.setTextColor(COLOR_ORANGE);
        updateBadge.setVisibility(android.view.View.GONE);
        updateBadge.setGravity(Gravity.CENTER);
        updateBadge.setOnClickListener(v -> checkForUpdate());
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(dp(28), dp(28));
        headerRow.addView(updateBadge, badgeLp);

        LinearLayout.LayoutParams headerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        headerLp.setMargins(0, 0, 0, dp(16));
        root.addView(headerRow, headerLp);

        TextView versionLabel = new TextView(this);
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

        // ===== ปุ่มเปิด/ปิดแผงตรวจสอบปัญหา (ซ่อนไว้เป็นค่าเริ่มต้น) =====
        diagToggle = new TextView(this);
        diagToggle.setText(diagVisible ? "▲ ซ่อนข้อมูลการวินิจฉัย" : "▼ แสดงข้อมูลการวินิจฉัย");
        diagToggle.setTextColor(COLOR_LIGHT_TEAL);
        diagToggle.setTextSize(12);
        diagToggle.setGravity(Gravity.CENTER);
        diagToggle.setPadding(0, dp(4), 0, dp(8));
        diagToggle.setOnClickListener(v -> {
            diagVisible = !diagVisible;
            prefs.edit().putBoolean(KEY_DIAG_VISIBLE, diagVisible).apply();
            diagToggle.setText(diagVisible ? "▲ ซ่อนข้อมูลการวินิจฉัย" : "▼ แสดงข้อมูลการวินิจฉัย");
            refreshDiagnostics();
        });
        root.addView(diagToggle);

        // ===== Diagnostic Panel =====
        diagPanel = new TextView(this);
        diagPanel.setTextColor(Color.rgb(148, 188, 210));
        diagPanel.setTextSize(11);
        diagPanel.setTypeface(Typeface.MONOSPACE);
        diagPanel.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable diagBg = new GradientDrawable();
        diagBg.setColor(COLOR_NAVY);
        diagBg.setCornerRadius(dp(10));
        diagBg.setStroke(dp(1), COLOR_OCEAN);
        diagPanel.setBackground(diagBg);
        diagPanel.setVisibility(android.view.View.GONE);
        LinearLayout.LayoutParams diagLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        diagLp.setMargins(0, 0, 0, dp(12));
        root.addView(diagPanel, diagLp);

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

        // ===== แถบไอคอน 3 ช่อง: สแกน QR / ผู้โดยสาร / SOS =====
        LinearLayout actionsRow = new LinearLayout(this);
        actionsRow.setOrientation(LinearLayout.HORIZONTAL);
        actionsRow.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsLp.setMargins(0, dp(16), 0, 0);

        actionsRow.addView(buildActionButton("📷", "สแกน QR", COLOR_TEAL, v -> openQrScanner()));
        actionsRow.addView(buildActionButton("👥", "ผู้โดยสาร", COLOR_OCEAN, v -> showPassengerList()));
        actionsRow.addView(buildActionButton("🆘", "SOS", Color.rgb(190, 30, 30), v -> showSosDialog()));

        root.addView(actionsRow, actionsLp);

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
        if (!enabled || !diagVisible) { diagPanel.setVisibility(android.view.View.GONE); return; }
        diagPanel.setVisibility(android.view.View.VISIBLE);

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

        // แจ้งเตือนถ้ามีปัญหา
        StringBuilder errSb = new StringBuilder();
        if (gpsAgoSec > 90) errSb.append("⚠ GPS หาย กรุณาตรวจสอบสัญญาณ\n");
        if (fbAgoSec > 90)  errSb.append("⚠ Firebase ขาดการเชื่อมต่อ ตรวจสอบอินเทอร์เน็ต\n");
        if (restartCount >= 3) errSb.append("⚠ แอปถูก kill บ่อย ตรวจสอบการตั้งค่า Battery\n");
        if (errSb.length() > 0) {
            errorText.setText(errSb.toString().trim());
            errorText.setVisibility(android.view.View.VISIBLE);
            logIssueToFirebase(errSb.toString().trim());
        }
    }

    // ===== "กล่องดำ" — ส่งบันทึกปัญหาขึ้น Firebase ให้ admin ตรวจสอบได้ =====
    private long lastIssueLogAt = 0;
    private void logIssueToFirebase(String message) {
        long now = System.currentTimeMillis();
        if (now - lastIssueLogAt < 5 * 60 * 1000) return; // กันสแปม ส่งซ้ำห่างกันอย่างน้อย 5 นาที
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
            logRef.setValue(data);
        } catch (Exception ignored) {}
    }

    private void refreshUi() {
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        vehiclePickerText.setText(vehicleId + "  ▾");

        if (!hasLocationPermission()) {
            animateStatusChange("⚠ ไม่มีสิทธิ์ตำแหน่ง", Color.rgb(248, 113, 113));
            mainButton.setText("ขอสิทธิ์ตำแหน่ง");
            setButtonStyle(false);
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
            refreshDiagnostics();
        } else {
            animateStatusChange("○ ไม่ได้ส่ง", Color.rgb(100, 116, 139));
            animateCoordsChange("---.-----,  ---.-----");
            animateSentTime("--:--:--");
            errorText.setVisibility(android.view.View.GONE);
            mainButton.setText("เริ่มส่งตำแหน่ง");
            setButtonStyle(false);
        }
    }

    private void setButtonStyle(boolean isStop) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        bg.setColor(isStop ? Color.rgb(220, 38, 38) : COLOR_ORANGE);
        mainButton.setBackground(bg);
    }
}

package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    static final String PREFS = "driver_gps";
    static final String KEY_ENABLED = "tracking_enabled";
    static final String KEY_LAST_STATUS = "last_status";
    static final String KEY_LAST_SENT = "last_sent";
    static final String KEY_LAST_COORDS = "last_coords";
    static final String KEY_LAST_ERROR = "last_error";
    static final String KEY_VEHICLE_ID = "vehicle_id";

    // --- กำหนดรายการรถที่นี่ ---
    private static final String[] VEHICLE_IDS = {
        "car1", "car2", "car3", "car4", "car5"
    };

    private SharedPreferences prefs;
    private TextView statusText;
    private TextView vehiclePickerText;
    private Button mainButton;
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
        // ตั้งค่า default vehicle ถ้ายังไม่มี
        if (prefs.getString(KEY_VEHICLE_ID, null) == null) {
            prefs.edit().putString(KEY_VEHICLE_ID, VEHICLE_IDS[0]).apply();
        }
        buildUi();
        requestPermissionsThenStart();
        uiHandler.post(uiTick);
    }

    @Override protected void onDestroy() {
        uiHandler.removeCallbacks(uiTick);
        super.onDestroy();
    }

    private void buildUi() {
        int padX = dp(24);
        int padY = dp(28);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(15, 23, 42));
        scroll.setClipToPadding(false);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.CENTER_VERTICAL);
        root.setPadding(padX, padY, padX, padY);
        root.setBackgroundColor(Color.rgb(15, 23, 42));
        root.setMinimumHeight(getResources().getDisplayMetrics().heightPixels - dp(96));
        scroll.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        ImageView cover = new ImageView(this);
        cover.setImageResource(getResources().getIdentifier("app_cover", "drawable", getPackageName()));
        cover.setAdjustViewBounds(true);
        cover.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        LinearLayout.LayoutParams coverLp = new LinearLayout.LayoutParams(dp(112), dp(112));
        coverLp.setMargins(0, 0, 0, dp(22));
        root.addView(cover, coverLp);

        TextView title = new TextView(this);
        title.setText("GPS Transit");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("GPS -> Firebase every 10 seconds");
        sub.setTextColor(Color.rgb(203, 213, 225));
        sub.setTextSize(16);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 14, 0, 24);
        root.addView(sub);

        // --- Label เลือกรถ ---
        TextView vehicleLabel = new TextView(this);
        vehicleLabel.setText("เลือกรหัสรถ:");
        vehicleLabel.setTextColor(Color.rgb(203, 213, 225));
        vehicleLabel.setTextSize(16);
        vehicleLabel.setGravity(Gravity.CENTER);
        root.addView(vehicleLabel);

        // --- ปุ่มเลือก Vehicle แบบ custom (กดแล้วขึ้น dialog) ---
        vehiclePickerText = new TextView(this);
        vehiclePickerText.setTextColor(Color.WHITE);
        vehiclePickerText.setTextSize(20);
        vehiclePickerText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        vehiclePickerText.setGravity(Gravity.CENTER);
        vehiclePickerText.setPadding(dp(16), dp(14), dp(16), dp(14));
        vehiclePickerText.setText("▼  " + prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]));

        GradientDrawable pickerBg = new GradientDrawable();
        pickerBg.setColor(Color.rgb(30, 41, 59));
        pickerBg.setCornerRadius(dp(10));
        pickerBg.setStroke(dp(2), Color.rgb(99, 102, 241));
        vehiclePickerText.setBackground(pickerBg);

        vehiclePickerText.setOnClickListener(v -> showVehicleDialog());

        LinearLayout.LayoutParams pickerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        pickerLp.setMargins(0, dp(8), 0, dp(16));
        root.addView(vehiclePickerText, pickerLp);

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(248, 250, 252));
        statusText.setTextSize(18);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(20, 24, 20, 24);
        root.addView(statusText, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        mainButton = new Button(this);
        mainButton.setAllCaps(false);
        mainButton.setTextSize(20);
        mainButton.setTextColor(Color.WHITE);
        mainButton.setPadding(12, 22, 12, 22);
        mainButton.setOnClickListener(v -> toggleService());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 30, 0, 0);
        root.addView(mainButton, lp);

        TextView note = new TextView(this);
        note.setText("หลังเริ่มส่งแล้ว ปิดหน้าแอพได้ แต่ห้าม Force stop แอพหรือปิด notification");
        note.setTextColor(Color.rgb(148, 163, 184));
        note.setTextSize(14);
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 28, 0, 0);
        root.addView(note);

        TextView version = new TextView(this);
        version.setText("v1.6");
        version.setTextColor(Color.rgb(71, 85, 105));
        version.setTextSize(12);
        version.setGravity(Gravity.CENTER);
        version.setPadding(0, 16, 0, 0);
        root.addView(version);

        setContentView(scroll);
        refreshUi();
    }

    private void showVehicleDialog() {
        // ถ้ากำลังส่งอยู่ ต้องหยุดก่อนจึงเปลี่ยนได้
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        String currentId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);
        int currentIdx = 0;
        for (int i = 0; i < VEHICLE_IDS.length; i++) {
            if (VEHICLE_IDS[i].equals(currentId)) { currentIdx = i; break; }
        }
        new AlertDialog.Builder(this)
                .setTitle("เลือกรหัสรถ")
                .setSingleChoiceItems(VEHICLE_IDS, currentIdx, (dialog, which) -> {
                    String selected = VEHICLE_IDS[which];
                    prefs.edit().putString(KEY_VEHICLE_ID, selected).apply();
                    vehiclePickerText.setText("▼  " + selected);
                    dialog.dismiss();
                    if (enabled) {
                        stopGpsService();
                        startGpsService();
                    }
                })
                .setNegativeButton("ยกเลิก", null)
                .show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requestPermissionsThenStart() {
        if (Build.VERSION.SDK_INT < 23) {
            startGpsService();
            return;
        }
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (permissions.isEmpty()) startGpsService();
        else requestPermissions(permissions.toArray(new String[0]), 10);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == 10 && hasLocationPermission()) startGpsService();
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
        Intent intent = new Intent(this, GpsService.class);
        intent.setAction(GpsService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
        else startService(intent);
        refreshUi();
    }

    private void stopGpsService() {
        Intent intent = new Intent(this, GpsService.class);
        intent.setAction(GpsService.ACTION_STOP);
        startService(intent);
        prefs.edit().putBoolean(KEY_ENABLED, false).apply();
        refreshUi();
    }

    private void refreshUi() {
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, VEHICLE_IDS[0]);

        vehiclePickerText.setText("▼  " + vehicleId);

        if (!hasLocationPermission()) {
            statusText.setText("กรุณาอนุญาตตำแหน่ง เพื่อเริ่มส่ง GPS");
            mainButton.setText("ขอสิทธิ์ตำแหน่ง");
            mainButton.setBackgroundColor(Color.rgb(249, 115, 22));
            return;
        }
        if (enabled) {
            long sent = prefs.getLong(KEY_LAST_SENT, 0);
            String coords = prefs.getString(KEY_LAST_COORDS, "--");
            String status = prefs.getString(KEY_LAST_STATUS, "กำลังรอ GPS...");
            String error = prefs.getString(KEY_LAST_ERROR, "");
            String time = sent > 0 ? new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(sent)) : "--:--:--";
            statusText.setText("Sending GPS to liveVehicles/" + vehicleId + " every 10 seconds\n" +
                    "สถานะ: " + status + "\n" +
                    "พิกัดล่าสุด: " + coords + "\n" +
                    "ส่งล่าสุด: " + time +
                    (error.isEmpty() ? "" : "\nข้อผิดพลาด: " + error));
        } else {
            statusText.setText("หยุดส่งตำแหน่งอยู่");
        }
        mainButton.setText(enabled ? "หยุดส่งตำแหน่ง" : "เริ่มส่งตำแหน่ง");
        mainButton.setBackgroundColor(enabled ? Color.rgb(220, 38, 38) : Color.rgb(22, 163, 74));
    }
}


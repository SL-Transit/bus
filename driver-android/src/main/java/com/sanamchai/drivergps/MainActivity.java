package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
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

    private SharedPreferences prefs;
    private TextView statusText;
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
        buildUi();
        requestPermissionsThenStart();
        uiHandler.post(uiTick);
    }

    @Override protected void onDestroy() {
        uiHandler.removeCallbacks(uiTick);
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(15, 23, 42));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(32, 48, 32, 48);
        root.setBackgroundColor(Color.rgb(15, 23, 42));
        root.setMinimumHeight(getResources().getDisplayMetrics().heightPixels);
        scroll.addView(root);

        ImageView cover = new ImageView(this);
        cover.setImageResource(getResources().getIdentifier("app_cover", "drawable", getPackageName()));
        cover.setAdjustViewBounds(true);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        LinearLayout.LayoutParams coverLp = new LinearLayout.LayoutParams(260, 260);
        coverLp.setMargins(0, 0, 0, 26);
        root.addView(cover, coverLp);

        TextView title = new TextView(this);
        title.setText("GPS Transit");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("ส่งตำแหน่งรถโดยสารเข้า passenger.html ทุก 20 วินาที");
        sub.setTextColor(Color.rgb(203, 213, 225));
        sub.setTextSize(16);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 14, 0, 34);
        root.addView(sub);

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

        setContentView(scroll);
        refreshUi();
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
            statusText.setText("กำลังส่ง GPS ไป bus/car1 ทุก 20 วินาที\n" +
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

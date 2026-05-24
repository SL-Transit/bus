package com.sanamchai.drivergps;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;

public class MainActivity extends Activity {
    static final String PREFS = "driver_gps";
    static final String KEY_CAR = "car_number";
    static final String KEY_DIRECTION = "direction";
    static final String KEY_STOP_HOUR = "stop_hour";
    static final String KEY_STOP_MINUTE = "stop_minute";
    static final String KEY_ENABLED = "tracking_enabled";

    private SharedPreferences prefs;
    private EditText carInput;
    private Button goBtn;
    private Button backBtn;
    private TimePicker stopTime;
    private Button mainBtn;
    private TextView statusText;
    private String direction = "go";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        direction = prefs.getString(KEY_DIRECTION, "go");
        buildUi();
        requestNeededPermissions();
        refreshStatus();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 32, 32, 40);
        root.setBackgroundColor(Color.rgb(15, 23, 42));
        scroll.addView(root);

        TextView title = text("ส่ง GPS รถโดยสาร", 28, true);
        root.addView(title);
        TextView subtitle = text("ตั้งค่าครั้งแรก แล้วกดเริ่ม ระบบจะส่งตำแหน่งแม้ปิดหน้าแอพ", 15, false);
        subtitle.setTextColor(Color.rgb(203, 213, 225));
        subtitle.setPadding(0, 8, 0, 28);
        root.addView(subtitle);

        root.addView(label("เลขรถ"));
        carInput = new EditText(this);
        carInput.setText(String.valueOf(prefs.getInt(KEY_CAR, 1)));
        carInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        carInput.setTextSize(22);
        carInput.setSingleLine(true);
        carInput.setHint("เช่น 1");
        carInput.setPadding(20, 10, 20, 10);
        root.addView(carInput, matchWrap());

        root.addView(label("ทิศทาง"));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        goBtn = choice("สนามชัย → แปดริ้ว");
        backBtn = choice("แปดริ้ว → สนามชัย");
        row.addView(goBtn, new LinearLayout.LayoutParams(0, 120, 1));
        row.addView(backBtn, new LinearLayout.LayoutParams(0, 120, 1));
        root.addView(row);
        goBtn.setOnClickListener(v -> setDirection("go"));
        backBtn.setOnClickListener(v -> setDirection("back"));
        paintDirection();

        root.addView(label("เวลาปิดระบบอัตโนมัติ"));
        stopTime = new TimePicker(this);
        stopTime.setIs24HourView(true);
        if (Build.VERSION.SDK_INT >= 23) {
            stopTime.setHour(prefs.getInt(KEY_STOP_HOUR, 18));
            stopTime.setMinute(prefs.getInt(KEY_STOP_MINUTE, 0));
        } else {
            stopTime.setCurrentHour(prefs.getInt(KEY_STOP_HOUR, 18));
            stopTime.setCurrentMinute(prefs.getInt(KEY_STOP_MINUTE, 0));
        }
        root.addView(stopTime);

        mainBtn = new Button(this);
        mainBtn.setTextSize(21);
        mainBtn.setAllCaps(false);
        mainBtn.setPadding(10, 24, 10, 24);
        mainBtn.setOnClickListener(v -> toggleTracking());
        root.addView(mainBtn, matchWrap());

        Button saveBtn = new Button(this);
        saveBtn.setText("บันทึกการตั้งค่า");
        saveBtn.setAllCaps(false);
        saveBtn.setTextSize(17);
        saveBtn.setOnClickListener(v -> {
            saveSettings();
            Toast.makeText(this, "บันทึกแล้ว", Toast.LENGTH_SHORT).show();
        });
        root.addView(saveBtn, matchWrap());

        statusText = text("", 15, false);
        statusText.setTextColor(Color.rgb(203, 213, 225));
        statusText.setPadding(0, 24, 0, 0);
        root.addView(statusText);

        setContentView(scroll);
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextColor(Color.WHITE);
        v.setTextSize(sp);
        if (bold) v.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return v;
    }

    private TextView label(String value) {
        TextView v = text(value, 14, true);
        v.setTextColor(Color.rgb(148, 163, 184));
        v.setPadding(0, 22, 0, 8);
        return v;
    }

    private Button choice(String value) {
        Button b = new Button(this);
        b.setText(value);
        b.setAllCaps(false);
        b.setTextSize(15);
        return b;
    }

    private LinearLayout.LayoutParams matchWrap() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 10, 0, 0);
        return lp;
    }

    private void setDirection(String next) {
        direction = next;
        paintDirection();
    }

    private void paintDirection() {
        goBtn.setBackgroundColor(direction.equals("go") ? Color.rgb(37, 99, 235) : Color.rgb(51, 65, 85));
        backBtn.setBackgroundColor(direction.equals("back") ? Color.rgb(249, 115, 22) : Color.rgb(51, 65, 85));
        goBtn.setTextColor(Color.WHITE);
        backBtn.setTextColor(Color.WHITE);
    }

    private void requestNeededPermissions() {
        if (Build.VERSION.SDK_INT < 23) return;
        java.util.ArrayList<String> asks = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            asks.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            asks.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!asks.isEmpty()) requestPermissions(asks.toArray(new String[0]), 9);
    }

    private void toggleTracking() {
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        saveSettings();
        Intent intent = new Intent(this, GpsService.class);
        if (enabled) {
            intent.setAction(GpsService.ACTION_STOP);
            startService(intent);
            prefs.edit().putBoolean(KEY_ENABLED, false).apply();
        } else {
            intent.setAction(GpsService.ACTION_START);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
            prefs.edit().putBoolean(KEY_ENABLED, true).apply();
        }
        refreshStatus();
    }

    private void saveSettings() {
        int car = 1;
        try { car = Math.max(1, Integer.parseInt(carInput.getText().toString().trim())); } catch (Exception ignored) {}
        int hour = Build.VERSION.SDK_INT >= 23 ? stopTime.getHour() : stopTime.getCurrentHour();
        int minute = Build.VERSION.SDK_INT >= 23 ? stopTime.getMinute() : stopTime.getCurrentMinute();
        prefs.edit()
                .putInt(KEY_CAR, car)
                .putString(KEY_DIRECTION, direction)
                .putInt(KEY_STOP_HOUR, hour)
                .putInt(KEY_STOP_MINUTE, minute)
                .apply();
    }

    private void refreshStatus() {
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        mainBtn.setText(enabled ? "หยุดส่ง GPS" : "เริ่มส่ง GPS");
        mainBtn.setBackgroundColor(enabled ? Color.rgb(220, 38, 38) : Color.rgb(22, 163, 74));
        mainBtn.setTextColor(Color.WHITE);
        int car = prefs.getInt(KEY_CAR, 1);
        int h = prefs.getInt(KEY_STOP_HOUR, 18);
        int m = prefs.getInt(KEY_STOP_MINUTE, 0);
        statusText.setText("รถคันที่ " + car + " · ส่งไป bus/car" + car +
                "\nระบบจะหยุดเองเวลา " + String.format("%02d:%02d", h, m) +
                "\nหากมือถือรีสตาร์ท แอพจะกลับมาส่งต่อเมื่อยังเปิดระบบไว้");
    }
}

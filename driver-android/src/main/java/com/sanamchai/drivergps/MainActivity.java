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
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.util.ArrayList;
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
    static final String KEY_DRIVER_UID = "driver_uid";
    static final String KEY_DRIVER_EMAIL = "driver_email";
    static final String KEY_DRIVER_ID = "driver_id";
    static final String KEY_ERP_VEHICLE_ID = "erp_vehicle_id";
    static final String KEY_DRIVER_QUEUE_NO = "driver_queue_no";
    static final String KEY_ACCOUNT_STATUS = "driver_account_status";
    static final String KEY_SESSION_STATUS = "driver_session_status";
    static final String KEY_BATTERY_PROMPTED  = "battery_prompted";
    static final String KEY_LAST_RESTART      = "last_restart";
    static final String KEY_RESTART_COUNT     = "restart_count";
    static final String KEY_LAST_GPS_AT       = "last_gps_at";
    static final String KEY_LAST_SENT_AT      = "last_sent_at";
    static final String KEY_WAKELOCK_HELD         = "diag_wakelock_held";
    static final String KEY_CALLBACK_REGISTERED   = "diag_callback_registered";
    static final String KEY_LOCATION_FILTER_COUNT = "diag_location_filter_count";
    static final String KEY_LAST_REQUEST_ERROR    = "diag_last_request_error";
    static final String KEY_TODAY_QUEUE       = "today_queue_label";
    static final String KEY_EARNINGS_DATE          = "today_earnings_date";
    static final String KEY_TODAY_BOOKED_AMOUNT    = "today_booked_amount";
    static final String KEY_TODAY_CHECKEDIN_AMOUNT = "today_checkedin_amount";
    static final String KEY_FIREBASE_STATUS   = "firebase_status";

    private static final String DB_URL = BuildConfig.SL_TRANSIT_FIREBASE_DATABASE_URL;
    private static final String FIREBASE_PROJECT_ID = BuildConfig.SL_TRANSIT_FIREBASE_PROJECT_ID;
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
    private static final String DRIVER_WORK_PATH = "operations/driverWorkByServiceDate";
    private static final String DRIVER_TICKETS_PATH = "operations/driverTicketsByServiceDate";
    private static final String DRIVER_WORK_CONTRACT_VERSION = "driver_work_v1";
    private static final String DRIVER_AUTH_EMAIL_DOMAIN = "driver.sl-transit.local";

    private SharedPreferences prefs;
    private FirebaseAuth driverAuth;
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

    // ===== ชุดงานพร้อมใช้จาก ERP Logic Center =====
    private final Map<String, double[]> stopCoordsCache = new HashMap<>();
    private final Map<String, String> stopNameCache = new HashMap<>();
    private boolean stopsCacheLoaded = false;
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
    private static final String[] NAV_LABELS = {"หน้าหลัก", "แผนที่", "รายงาน", "แจ้งเตือน", "บัญชี"};
    private static final String[] NAV_ICONS  = {"🏠", "📋", "📊", "🔔", "👤"};
    private static final int COLOR_DEEP_NAVY = Color.parseColor("#0B1D3A");
    private FrameLayout contentContainer;
    private ScrollView homeScroll;
    private final LinearLayout[] navTabs = new LinearLayout[NAV_LABELS.length];
    private final TextView[] navTabIcons = new TextView[NAV_LABELS.length];
    private final ImageView[] navIconImgs = new ImageView[NAV_LABELS.length]; // PNG icons
    private final TextView[] navTabLabels = new TextView[NAV_LABELS.length];

    // ===== หน้าแผนที่ (Grab/Uber-style live map) =====
    private WebView driverMapWebView;
    private boolean driverMapReady = false;
    private TextView mapBookedCount, mapCheckedCount, mapEarningsValue;

    // ===== หน้ารายงาน (Grab/Uber-style: hero earnings + tab ช่วงเวลา) =====
    private LinearLayout reportDetailContainer;
    private TextView[] reportTabButtons;
    private int reportSelectedPeriod = 0; // 0=วันนี้ 1=สัปดาห์นี้ 2=ทั้งหมด
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

    // ===== Screen Off/On + Remote Command =====
    private android.content.BroadcastReceiver screenReceiver;
    private long screenOffAt = 0;
    private long gpsWasAgoSecAtScreenOff = -1;
    private boolean gpsWasOkAtScreenOff = false;
    private com.google.firebase.database.ValueEventListener remoteCommandListener;
    private com.google.firebase.database.DatabaseReference remoteCommandRef;
    private com.google.firebase.database.ValueEventListener driverIdentityListener;
    private com.google.firebase.database.DatabaseReference driverIdentityRef;
    // ===== Auto GPS Lost tracking =====
    private boolean gpsWasLost = false;
    private long gpsLostAt = 0;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        serviceAvailable = !"unavailable".equals(prefs.getString(KEY_SERVICE_STATUS, "available"));
        if (!ensureFirebaseApp()) {
            forceStopGpsForIdentityGate();
            showLoginScreen("ยังไม่ได้ตั้งค่า Firebase ของแอปคนขับให้ครบ");
            return;
        }
        driverAuth = FirebaseAuth.getInstance();
        if (!hasAuthenticatedDriverIdentity()) {
            forceStopGpsForIdentityGate();
            showLoginScreen(null);
            return;
        }
        enterDriverWorkMode();
    }

    private boolean ensureFirebaseApp() {
        if (!FirebaseApp.getApps(this).isEmpty()) return true;
        if (!hasFirebaseConfig()) return false;
        FirebaseOptions options = new FirebaseOptions.Builder()
                .setApiKey(BuildConfig.SL_TRANSIT_FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.SL_TRANSIT_FIREBASE_APP_ID)
                .setDatabaseUrl(DB_URL)
                .setProjectId(FIREBASE_PROJECT_ID)
                .build();
        FirebaseApp.initializeApp(this, options);
        return true;
    }

    private boolean hasFirebaseConfig() {
        return isRealFirebaseValue(BuildConfig.SL_TRANSIT_FIREBASE_API_KEY)
                && isRealFirebaseValue(BuildConfig.SL_TRANSIT_FIREBASE_APP_ID)
                && isRealFirebaseValue(FIREBASE_PROJECT_ID)
                && isRealFirebaseValue(DB_URL);
    }

    private boolean isRealFirebaseValue(String value) {
        return value != null
                && !value.trim().isEmpty()
                && !value.contains("TODO_FROM_FIREBASE_CONSOLE");
    }

    private void enterDriverWorkMode() {
        try {
        stopDriverWorkLoops();
        if (!ensureFirebaseApp()) {
            forceStopGpsForIdentityGate();
            showLoginScreen("ยังไม่ได้ตั้งค่า Firebase ของแอปคนขับให้ครบ");
            return;
        }
        if (driverAuth == null) driverAuth = FirebaseAuth.getInstance();
        buildUi();
        loadTestModeSetting();
        initFirebaseListener();
        watchDriverIdentityProfile();
        uiTickCount = 0;
        uiHandler.post(uiTick);
        checkForUpdate();
        reportVersionToFirebase();
        refreshTodaySchedule();
        registerScreenReceiver();
        initRemoteCommandListener();
        if (prefs.getBoolean(KEY_ENABLED, false)) requestPermissionsThenStart();
        else refreshUi();
        } catch (Exception error) {
            forceStopGpsForIdentityGate();
            prefs.edit()
                    .putBoolean(KEY_ENABLED, false)
                    .putString(KEY_LAST_ERROR, error.getMessage() == null
                            ? "driver screen failed"
                            : error.getMessage())
                    .apply();
            showLoginScreen("เปิดหน้าแอปคนขับไม่สำเร็จ กรุณาลองเข้าใหม่");
        }
    }

    private void forceStopGpsForIdentityGate() {
        prefs.edit().putBoolean(KEY_ENABLED, false).apply();
        try {
            Intent intent = new Intent(this, GpsService.class);
            intent.setAction(GpsService.ACTION_STOP);
            startService(intent);
        } catch (Exception ignored) {}
    }

    private boolean hasAuthenticatedDriverIdentity() {
        FirebaseUser user = driverAuth == null ? null : driverAuth.getCurrentUser();
        if (user == null) return false;
        return DriverIdentityCenter.isAuthorizedProfile(
                user.getUid(),
                prefs.getString(KEY_DRIVER_UID, null),
                prefs.getString(KEY_ERP_VEHICLE_ID, null),
                prefs.getString(KEY_VEHICLE_ID, null),
                prefs.getString(KEY_ACCOUNT_STATUS, null),
                prefs.getString(KEY_SESSION_STATUS, null));
    }

    private String authorizedRuntimeVehicleId() {
        return hasAuthenticatedDriverIdentity() ? prefs.getString(KEY_VEHICLE_ID, null) : null;
    }

    private void clearDriverIdentity() {
        prefs.edit()
                .putBoolean(KEY_ENABLED, false)
                .remove(KEY_DRIVER_UID)
                .remove(KEY_DRIVER_EMAIL)
                .remove(KEY_DRIVER_ID)
                .remove(KEY_ERP_VEHICLE_ID)
                .remove(KEY_VEHICLE_ID)
                .remove(KEY_DRIVER_QUEUE_NO)
                .remove(KEY_ACCOUNT_STATUS)
                .remove(KEY_SESSION_STATUS)
                .apply();
    }

    private void showLoginScreen(String errorMessage) {
        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(COLOR_BG_PAGE);
        screen.setFitsSystemWindows(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(32), dp(28), dp(32));

        TextView title = new TextView(this);
        title.setText("เข้าสู่ระบบคนขับ");
        title.setTextColor(COLOR_NAVY);
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleLp.setMargins(0, 0, 0, dp(20));
        root.addView(title, titleLp);

        EditText accountInput = new EditText(this);
        accountInput.setHint("รหัสคนขับหรืออีเมล");
        accountInput.setSingleLine(true);
        accountInput.setTextColor(COLOR_NAVY);
        accountInput.setHintTextColor(COLOR_TEXT_MUTED);
        accountInput.setTextSize(18);
        accountInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_NORMAL);
        LinearLayout.LayoutParams accountLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        accountLp.setMargins(0, 0, 0, dp(10));
        root.addView(accountInput, accountLp);

        EditText passwordInput = new EditText(this);
        passwordInput.setHint("รหัสผ่าน");
        passwordInput.setSingleLine(true);
        passwordInput.setTextColor(COLOR_NAVY);
        passwordInput.setHintTextColor(COLOR_TEXT_MUTED);
        passwordInput.setTextSize(18);
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        LinearLayout.LayoutParams passwordLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        passwordLp.setMargins(0, 0, 0, dp(12));
        root.addView(passwordInput, passwordLp);

        TextView errorTextView = new TextView(this);
        errorTextView.setTextColor(COLOR_RED);
        errorTextView.setTextSize(15);
        errorTextView.setGravity(Gravity.CENTER);
        errorTextView.setText(errorMessage == null ? "" : errorMessage);
        LinearLayout.LayoutParams errorLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        errorLp.setMargins(0, 0, 0, dp(14));
        root.addView(errorTextView, errorLp);

        Button loginButton = new Button(this);
        loginButton.setText("เข้าสู่ระบบ");
        loginButton.setTextSize(18);
        loginButton.setTextColor(Color.WHITE);
        loginButton.setBackgroundColor(COLOR_NAVY);
        root.addView(loginButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(54)));

        loginButton.setOnClickListener(v -> {
            String account = accountInput.getText().toString().trim();
            String password = passwordInput.getText().toString();
            if (account.isEmpty() || password.isEmpty()) {
                errorTextView.setText("กรุณากรอกรหัสคนขับและรหัสผ่านจากระบบกลาง");
                return;
            }
            String authEmail = resolveDriverAuthEmail(account);
            loginButton.setEnabled(false);
            errorTextView.setText("กำลังตรวจสอบบัญชี...");
            driverAuth.signInWithEmailAndPassword(authEmail, password)
                    .addOnSuccessListener(result -> loadDriverIdentityProfile(account, loginButton, errorTextView))
                    .addOnFailureListener(error -> {
                        clearDriverIdentity();
                        loginButton.setEnabled(true);
                        errorTextView.setText("เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจรหัสคนขับและรหัสผ่าน");
                    });
        });
        FrameLayout.LayoutParams rootLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        rootLp.gravity = Gravity.CENTER;
        screen.addView(root, rootLp);
        setContentView(screen);
    }

    private String resolveDriverAuthEmail(String account) {
        String value = account == null ? "" : account.trim();
        if (value.contains("@")) return value;
        return value + "@" + DRIVER_AUTH_EMAIL_DOMAIN;
    }

    private void loadDriverIdentityProfile(String email, Button loginButton, TextView errorTextView) {
        FirebaseUser user = driverAuth == null ? null : driverAuth.getCurrentUser();
        if (user == null) {
            loginButton.setEnabled(true);
            errorTextView.setText("ยังสร้างรอบการเข้าสู่ระบบไม่ได้");
            return;
        }
        FirebaseDatabase.getInstance().getReference(DriverIdentityCenter.PROFILE_ROOT)
                .child(user.getUid())
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                String uid = snap.child("uid").getValue(String.class);
                String driverId = snap.child("driverId").getValue(String.class);
                String erpVehicleId = snap.child("erpVehicleId").getValue(String.class);
                String runtimeVehicleId = snap.child("runtimeVehicleId").getValue(String.class);
                String accountStatus = snap.child("accountStatus").getValue(String.class);
                String sessionStatus = snap.child("sessionStatus").getValue(String.class);
                if (!DriverIdentityCenter.isAuthorizedProfile(
                        user.getUid(), uid, erpVehicleId, runtimeVehicleId, accountStatus, sessionStatus)
                        || !DriverIdentityCenter.isValidVehicleBinding(erpVehicleId, runtimeVehicleId)) {
                    clearDriverIdentity();
                    driverAuth.signOut();
                    loginButton.setEnabled(true);
                    errorTextView.setText("บัญชีนี้ยังไม่เปิดใช้งาน หรือยังไม่ได้ผูกกับรถ");
                    return;
                }
                prefs.edit()
                        .putString(KEY_DRIVER_UID, uid)
                        .putString(KEY_DRIVER_EMAIL, email)
                        .putString(KEY_DRIVER_ID, driverId == null ? "" : driverId)
                        .putString(KEY_ERP_VEHICLE_ID, erpVehicleId)
                        .putString(KEY_VEHICLE_ID, runtimeVehicleId)
                        .putString(KEY_ACCOUNT_STATUS, accountStatus)
                        .putString(KEY_SESSION_STATUS, sessionStatus)
                        .putBoolean(KEY_ENABLED, false)
                        .apply();
                enterDriverWorkMode();
            }
            @Override public void onCancelled(DatabaseError error) {
                clearDriverIdentity();
                driverAuth.signOut();
                loginButton.setEnabled(true);
                errorTextView.setText("ยังอ่านข้อมูลคนขับไม่ได้ กรุณาตรวจสิทธิ์และข้อมูลบัญชี");
            }
        });
    }

    private void signOutDriver() {
        forceStopGpsForIdentityGate();
        stopDriverWorkLoops();
        clearDriverIdentity();
        if (driverAuth != null) driverAuth.signOut();
        showLoginScreen("ออกจากระบบแล้ว");
    }

    private void requireActiveDriverOrReturnToLogin(String message) {
        forceStopGpsForIdentityGate();
        stopDriverWorkLoops();
        clearDriverIdentity();
        if (driverAuth != null) driverAuth.signOut();
        showLoginScreen(message);
    }

    private void stopDriverWorkLoops() {
        uiHandler.removeCallbacks(uiTick);
        if (diagRefreshRunnable != null) {
            diagHandler.removeCallbacks(diagRefreshRunnable);
        }
        if (screenReceiver != null) {
            try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
            screenReceiver = null;
        }
        if (remoteCommandRef != null && remoteCommandListener != null) {
            try { remoteCommandRef.removeEventListener(remoteCommandListener); } catch (Exception ignored) {}
            remoteCommandRef = null;
            remoteCommandListener = null;
        }
        if (driverIdentityRef != null && driverIdentityListener != null) {
            try { driverIdentityRef.removeEventListener(driverIdentityListener); } catch (Exception ignored) {}
            driverIdentityRef = null;
            driverIdentityListener = null;
        }
    }

    private void reportVersionToFirebase() {
        try {
            if (!hasAuthenticatedDriverIdentity()) return;
            String vehicleId = authorizedRuntimeVehicleId();
            if (vehicleId == null) return;
            Map<String, Object> data = new HashMap<>();
            data.put("appVersionCode", BuildConfig.VERSION_CODE);
            data.put("appVersionName", BuildConfig.VERSION_NAME);
            data.put("lastOpenAt", System.currentTimeMillis());
            data.put("driverUid", prefs.getString(KEY_DRIVER_UID, ""));
            data.put("driverId", prefs.getString(KEY_DRIVER_ID, ""));
            data.put("erpVehicleId", prefs.getString(KEY_ERP_VEHICLE_ID, ""));
            FirebaseDatabase.getInstance()
                    .getReference("settings/vehicles/" + vehicleId)
                    .updateChildren(data);
        } catch (Exception ignored) {}
    }

    @Override protected void onDestroy() {
        uiHandler.removeCallbacks(uiTick);
        if (screenReceiver != null) try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        if (remoteCommandRef != null && remoteCommandListener != null) {
            remoteCommandRef.removeEventListener(remoteCommandListener);
        }
        if (driverIdentityRef != null && driverIdentityListener != null) {
            driverIdentityRef.removeEventListener(driverIdentityListener);
        }
        super.onDestroy();
    }

    private void watchDriverIdentityProfile() {
        FirebaseUser user = driverAuth == null ? null : driverAuth.getCurrentUser();
        if (user == null) return;
        driverIdentityRef = FirebaseDatabase.getInstance().getReference(DriverIdentityCenter.PROFILE_ROOT)
                .child(user.getUid());
        driverIdentityListener = new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                String uid = snap.child("uid").getValue(String.class);
                String driverId = snap.child("driverId").getValue(String.class);
                String erpVehicleId = snap.child("erpVehicleId").getValue(String.class);
                String runtimeVehicleId = snap.child("runtimeVehicleId").getValue(String.class);
                String accountStatus = snap.child("accountStatus").getValue(String.class);
                String sessionStatus = snap.child("sessionStatus").getValue(String.class);
                if (!DriverIdentityCenter.isAuthorizedProfile(
                        user.getUid(), uid, erpVehicleId, runtimeVehicleId, accountStatus, sessionStatus)
                        || !DriverIdentityCenter.isValidVehicleBinding(erpVehicleId, runtimeVehicleId)) {
                    requireActiveDriverOrReturnToLogin("Driver account is suspended or no longer assigned.");
                    return;
                }
                String previousRuntimeVehicleId = prefs.getString(KEY_VEHICLE_ID, null);
                boolean vehicleChanged = previousRuntimeVehicleId != null
                        && !previousRuntimeVehicleId.equals(runtimeVehicleId);
                prefs.edit()
                        .putString(KEY_DRIVER_UID, uid)
                        .putString(KEY_DRIVER_ID, driverId == null ? "" : driverId)
                        .putString(KEY_ERP_VEHICLE_ID, erpVehicleId)
                        .putString(KEY_VEHICLE_ID, runtimeVehicleId)
                        .putString(KEY_ACCOUNT_STATUS, accountStatus)
                        .putString(KEY_SESSION_STATUS, sessionStatus)
                        .apply();
                if (vehicleChanged) {
                    stopGpsService();
                    refreshTodaySchedule();
                    refreshUi();
                }
            }
            @Override public void onCancelled(DatabaseError error) {
                requireActiveDriverOrReturnToLogin("Driver identity is not readable.");
            }
        };
        driverIdentityRef.addValueEventListener(driverIdentityListener);
    }

    // ===== Screen Off/On Receiver — บันทึกว่า GPS หายตอนหน้าจอดับหรือเปล่า =====
    private void registerScreenReceiver() {
        screenReceiver = new android.content.BroadcastReceiver() {
            @Override public void onReceive(android.content.Context ctx, android.content.Intent intent) {
                String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
                if (vehicleId == null) return;
                long now = System.currentTimeMillis();
                long lastGpsAt = prefs.getLong(KEY_LAST_GPS_AT, 0);
                long gpsAgoSec = lastGpsAt > 0 ? (now - lastGpsAt) / 1000 : -1;
                if (android.content.Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                    screenOffAt = now;
                    gpsWasOkAtScreenOff = gpsAgoSec >= 0 && gpsAgoSec < 30;
                    gpsWasAgoSecAtScreenOff = gpsAgoSec;
                    // บันทึกว่าปิดหน้าจอตอน GPS สถานะอะไร
                    logAutoEvent("screen_off",
                        "gpsAgoSec=" + gpsAgoSec
                        + " gpsOk=" + gpsWasOkAtScreenOff
                        + " wakelockHeld=" + prefs.getBoolean(KEY_WAKELOCK_HELD, false)
                        + " trackingEnabled=" + prefs.getBoolean(KEY_ENABLED, false));
                } else if (android.content.Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                    long screenOffDuration = screenOffAt > 0 ? (now - screenOffAt) / 1000 : -1;
                    boolean gpsOkNow = gpsAgoSec >= 0 && gpsAgoSec < 30;
                    // ถ้า GPS ปกติก่อนปิดหน้าจอ แต่หายหลังเปิด = OS throttle ตอน screen off
                    String diagnosis = "";
                    if (gpsWasOkAtScreenOff && !gpsOkNow) {
                        diagnosis = " → GPS หายระหว่างหน้าจอดับ (OS throttle)";
                    } else if (!gpsWasOkAtScreenOff && gpsOkNow) {
                        diagnosis = " → GPS กลับมาหลังเปิดหน้าจอ";
                    } else if (gpsWasOkAtScreenOff && gpsOkNow) {
                        diagnosis = " → GPS ยังปกติ ไม่โดน throttle";
                    }
                    logAutoEvent("screen_on",
                        "screenOffSec=" + screenOffDuration
                        + " gpsBeforeOff=" + gpsWasOkAtScreenOff
                        + " gpsNowOk=" + gpsOkNow
                        + " gpsAgoSec=" + gpsAgoSec
                        + diagnosis);
                    screenOffAt = 0;
                }
            }
        };
        android.content.IntentFilter f = new android.content.IntentFilter();
        f.addAction(android.content.Intent.ACTION_SCREEN_OFF);
        f.addAction(android.content.Intent.ACTION_SCREEN_ON);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(screenReceiver, f);
            }
        } catch (Exception error) {
            prefs.edit()
                    .putString(KEY_LAST_ERROR, error.getMessage() == null
                            ? "screen receiver unavailable"
                            : error.getMessage())
                    .apply();
        }
    }

    // ===== Remote Command Listener — admin สั่งจาก dashboard ได้เลย =====
    private void initRemoteCommandListener() {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        if (vehicleId == null) return;
        remoteCommandRef = FirebaseDatabase.getInstance()
            .getReference("driverCommands/" + vehicleId + "/command");
        remoteCommandListener = new com.google.firebase.database.ValueEventListener() {
            @Override public void onDataChange(com.google.firebase.database.DataSnapshot snap) {
                String cmd = snap.getValue(String.class);
                if (cmd == null || cmd.isEmpty()) return;
                // execute command แล้วลบทิ้งทันที
                remoteCommandRef.setValue(null);
                executeRemoteCommand(cmd);
            }
            @Override public void onCancelled(com.google.firebase.database.DatabaseError e) {}
        };
        remoteCommandRef.addValueEventListener(remoteCommandListener);
    }

    private void executeRemoteCommand(String cmd) {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        if (vehicleId == null) return;
        long now = System.currentTimeMillis();
        long lastGpsAt = prefs.getLong(KEY_LAST_GPS_AT, 0);
        long lastSentAt = prefs.getLong(KEY_LAST_SENT_AT, 0);
        long gpsAgoSec = lastGpsAt > 0 ? (now - lastGpsAt) / 1000 : -1;
        long fbAgoSec  = lastSentAt > 0 ? (now - lastSentAt) / 1000 : -1;
        switch (cmd) {
            case "requestDiag":
                // ส่ง diagnostic report ทันที ครบทุก field
                logIssueToFirebase("[remote] admin ขอ diagnostic report", gpsAgoSec, fbAgoSec, true);
                // บันทึก response กลับให้ admin รู้ว่าแอพรับ command แล้ว
                FirebaseDatabase.getInstance()
                    .getReference("driverCommands/" + vehicleId + "/lastResponse")
                    .setValue("requestDiag executed at " + new java.text.SimpleDateFormat(
                        "HH:mm:ss", java.util.Locale.US).format(new java.util.Date(now)));
                break;
            case "ping":
                // ตอบ ping ทันที — admin รู้ว่าแอพยังมีชีวิต
                java.util.Map<String, Object> pong = new java.util.HashMap<>();
                pong.put("pongAt", now);
                pong.put("gpsAgoSec", gpsAgoSec);
                pong.put("fbAgoSec", fbAgoSec);
                pong.put("wakelockHeld", prefs.getBoolean(KEY_WAKELOCK_HELD, false));
                pong.put("trackingEnabled", prefs.getBoolean(KEY_ENABLED, false));
                pong.put("appVersion", BuildConfig.VERSION_NAME);
                FirebaseDatabase.getInstance()
                    .getReference("driverCommands/" + vehicleId + "/lastResponse")
                    .setValue(pong);
                break;
            case "forceGpsRestart":
                // สั่ง restart GPS ผ่าน Intent ไปยัง GpsService
                android.content.Intent gpsIntent = new android.content.Intent(this, GpsService.class);
                gpsIntent.setAction("ACTION_FORCE_GPS_RESTART");
                startService(gpsIntent);
                logAutoEvent("remote_force_gps_restart", "triggered by admin");
                break;
            case "requestLocation":
                // ขอพิกัดปัจจุบันทันที
                logIssueToFirebase("[remote] admin ขอพิกัดปัจจุบัน gpsAgoSec=" + gpsAgoSec, gpsAgoSec, fbAgoSec, true);
                break;
            case "startTracking":
                // admin สั่งเริ่มงาน — เหมือนคนขับกดปุ่มเริ่มเอง
                if (!prefs.getBoolean(KEY_ENABLED, false)) {
                    prefs.edit().putBoolean(KEY_ENABLED, true).apply();
                    android.content.Intent startIntent = new android.content.Intent(MainActivity.this, GpsService.class);
                    startIntent.setAction("ACTION_START");
                    startService(startIntent);
                    logAutoEvent("remote_start_tracking", "triggered by admin");
                    FirebaseDatabase.getInstance()
                        .getReference("driverCommands/" + vehicleId + "/lastResponse")
                        .setValue("startTracking executed — GPS started at "
                            + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(now)));
                } else {
                    FirebaseDatabase.getInstance()
                        .getReference("driverCommands/" + vehicleId + "/lastResponse")
                        .setValue("startTracking skipped — already running");
                }
                break;
            case "stopTracking":
                // admin สั่งหยุดงาน — เหมือนคนขับกดปุ่มหยุดเอง
                if (prefs.getBoolean(KEY_ENABLED, false)) {
                    prefs.edit().putBoolean(KEY_ENABLED, false).apply();
                    android.content.Intent stopIntent = new android.content.Intent(MainActivity.this, GpsService.class);
                    stopIntent.setAction("ACTION_STOP");
                    startService(stopIntent);
                    logAutoEvent("remote_stop_tracking", "triggered by admin");
                    FirebaseDatabase.getInstance()
                        .getReference("driverCommands/" + vehicleId + "/lastResponse")
                        .setValue("stopTracking executed — GPS stopped at "
                            + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(now)));
                } else {
                    FirebaseDatabase.getInstance()
                        .getReference("driverCommands/" + vehicleId + "/lastResponse")
                        .setValue("stopTracking skipped — already stopped");
                }
                break;
        }
    }

    // ===== Auto Event Logger — บันทึกอัตโนมัติไม่ต้องให้คนขับกด =====
    private void logAutoEvent(String event, String detail) {
        String vehicleId = prefs.getString(KEY_VEHICLE_ID, null);
        if (vehicleId == null) return;
        try {
            long now = System.currentTimeMillis();
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("event", event);
            data.put("detail", detail);
            data.put("message", "[auto] " + event + ": " + detail);
            data.put("timestamp", now);
            data.put("level", "debug");
            data.put("appVersion", BuildConfig.VERSION_NAME);
            data.put("device", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL
                + " (Android " + android.os.Build.VERSION.RELEASE + ")");
            FirebaseDatabase.getInstance()
                .getReference("driverLogs/" + vehicleId).push().setValue(data);
        } catch (Exception ignored) {}
    }

    // ===== Auto GPS Lost/Recovered — บันทึกอัตโนมัติทุกครั้งที่ GPS หายและกลับมา =====
    private void checkAutoGpsLostRecovered(long gpsAgoSec) {
        boolean gpsLostNow = gpsAgoSec > 30;
        if (gpsLostNow && !gpsWasLost) {
            // GPS เพิ่งหาย
            gpsWasLost = true;
            gpsLostAt = System.currentTimeMillis();
            logAutoEvent("gps_lost",
                "gpsAgoSec=" + gpsAgoSec
                + " wakelockHeld=" + prefs.getBoolean(KEY_WAKELOCK_HELD, false)
                + " callbackRegistered=" + prefs.getBoolean(KEY_CALLBACK_REGISTERED, false)
                + " filteredCount=" + prefs.getInt(KEY_LOCATION_FILTER_COUNT, 0)
                + " lastError=" + prefs.getString(KEY_LAST_ERROR, "")
                + " screenOn=" + (android.os.PowerManager.class.cast(
                    getSystemService(POWER_SERVICE)) != null
                    ? ((android.os.PowerManager) getSystemService(POWER_SERVICE)).isInteractive()
                    : "unknown"));
        } else if (!gpsLostNow && gpsWasLost) {
            // GPS กลับมาแล้ว
            gpsWasLost = false;
            long lostDurationSec = gpsLostAt > 0 ? (System.currentTimeMillis() - gpsLostAt) / 1000 : -1;
            logAutoEvent("gps_recovered",
                "lostDurationSec=" + lostDurationSec
                + " gpsAgoSec=" + gpsAgoSec
                + " filteredCount=" + prefs.getInt(KEY_LOCATION_FILTER_COUNT, 0));
        }
    }

    // ---- เชื่อม Firebase ฟัง online status ของทุกคัน ----
    private void initFirebaseListener() {
        try {
            ensureFirebaseApp();
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
        DataSnapshot assignment = booking.child("assignment");
        String contractVersion = assignment.child("contractVersion").getValue(String.class);
        boolean hasCentralContract = "booking_assignment_v1".equals(contractVersion);
        DataSnapshot source = hasCentralContract ? assignment : booking;
        if (Boolean.TRUE.equals(source.child("scheduleOnly").getValue(Boolean.class))
                || Boolean.TRUE.equals(source.child("noLiveTracking").getValue(Boolean.class))) return false;
        String plannedVehicleId = source.child("plannedVehicleId").getValue(String.class);
        return vehicleId.equals(plannedVehicleId);
    }

    private String plannedVehicleIdForBooking(DataSnapshot booking) {
        if (booking == null) return null;
        DataSnapshot assignment = booking.child("assignment");
        if ("booking_assignment_v1".equals(assignment.child("contractVersion").getValue(String.class))) {
            return assignment.child("plannedVehicleId").getValue(String.class);
        }
        return booking.child("plannedVehicleId").getValue(String.class);
    }
    private void loadDriverTicketsForDate(String date, String vehicleId, ValueEventListener listener) {
        FirebaseDatabase.getInstance().getReference(DRIVER_TICKETS_PATH)
                .child(date).child(vehicleId)
                .addListenerForSingleValueEvent(listener);
    }
    // ===== ดึงยอดผู้โดยสารวันนี้: จอง / เช็คอินแล้ว / ยังไม่มาเช็คอิน =====
    private void refreshPassengerSummary() {
        if (!hasAuthenticatedDriverIdentity()) return;
        final String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        loadDriverTicketsForDate(today, vehicleId, new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                int booked = 0;
                int checkedIn = 0;
                double bookedAmount = 0;
                double checkedInAmount = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String bookingDate = child.child("date").getValue(String.class);
                    if (!today.equals(bookingDate)) continue;
                    String status = String.valueOf(child.child("status").getValue());
                    if ("cancelled".equals(status)) continue;
                    booked++;
                    double fare = ticketFareAmount(child);
                    bookedAmount += fare;
                    String checkinStatus = String.valueOf(child.child("originCheckin").child("status").getValue());
                    if ("boarded".equals(checkinStatus)) {
                        checkedIn++;
                        checkedInAmount += fare;
                    }
                }
                int pending = Math.max(0, booked - checkedIn);
                if (summaryBookedCount != null) summaryBookedCount.setText(String.valueOf(booked));
                if (summaryCheckedCount != null) summaryCheckedCount.setText(String.valueOf(checkedIn));
                if (summaryPendingCount != null) summaryPendingCount.setText(String.valueOf(pending));
                prefs.edit()
                        .putString(KEY_EARNINGS_DATE, today)
                        .putInt("today_total_pax", booked)
                        .putInt("today_checked_in", checkedIn)
                        .putFloat(KEY_TODAY_BOOKED_AMOUNT, (float) bookedAmount)
                        .putFloat(KEY_TODAY_CHECKEDIN_AMOUNT, (float) checkedInAmount)
                        .apply();
                onTodayEarningsUpdated();
            }
            @Override public void onCancelled(DatabaseError error) {}
        });
    }

    // ราคาต่อตั๋ว 1 ใบ — อ่านจาก driver ticket mirror (fareAmount) พร้อม fallback เผื่อข้อมูลเก่า
    private double ticketFareAmount(DataSnapshot ticket) {
        Object v = ticket.child("fareAmount").getValue();
        if (v == null) v = ticket.child("price").getValue();
        if (v == null) v = ticket.child("fare").getValue();
        try { return Double.parseDouble(String.valueOf(v)); }
        catch (Exception ignored) { return 0; }
    }

    // เรียกทุกครั้งที่ยอดรายได้วันนี้เปลี่ยน — รีเฟรชหน้ารายงานถ้ากำลังเปิดอยู่
    private void onTodayEarningsUpdated() {
        LinearLayout root = contentContainer == null ? null
                : (LinearLayout) contentContainer.findViewWithTag("report_page_root");
        if (root != null) buildReportPageContent(root);
    }

    // ===== งานประจำวันที่ ERP Logic Center จัดให้รถคันนี้ =====
    private void refreshTodaySchedule() {
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before opening driver work.");
            return;
        }
        final String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) {
            showUnassignedQueue("ยังไม่ได้เลือกรถ");
            return;
        }
        final String serviceDate = serviceDateToday();
        if (!DriverIdentityCenter.isSelfOnlyWorkPath(serviceDate, vehicleId, vehicleId)) {
            showUnassignedQueue("Driver identity does not match the requested vehicle.");
            return;
        }
        FirebaseDatabase.getInstance().getReference(DRIVER_WORK_PATH)
                .child(serviceDate).child(vehicleId)
                .addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                applyDriverWorkContract(snap, serviceDate, vehicleId);
            }
            @Override public void onCancelled(DatabaseError error) {
                showUnassignedQueue("โหลดงานจากระบบกลางไม่สำเร็จ");
            }
        });
    }

    private String serviceDateToday() {
        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
        sdf.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Bangkok"));
        return sdf.format(new java.util.Date());
    }

    private void showUnassignedQueue(String message) {
        runOnUiThread(() -> {
            activeTrip = null;
            stopCoordsCache.clear();
            stopNameCache.clear();
            stopsCacheLoaded = false;
            prefs.edit().remove(KEY_DRIVER_QUEUE_NO).apply();
            if (queueValueText != null) queueValueText.setText("ยังไม่มีคิว");
            if (routeValueText != null) routeValueText.setText(message);
            if (nextRoundValueText != null) nextRoundValueText.setText("—");
        });
    }

    private void applyDriverWorkContract(DataSnapshot snap, String serviceDate, String vehicleId) {
        String contractVersion = snap.child("contractVersion").getValue(String.class);
        String contractStatus = snap.child("status").getValue(String.class);
        String contractDate = snap.child("serviceDate").getValue(String.class);
        String contractVehicleId = snap.child("vehicleId").getValue(String.class);
        String erpVehicleId = snap.child("erpVehicleId").getValue(String.class);
        if (!DRIVER_WORK_CONTRACT_VERSION.equals(contractVersion)
                || !serviceDate.equals(contractDate)
                || !vehicleId.equals(contractVehicleId)
                || erpVehicleId == null || erpVehicleId.isEmpty()) {
            showUnassignedQueue("ยังไม่มีชุดงานที่ถูกต้องจากระบบกลาง");
            return;
        }
        if ("unassigned".equals(contractStatus)) {
            showUnassignedQueue("ระบบกลางยังไม่ได้มอบหมายงานให้รถคันนี้");
            return;
        }

        String assignmentId = snap.child("assignmentId").getValue(String.class);
        String assignmentMode = snap.child("assignmentMode").getValue(String.class);
        String queueId = snap.child("queueId").getValue(String.class);
        Long queueNo = snap.child("queueNo").getValue(Long.class);
        boolean validMode = "rotation".equals(assignmentMode)
                || "fixed".equals(assignmentMode)
                || "manual_override".equals(assignmentMode);
        if (assignmentId == null || assignmentId.isEmpty() || queueId == null || queueId.isEmpty()
                || queueNo == null || !validMode) {
            showUnassignedQueue("ข้อมูลการมอบหมายจากระบบกลางไม่ครบ");
            return;
        }

        prefs.edit().putInt(KEY_DRIVER_QUEUE_NO, queueNo.intValue()).apply();
        stopCoordsCache.clear();
        stopNameCache.clear();
        java.util.List<Trip> allTrips = readDriverWorkTrips(snap.child("allTrips"));
        TripSelection selectedTrips = selectTripsForCurrentBangkokTime(allTrips);
        Trip current = selectedTrips.current != null ? selectedTrips.current : readDriverWorkTrip(snap.child("currentTrip"));
        Trip next = selectedTrips.next != null ? selectedTrips.next : readDriverWorkTrip(snap.child("nextTrip"));
        if ("assigned".equals(contractStatus) && current == null && next == null) {
            showUnassignedQueue("ระบบกลางไม่ได้ส่งเที่ยวปัจจุบันหรือเที่ยวถัดไป");
            return;
        }
        if (!"assigned".equals(contractStatus) && !"service_complete".equals(contractStatus)) {
            showUnassignedQueue("สถานะชุดงานจากระบบกลางไม่ถูกต้อง");
            return;
        }

        stopsCacheLoaded = !stopCoordsCache.isEmpty();
        activeTrip = current;
        runOnUiThread(() -> {
            if (queueValueText != null) queueValueText.setText("คิว " + queueNo);
            if (routeValueText != null) {
                if (current != null) routeValueText.setText(current.routeNameTh);
                else routeValueText.setText(next != null ? "รอรอบถัดไป" : "หมดรอบวันนี้แล้ว");
            }
            if (nextRoundValueText != null) {
                if (next != null && !next.stops.isEmpty()) {
                    TripStop firstStop = next.stops.get(0);
                    nextRoundValueText.setText(firstStop.time + " น.  (" + next.routeNameTh + ")");
                } else {
                    nextRoundValueText.setText("หมดรอบวันนี้แล้ว");
                }
            }
        });
    }

    private static class TripSelection {
        Trip current;
        Trip next;
    }

    private java.util.List<Trip> readDriverWorkTrips(DataSnapshot tripsSnap) {
        java.util.List<Trip> trips = new ArrayList<>();
        if (tripsSnap == null || !tripsSnap.exists()) return trips;
        for (DataSnapshot tripSnap : tripsSnap.getChildren()) {
            Trip trip = readDriverWorkTrip(tripSnap);
            if (trip != null) trips.add(trip);
        }
        trips.sort((a, b) -> Integer.compare(tripStartMinutes(a), tripStartMinutes(b)));
        return trips;
    }

    private TripSelection selectTripsForCurrentBangkokTime(java.util.List<Trip> trips) {
        TripSelection selection = new TripSelection();
        if (trips == null || trips.isEmpty()) return selection;
        int now = currentBangkokMinutes();
        for (Trip trip : trips) {
            int start = tripStartMinutes(trip);
            int end = tripEndMinutes(trip);
            if (start <= now && now <= end) {
                selection.current = trip;
            } else if (start > now && selection.next == null) {
                selection.next = trip;
            }
        }
        return selection;
    }

    private int currentBangkokMinutes() {
        java.util.Calendar calendar = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Bangkok"));
        return calendar.get(java.util.Calendar.HOUR_OF_DAY) * 60 + calendar.get(java.util.Calendar.MINUTE);
    }

    private int tripStartMinutes(Trip trip) {
        if (trip == null || trip.stops.isEmpty()) return 24 * 60 + 1;
        return timeMinutes(trip.stops.get(0).time);
    }

    private int tripEndMinutes(Trip trip) {
        if (trip == null || trip.stops.isEmpty()) return -1;
        return timeMinutes(trip.stops.get(trip.stops.size() - 1).time);
    }

    private int timeMinutes(String value) {
        if (value == null) return -1;
        String[] parts = value.trim().split(":");
        if (parts.length != 2) return -1;
        try {
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return -1;
            return hour * 60 + minute;
        } catch (Exception ignored) {
            return -1;
        }
    }

    private Trip readDriverWorkTrip(DataSnapshot tripSnap) {
        if (tripSnap == null || !tripSnap.exists()) return null;
        String queueTripId = tripSnap.child("queueTripId").getValue(String.class);
        String routeId = tripSnap.child("routeId").getValue(String.class);
        String routeSequenceVersionId = tripSnap.child("routeSequenceVersionId").getValue(String.class);
        if (queueTripId == null || queueTripId.isEmpty() || routeId == null || routeId.isEmpty()
                || routeSequenceVersionId == null || routeSequenceVersionId.isEmpty()) return null;

        Trip trip = new Trip();
        trip.tripNo = strOrDash(tripSnap.child("tripNo").getValue());
        trip.direction = strOrDash(tripSnap.child("routeDirection").getValue());
        trip.routeKey = routeId;
        trip.routeNameTh = strOrDash(tripSnap.child("routeNameTh").getValue());
        for (DataSnapshot stopSnap : tripSnap.child("orderedStops").getChildren()) {
            String stopKey = stopSnap.child("stopKey").getValue(String.class);
            String stopNameTh = stopSnap.child("stopNameTh").getValue(String.class);
            String time = stopSnap.child("time").getValue(String.class);
            Double lat = stopSnap.child("lat").getValue(Double.class);
            Double lng = stopSnap.child("lng").getValue(Double.class);
            if (stopKey == null || stopKey.isEmpty() || stopNameTh == null || stopNameTh.isEmpty()
                    || time == null || time.isEmpty() || lat == null || lng == null) return null;
            trip.stops.add(new TripStop(
                    stopKey,
                    stopNameTh,
                    time,
                    strOrDash(stopSnap.child("eventType").getValue()),
                    Boolean.TRUE.equals(stopSnap.child("isConditional").getValue(Boolean.class))));
            stopCoordsCache.put(stopKey, new double[]{lat, lng});
            stopNameCache.put(stopKey, stopNameTh);
        }
        return trip.stops.size() >= 2 ? trip : null;
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
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before changing service status.");
            return;
        }
        serviceAvailable = available;
        prefs.edit().putString(KEY_SERVICE_STATUS, available ? "available" : "unavailable").apply();
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
        // เขียนขึ้น runtime live vehicle เพื่อให้แผนที่ผู้โดยสารรู้ว่ารถนี้ไม่พร้อมรับ แม้ GPS ยังส่งอยู่
        FirebaseDatabase.getInstance().getReference("operations/liveVehicles/" + vehicleId + "/serviceStatus")
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

    // ===== สร้างปุ่มไอคอน 1 ช่อง — PNG icon + card ขนาดคงที่เท่ากันทุกอัน =====
    private LinearLayout buildActionButton(int drawableResId, String label, int accentColor, android.view.View.OnClickListener onClick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(14));
        box.setBackground(bg);
        box.setElevation(dp(1));
        box.setClickable(true);
        box.setOnClickListener(v -> { animateTap(box); onClick.onClick(v); });

        // PNG icon — ไม่ต้องใส่วงกลมพื้นหลัง เพราะไอคอนมี bg ในตัวเอง
        FrameLayout iconWrap = new FrameLayout(this);
        LinearLayout.LayoutParams wrapLp = new LinearLayout.LayoutParams(dp(56), dp(56));
        wrapLp.gravity = Gravity.CENTER_HORIZONTAL;
        iconWrap.setLayoutParams(wrapLp);

        ImageView iconImg = new ImageView(this);
        if (drawableResId != 0) iconImg.setImageResource(drawableResId);
        iconImg.setScaleType(ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams imgLp = new FrameLayout.LayoutParams(dp(52), dp(52));
        imgLp.gravity = Gravity.CENTER;
        iconWrap.addView(iconImg, imgLp);
        box.addView(iconWrap);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_NAVY);
        labelView.setTextSize(10);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setGravity(Gravity.CENTER);
        labelView.setPadding(0, dp(7), 0, 0);
        box.addView(labelView);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(90), 1f);
        lp.setMargins(dp(5), dp(5), dp(5), dp(5));
        box.setLayoutParams(lp);
        return box;
    }

    // ===== 3.1) สแกน QR + เช็คอินผู้โดยสาร =====
    private void openQrScanner() {
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before scanning tickets.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 30);
            return;
        }
        IntentIntegrator integrator = new IntentIntegrator(this);
        integrator.setOrientationLocked(true);  // แนวตั้งเสมอ
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
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before scanning tickets.");
            return;
        }
        if (code == null || code.trim().isEmpty()) return;
        code = code.trim();
        // รองรับ QR ที่เป็นลิงก์ เช่น https://sl-transit.com/check_ticket.html?code=BK123456
        if (code.contains("code=")) {
            int idx = code.indexOf("code=");
            code = code.substring(idx + 5);
            int amp = code.indexOf('&');
            if (amp >= 0) code = code.substring(0, amp);
        }
        final String finalCode = code.trim().toUpperCase(java.util.Locale.US);
        if (!finalCode.matches("^(BK|TB)[A-Z0-9]{6,20}$")) {
            new AlertDialog.Builder(this).setTitle("QR ตั๋วไม่ถูกต้อง")
                    .setMessage("กรุณาสแกน QR จากหน้าตั๋ว S.L.Transit")
                    .setPositiveButton("ตกลง", null).show();
            return;
        }
        final String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
        final String bookingPath = bookingsPath();
        if (bookingPath == null) {
            new AlertDialog.Builder(this).setTitle("กำลังโหลดโหมดระบบ")
                    .setMessage("กรุณาลองสแกนอีกครั้ง").setPositiveButton("ตกลง", null).show();
            return;
        }

        final DatabaseReference bookingRef = FirebaseDatabase.getInstance()
                .getReference(bookingPath + "/" + finalCode);
        bookingRef.addListenerForSingleValueEvent(new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                if (!snap.exists()) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ไม่พบตั๋ว")
                            .setMessage("ไม่พบรหัสตั๋ว: " + finalCode)
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                String bookingStatus = String.valueOf(snap.child("status").getValue());
                if ("cancelled".equals(bookingStatus)
                        || Boolean.TRUE.equals(snap.child("cancelled").getValue(Boolean.class))) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ตั๋วถูกยกเลิกแล้ว")
                            .setMessage("ไม่สามารถเช็คอินตั๋ว " + finalCode)
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                String travelDate = String.valueOf(snap.child("date").getValue());
                java.text.SimpleDateFormat dateFormat = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
                dateFormat.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Bangkok"));
                String today = dateFormat.format(new java.util.Date());
                if (!today.equals(travelDate)) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("วันที่เดินทางไม่ตรง")
                            .setMessage("ตั๋วนี้เดินทางวันที่ " + travelDate + " ไม่ใช่วันนี้")
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }
                if (!bookingBelongsToVehicle(snap, vehicleId)) {
                    String planned = plannedVehicleIdForBooking(snap);
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
                            .setTitle("เช็คอินและยืนยันตัวตนแล้ว")
                            .setMessage("ตั๋ว " + finalCode + " ถูกสแกนสำเร็จไปก่อนหน้านี้แล้ว")
                            .setPositiveButton("ตกลง", null).show();
                    return;
                }

                final String name = String.valueOf(snap.child("name").getValue());
                final String seats = String.valueOf(snap.child("seats").getValue());
                final String route = String.valueOf(snap.child("route").getValue());
                double price = 0;
                try { price = Double.parseDouble(String.valueOf(snap.child("price").getValue())); }
                catch (Exception ignored) {}
                final double fare = price;
                final long verifiedAt = System.currentTimeMillis();

                Map<String, Object> updates = new HashMap<>();
                updates.put("originCheckin/status", "boarded");
                updates.put("originCheckin/vehicleId", vehicleId);
                updates.put("originCheckin/checkedBy", "driver_qr");
                updates.put("originCheckin/ts", verifiedAt);
                updates.put("originCheckin/identityVerified", true);
                updates.put("originCheckin/identityVerifiedAt", verifiedAt);
                updates.put("originCheckin/identityVerifiedBy", "driver_qr");
                updates.put("originCheckin/farePaidToDriver", fare);
                updates.put("originCheckin/fareSettled", false);
                updates.put("passengerIdentity/status", "verified");
                updates.put("passengerIdentity/verifiedAt", verifiedAt);
                updates.put("passengerIdentity/verifiedBy", "driver_qr");
                updates.put("passengerIdentity/vehicleId", vehicleId);

                bookingRef.updateChildren(updates)
                        .addOnSuccessListener(unused -> {
                            refreshPassengerSummary();
                            new AlertDialog.Builder(MainActivity.this)
                                    .setTitle("ยืนยันตัวตนสำเร็จ")
                                    .setMessage("ตั๋ว: " + finalCode + "\nชื่อ: " + name
                                            + "\nที่นั่ง: " + seats + "\nเส้นทาง: " + route
                                            + "\n\nระบบเช็คอินผู้โดยสารเรียบร้อยแล้ว")
                                    .setPositiveButton("ตกลง", null).show();
                        })
                        .addOnFailureListener(error -> new AlertDialog.Builder(MainActivity.this)
                                .setTitle("บันทึกเช็คอินไม่สำเร็จ")
                                .setMessage("กรุณาตรวจสอบอินเทอร์เน็ตแล้วสแกนอีกครั้ง")
                                .setPositiveButton("ตกลง", null).show());
            }
            @Override public void onCancelled(DatabaseError error) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("ตรวจสอบตั๋วไม่ได้")
                        .setMessage("กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")
                        .setPositiveButton("ตกลง", null).show();
            }
        });
    }

    // ===== 3.2) ข้อมูลผู้โดยสารที่จองของคันนี้วันนี้ =====
    private void showPassengerList() {
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before opening passenger work.");
            return;
        }
        final String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        loadDriverTicketsForDate(today, vehicleId, new ValueEventListener() {
            @Override public void onDataChange(DataSnapshot snap) {
                StringBuilder sb = new StringBuilder();
                int count = 0;
                for (DataSnapshot child : snap.getChildren()) {
                    String bookingDate = child.child("date").getValue(String.class);
                    if (!today.equals(bookingDate)) continue;
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
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
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
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
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
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
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
        versionLabel.setText("v" + BuildConfig.VERSION_NAME + " (" + authorizedRuntimeVehicleId() + ")");
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
        routeValueText.setTextSize(13);
        routeValueText.setPadding(dp(30), dp(4), dp(8), dp(14));
        routeValueText.setMaxLines(1);
        routeValueText.setEllipsize(android.text.TextUtils.TruncateAt.END);
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
        nextRoundValueText.setTextSize(13);
        nextRoundValueText.setMaxLines(1);
        nextRoundValueText.setEllipsize(android.text.TextUtils.TruncateAt.END);
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
        actionsRowTop.addView(buildActionButton(getResIdByName("ic_ticket_check"), "สแกนตั๋ว",      COLOR_TEAL,       v -> openQrScanner()));
        actionsRowTop.addView(buildActionButton(getResIdByName("ic_passenger"),    "ข้อมูล\nการจอง", COLOR_OCEAN,      v -> showPassengerList()));
        root.addView(actionsRowTop, actionsRowLp);

        LinearLayout actionsRowBottom = new LinearLayout(this);
        actionsRowBottom.setOrientation(LinearLayout.HORIZONTAL);
        actionsRowBottom.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsRowBottomLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsRowBottomLp.setMargins(0, dp(8), 0, dp(12));
        actionsRowBottom.addView(buildActionButton(getResIdByName("ic_location"), "รายงาน\nสถานะ",   COLOR_LIGHT_TEAL, v -> showDiagnosticPage()));
        actionsRowBottom.addView(buildActionButton(getResIdByName("ic_alert"),    "แจ้งเหตุ\nขัดข้อง", COLOR_ORANGE,  v -> showIncidentDialog()));
        root.addView(actionsRowBottom, actionsRowBottomLp);

        // ===== ข้อ 3: แถบ เริ่มงาน/หยุดงาน แบบ full-width bar ใต้ไอคอน =====
        root.addView(buildStartWorkBar());

        // ===== ข้อ 2: version label อยู่ล่างสุด =====
        LinearLayout.LayoutParams versionLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        versionLp.setMargins(0, dp(16), 0, dp(8));
        root.addView(versionLabel, versionLp);

        // ===== สร้างหน้า nav ทั้ง 4 หน้าจริง =====
        contentContainer.addView(buildLiveMapPage());       // index 1: แผนที่
        contentContainer.addView(buildReportPage());        // index 2: รายงาน (รวมวันนี้/สัปดาห์/รวม/รายได้)
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
                    diagHandler.postDelayed(this, 1000);
                }
            }
        };
        diagHandler.postDelayed(diagRefreshRunnable, 1000);
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
            String vid = authorizedRuntimeVehicleId();
            if (vid == null) return;
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
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) return;
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

            // PNG icon
            int[] NAV_RES = {
                getResIdByName("ic_home"), getResIdByName("ic_today_job"),
                getResIdByName("ic_report"), getResIdByName("ic_alert"),
                getResIdByName("ic_account")
            };
            ImageView iconImg = new ImageView(this);
            if (NAV_RES[i] != 0) iconImg.setImageResource(NAV_RES[i]);
            iconImg.setAlpha(0.45f);
            LinearLayout.LayoutParams imgLp = new LinearLayout.LayoutParams(dp(26), dp(26));
            imgLp.gravity = Gravity.CENTER_HORIZONTAL;
            tab.addView(iconImg, imgLp);
            navIconImgs[i] = iconImg;

            // dummy TextView เพื่อไม่ให้ navTabIcons[i] เป็น null
            TextView iconDummy = new TextView(this);
            iconDummy.setVisibility(android.view.View.GONE);
            navTabIcons[i] = iconDummy;

            TextView label = new TextView(this);
            label.setText(NAV_LABELS[i]);
            label.setTextSize(9);
            label.setGravity(Gravity.CENTER);
            label.setIncludeFontPadding(false);
            label.setPadding(0, dp(3), 0, 0);
            label.setTextColor(Color.argb(153, 255, 255, 255));
            tab.addView(label);

            navTabs[i] = tab;
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
    // หน้า 1: แผนที่ — ตำแหน่งรถสด + ป้ายจอด + สรุปผู้โดยสาร (Grab/Uber-style)
    // =====================================================================
    private LinearLayout buildLiveMapPage() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setTag("nav_page_แผนที่");
        page.setBackgroundColor(COLOR_BG_PAGE);
        page.setVisibility(android.view.View.GONE);
        page.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(16), dp(52), dp(16), dp(8));
        TextView title = new TextView(this);
        title.setText("🗺  แผนที่");
        title.setTextColor(COLOR_NAVY);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(title);
        page.addView(header);

        // สรุปด่วน: จอง / เช็คอินแล้ว / รายได้วันนี้ (แถบสไตล์ Grab/Uber home)
        LinearLayout stripCard = new LinearLayout(this);
        stripCard.setOrientation(LinearLayout.HORIZONTAL);
        stripCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        GradientDrawable stripBg = new GradientDrawable();
        stripBg.setColor(Color.WHITE);
        stripBg.setCornerRadius(dp(12));
        stripCard.setBackground(stripBg);
        stripCard.setElevation(dp(1));
        LinearLayout.LayoutParams stripLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        stripLp.setMargins(dp(16), 0, dp(16), dp(10));
        stripCard.setLayoutParams(stripLp);
        mapBookedCount = new TextView(this);
        mapCheckedCount = new TextView(this);
        mapEarningsValue = new TextView(this);
        stripCard.addView(buildMapStripStat("จองวันนี้", mapBookedCount));
        stripCard.addView(buildMapStripStat("เช็คอินแล้ว", mapCheckedCount));
        stripCard.addView(buildMapStripStat("รายได้วันนี้", mapEarningsValue));
        page.addView(stripCard);

        // แผนที่ (WebView + Leaflet/OpenStreetMap)
        driverMapWebView = new WebView(this);
        driverMapReady = false;
        WebSettings ws = driverMapWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        driverMapWebView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                driverMapReady = true;
                pushStopsIfReady();
                pushRouteIfReady();
                updateLiveMap();
            }
        });
        driverMapWebView.loadDataWithBaseURL(
                "https://sl-transit.com/", buildDriverMapHtml(), "text/html", "UTF-8", null);
        LinearLayout.LayoutParams mapLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        page.addView(driverMapWebView, mapLp);

        loadErpMapStops();
        loadPublishedRoutePolyline();
        return page;
    }

    // ===== ป้ายจอด จาก ERP Data Center (data/erpDataCenter/catalog/stops) =====
    private static class MapStop {
        double lat, lng;
        String name;
        boolean terminal;
        double order;
    }
    private final java.util.List<MapStop> erpMapStops = new java.util.ArrayList<>();
    private boolean erpMapStopsLoaded = false;
    private boolean erpMapStopsSent = false;

    private void loadErpMapStops() {
        FirebaseDatabase.getInstance().getReference("data/erpDataCenter/catalog/stops")
                .addListenerForSingleValueEvent(new ValueEventListener() {
                    @Override public void onDataChange(DataSnapshot snap) {
                        erpMapStops.clear();
                        for (DataSnapshot child : snap.getChildren()) {
                            Double lat = child.child("lat").getValue(Double.class);
                            Double lng = child.child("lng").getValue(Double.class);
                            if (lat == null || lng == null) continue;
                            MapStop s = new MapStop();
                            s.lat = lat;
                            s.lng = lng;
                            String name = child.child("nameTh").getValue(String.class);
                            if (name == null) name = child.child("name").getValue(String.class);
                            if (name == null) name = child.child("stopTh").getValue(String.class);
                            s.name = name == null ? "" : name;
                            String stopType = child.child("stopType").getValue(String.class);
                            s.terminal = "terminal".equals(stopType);
                            Double order = child.child("order").getValue(Double.class);
                            s.order = order == null ? 999999 : order;
                            erpMapStops.add(s);
                        }
                        java.util.Collections.sort(erpMapStops, (a, b) -> Double.compare(a.order, b.order));
                        erpMapStopsLoaded = true;
                        erpMapStopsSent = false;
                        pushStopsIfReady();
                    }
                    @Override public void onCancelled(DatabaseError error) {}
                });
    }

    // ===== เส้นทางจริงตามถนน จาก ERP (publishedSchedule/mapView/routes — geometryType: road_polyline) =====
    private final java.util.List<double[]> erpRoutePolyline = new java.util.ArrayList<>();
    private boolean erpRoutePolylineLoaded = false;
    private boolean erpRoutePolylineSent = false;

    private void loadPublishedRoutePolyline() {
        FirebaseDatabase.getInstance().getReference("publishedSchedule/mapView/routes")
                .addListenerForSingleValueEvent(new ValueEventListener() {
                    @Override public void onDataChange(DataSnapshot snap) {
                        erpRoutePolyline.clear();
                        for (DataSnapshot route : snap.getChildren()) {
                            String geometryType = route.child("geometryType").getValue(String.class);
                            if (!"road_polyline".equals(geometryType)) continue;
                            for (DataSnapshot pt : route.child("polyline").getChildren()) {
                                Double lat = pt.child("lat").getValue(Double.class);
                                Double lng = pt.child("lng").getValue(Double.class);
                                if (lat == null || lng == null) continue;
                                erpRoutePolyline.add(new double[]{lat, lng});
                            }
                            if (!erpRoutePolyline.isEmpty()) break; // ใช้เส้นทางแรกที่มี geometry จริง
                        }
                        erpRoutePolylineLoaded = true;
                        erpRoutePolylineSent = false;
                        pushRouteIfReady();
                    }
                    @Override public void onCancelled(DatabaseError error) {}
                });
    }

    private void pushStopsIfReady() {
        if (driverMapWebView == null || !driverMapReady || !erpMapStopsLoaded || erpMapStopsSent) return;
        JSONArray arr = new JSONArray();
        for (MapStop stop : erpMapStops) {
            try {
                JSONObject o = new JSONObject();
                o.put("lat", stop.lat);
                o.put("lng", stop.lng);
                o.put("name", stop.name);
                o.put("terminal", stop.terminal);
                arr.put(o);
            } catch (Exception ignored) {}
        }
        String escaped = arr.toString().replace("\\", "\\\\").replace("'", "\\'");
        driverMapWebView.evaluateJavascript("setStops('" + escaped + "');", null);
        erpMapStopsSent = true;
    }

    private void pushRouteIfReady() {
        if (driverMapWebView == null || !driverMapReady || !erpRoutePolylineLoaded
                || erpRoutePolylineSent || erpRoutePolyline.isEmpty()) return;
        JSONArray arr = new JSONArray();
        for (double[] pt : erpRoutePolyline) {
            JSONArray pair = new JSONArray();
            pair.put(pt[0]);
            pair.put(pt[1]);
            arr.put(pair);
        }
        driverMapWebView.evaluateJavascript("setRoutePolyline('" + arr.toString() + "');", null);
        erpRoutePolylineSent = true;
    }

    private LinearLayout buildMapStripStat(String label, TextView valueView) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams colLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        col.setLayoutParams(colLp);
        valueView.setText("—");
        valueView.setTextColor(COLOR_NAVY);
        valueView.setTextSize(16);
        valueView.setTypeface(Typeface.DEFAULT_BOLD);
        valueView.setGravity(Gravity.CENTER);
        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_TEXT_MUTED);
        labelView.setTextSize(11);
        labelView.setGravity(Gravity.CENTER);
        col.addView(valueView);
        col.addView(labelView);
        return col;
    }

    private String buildDriverMapHtml() {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'/>"
            + "<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1'/>"
            + "<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'/>"
            + "<style>html,body,#map{height:100%;margin:0;padding:0;}"
            + ".map-stop-dot{width:14px;height:14px;border-radius:50%;background:#00B8A9;"
            + "border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);}"
            + ".map-stop-dot.terminal{width:18px;height:18px;background:#0B1D3A;}"
            + ".map-user-dot{width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;"
            + "box-shadow:0 0 0 4px rgba(37,99,235,0.30);animation:userPulse 2s ease-in-out infinite;}"
            + "@keyframes userPulse{0%,100%{box-shadow:0 0 0 4px rgba(37,99,235,0.30)}"
            + "50%{box-shadow:0 0 0 9px rgba(37,99,235,0.10)}}"
            + ".locate-btn{position:absolute;right:12px;bottom:24px;width:44px;height:44px;border-radius:50%;"
            + "background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;"
            + "justify-content:center;z-index:1000;}"
            + ".locate-btn img{width:22px;height:22px;object-fit:contain;}"
            + ".locate-btn.active{background:#00B8A9;}"
            + "</style></head>"
            + "<body><div id='map'></div>"
            + "<div class='locate-btn' id='locateBtn'><img src='https://sl-transit.com/assets/icon-location.png'/></div>"
            + "<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script>"
            + "<script>"
            + "var map=L.map('map',{zoomControl:true}).setView([13.65,101.60],9);"
            + "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,"
            + "attribution:'&copy; OpenStreetMap'}).addTo(map);"
            + "var driverMarker=null,stopMarkers=[],routeLine=null,firstFix=true;"
            + "var lastLat=null,lastLng=null,followMode=false,animReq=null;"
            + "function animateMarkerTo(fromLat,fromLng,toLat,toLng){"
            + "if(animReq) cancelAnimationFrame(animReq);"
            + "var start=null,duration=900;"
            + "function step(ts){"
            + "if(!start) start=ts;"
            + "var p=Math.min((ts-start)/duration,1);"
            + "var lat=fromLat+(toLat-fromLat)*p;"
            + "var lng=fromLng+(toLng-fromLng)*p;"
            + "driverMarker.setLatLng([lat,lng]);"
            + "if(followMode) map.panTo([lat,lng],{animate:false});"
            + "if(p<1) animReq=requestAnimationFrame(step);"
            + "} animReq=requestAnimationFrame(step);}"
            + "function setDriverPosition(lat,lng){"
            + "if(!driverMarker){"
            + "var icon=L.divIcon({className:'',html:\"<div class='map-user-dot'></div>\",iconSize:[18,18],iconAnchor:[9,9]});"
            + "driverMarker=L.marker([lat,lng],{icon:icon,zIndexOffset:900}).addTo(map);"
            + "lastLat=lat;lastLng=lng;"
            + "}else if(lastLat!==lat||lastLng!==lng){"
            + "animateMarkerTo(lastLat,lastLng,lat,lng);"
            + "lastLat=lat;lastLng=lng;"
            + "}"
            + "if(firstFix){map.setView([lat,lng],12);firstFix=false;}"
            + "else if(followMode){map.panTo([lat,lng]);}}"
            + "function setStops(json){"
            + "var stops=JSON.parse(json);"
            + "stopMarkers.forEach(function(m){map.removeLayer(m);});stopMarkers=[];"
            + "stops.forEach(function(s){"
            + "var icon=L.divIcon({className:'',"
            + "html:\"<div class='map-stop-dot\"+(s.terminal?' terminal':'')+\"' title='\"+(s.name||'')+\"'></div>\","
            + "iconSize:[16,16],iconAnchor:[8,8]});"
            + "var m=L.marker([s.lat,s.lng],{icon:icon,title:s.name||''}).addTo(map);"
            + "if(s.name){m.bindPopup(s.name);}"
            + "stopMarkers.push(m);});}"
            + "function setRoutePolyline(json){"
            + "var pts=JSON.parse(json);"
            + "if(routeLine){map.removeLayer(routeLine);routeLine=null;}"
            + "if(pts.length>1){routeLine=L.polyline(pts,{color:'#00B8A9',weight:4,opacity:0.75}).addTo(map);}}"
            + "var locateBtn=document.getElementById('locateBtn');"
            + "locateBtn.addEventListener('click',function(){"
            + "followMode=!followMode;"
            + "locateBtn.classList.toggle('active',followMode);"
            + "if(followMode&&lastLat!==null){map.flyTo([lastLat,lastLng],15,{duration:0.8});}});"
            + "['dragstart','wheel','touchstart'].forEach(function(ev){"
            + "map.on(ev,function(){ if(followMode){followMode=false;locateBtn.classList.remove('active');} });"
            + "});"
            + "</script></body></html>";
    }

    // เรียกทุกวินาทีจาก uiTick (ถ้าหน้านี้กำลังแสดงอยู่) — ส่งเฉพาะตำแหน่งรถ (animate ฝั่ง JS เอง ไม่วาร์ป)
    // ป้ายจอด/เส้นทางถูกส่งครั้งเดียวตอนโหลดข้อมูลเสร็จ (pushStopsIfReady/pushRouteIfReady) — ไม่ส่งซ้ำทุก tick
    // เพื่อไม่ให้ marker สั่น/ขยับตอนผู้ใช้ซูมหรือลากแผนที่เอง
    private void updateLiveMap() {
        if (driverMapWebView == null || !driverMapReady) return;
        String coords = prefs.getString(KEY_LAST_COORDS, "");
        if (!coords.isEmpty() && coords.contains(",")) {
            try {
                String[] parts = coords.split(",");
                double lat = Double.parseDouble(parts[0].trim());
                double lng = Double.parseDouble(parts[1].trim());
                driverMapWebView.evaluateJavascript(
                        "setDriverPosition(" + lat + "," + lng + ");", null);
            } catch (Exception ignored) {}
        }
        pushStopsIfReady();
        pushRouteIfReady();
        if (mapBookedCount != null) mapBookedCount.setText(String.valueOf(prefs.getInt("today_total_pax", 0)));
        if (mapCheckedCount != null) mapCheckedCount.setText(String.valueOf(prefs.getInt("today_checked_in", 0)));
        if (mapEarningsValue != null) {
            mapEarningsValue.setText(formatBaht(prefs.getFloat(KEY_TODAY_CHECKEDIN_AMOUNT, 0f)));
        }
    }

    private String formatBaht(float amount) {
        return String.format(java.util.Locale.US, "%,.0f ฿", amount);
    }

    private void updateLiveMapIfVisible() {
        if (driverMapWebView == null || contentContainer == null) return;
        android.view.View mapPage = contentContainer.findViewWithTag("nav_page_แผนที่");
        if (mapPage != null && mapPage.getVisibility() == android.view.View.VISIBLE) {
            updateLiveMap();
        }
    }

    // =====================================================================
    // หน้า 2: รายงาน — รวม "วันนี้" + "สัปดาห์นี้" + "สถิติรวม" + "รายได้" ไว้หน้าเดียว (เดิมแยก 2 หน้าซ้ำข้อมูลกัน)
    // =====================================================================
    private ScrollView buildReportPage() {
        ScrollView sv = new ScrollView(this);
        sv.setTag("nav_page_รายงาน");
        sv.setBackgroundColor(COLOR_BG_PAGE);
        sv.setVisibility(android.view.View.GONE);
        sv.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(52), dp(16), dp(80));
        root.setTag("report_page_root");
        sv.addView(root);
        buildReportPageContent(root);
        loadAdvanceBookingsSummary();
        return sv;
    }

    private void buildReportPageContent(LinearLayout root) {
        root.removeAllViews();
        String vehicleId = authorizedRuntimeVehicleId();
        String todayLabel = new java.text.SimpleDateFormat("dd MMM yyyy", new java.util.Locale("th")).format(new java.util.Date());

        // === Header ===
        TextView header = new TextView(this);
        header.setText("รายงาน");
        header.setTextColor(COLOR_NAVY);
        header.setTextSize(20);
        header.setTypeface(Typeface.DEFAULT_BOLD);
        header.setPadding(0, 0, 0, dp(2));
        root.addView(header);
        TextView dateLabel = new TextView(this);
        dateLabel.setText(todayLabel + (vehicleId != null ? "  •  " + vehicleId : ""));
        dateLabel.setTextColor(COLOR_TEXT_MUTED);
        dateLabel.setTextSize(12);
        LinearLayout.LayoutParams dateLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dateLp.setMargins(0, 0, 0, dp(14));
        dateLabel.setLayoutParams(dateLp);
        root.addView(dateLabel);

        // === Hero earnings card (gradient, ตัวเลขใหญ่ แบบ Grab/Uber) ===
        int totalPax = prefs.getInt("today_total_pax", 0);
        int checkedIn = prefs.getInt("today_checked_in", 0);
        float bookedAmount = prefs.getFloat(KEY_TODAY_BOOKED_AMOUNT, 0f);
        float checkedInAmount = prefs.getFloat(KEY_TODAY_CHECKEDIN_AMOUNT, 0f);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(20), dp(20), dp(20), dp(20));
        GradientDrawable heroBg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[]{COLOR_NAVY, COLOR_TEAL});
        heroBg.setCornerRadius(dp(18));
        hero.setBackground(heroBg);
        hero.setElevation(dp(2));
        LinearLayout.LayoutParams heroLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        heroLp.setMargins(0, 0, 0, dp(14));
        hero.setLayoutParams(heroLp);

        TextView heroLabel = new TextView(this);
        heroLabel.setText("รายได้วันนี้");
        heroLabel.setTextColor(Color.argb(200, 255, 255, 255));
        heroLabel.setTextSize(13);
        hero.addView(heroLabel);

        TextView heroAmount = new TextView(this);
        heroAmount.setText(formatBaht(checkedInAmount));
        heroAmount.setTextColor(Color.WHITE);
        heroAmount.setTextSize(36);
        heroAmount.setTypeface(Typeface.DEFAULT_BOLD);
        heroAmount.setPadding(0, dp(2), 0, dp(2));
        hero.addView(heroAmount);

        TextView heroSub = new TextView(this);
        heroSub.setText("เช็คอินแล้ว " + checkedIn + " คน  •  จองทั้งหมด " + totalPax + " คน");
        heroSub.setTextColor(Color.argb(200, 255, 255, 255));
        heroSub.setTextSize(12);
        heroSub.setPadding(0, 0, 0, dp(14));
        hero.addView(heroSub);

        // divider
        android.view.View divider = new android.view.View(this);
        divider.setBackgroundColor(Color.argb(60, 255, 255, 255));
        hero.addView(divider, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));

        // แถวย่อย: จองทั้งหมด / เช็คอินจริง
        LinearLayout heroRow = new LinearLayout(this);
        heroRow.setOrientation(LinearLayout.HORIZONTAL);
        heroRow.setPadding(0, dp(14), 0, 0);
        heroRow.addView(buildHeroStat("จองทั้งหมด", totalPax + " คน", formatBaht(bookedAmount)));
        android.view.View vDivider = new android.view.View(this);
        vDivider.setBackgroundColor(Color.argb(60, 255, 255, 255));
        heroRow.addView(vDivider, new LinearLayout.LayoutParams(dp(1), dp(38)));
        heroRow.addView(buildHeroStat("เช็คอินจริง", checkedIn + " คน", formatBaht(checkedInAmount)));
        hero.addView(heroRow);
        root.addView(hero);

        // === Segmented tabs: วันนี้ / สัปดาห์นี้ / ทั้งหมด ===
        String[] tabLabels = {"วันนี้", "สัปดาห์นี้", "ทั้งหมด"};
        LinearLayout tabRow = new LinearLayout(this);
        tabRow.setOrientation(LinearLayout.HORIZONTAL);
        GradientDrawable tabRowBg = new GradientDrawable();
        tabRowBg.setColor(Color.WHITE);
        tabRowBg.setCornerRadius(dp(10));
        tabRow.setBackground(tabRowBg);
        tabRow.setPadding(dp(4), dp(4), dp(4), dp(4));
        LinearLayout.LayoutParams tabRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tabRowLp.setMargins(0, 0, 0, dp(14));
        tabRow.setLayoutParams(tabRowLp);
        reportTabButtons = new TextView[tabLabels.length];
        for (int i = 0; i < tabLabels.length; i++) {
            final int idx = i;
            TextView tab = new TextView(this);
            tab.setText(tabLabels[i]);
            tab.setTextSize(13);
            tab.setTypeface(Typeface.DEFAULT_BOLD);
            tab.setGravity(Gravity.CENTER);
            tab.setPadding(0, dp(9), 0, dp(9));
            tab.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            tab.setOnClickListener(v -> {
                reportSelectedPeriod = idx;
                applyReportTabStyles();
                buildReportDetailForPeriod(reportDetailContainer, idx);
            });
            reportTabButtons[i] = tab;
            tabRow.addView(tab);
        }
        root.addView(tabRow);
        applyReportTabStyles();

        // === Detail area (สลับตาม tab) ===
        reportDetailContainer = new LinearLayout(this);
        reportDetailContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(reportDetailContainer);
        buildReportDetailForPeriod(reportDetailContainer, reportSelectedPeriod);

        // === ปุ่ม refresh ===
        TextView refreshBtn = new TextView(this);
        refreshBtn.setText("🔄  รีเฟรชข้อมูล");
        refreshBtn.setTextColor(COLOR_TEAL);
        refreshBtn.setTextSize(13);
        refreshBtn.setTypeface(Typeface.DEFAULT_BOLD);
        refreshBtn.setGravity(Gravity.CENTER);
        refreshBtn.setPadding(0, dp(16), 0, dp(4));
        refreshBtn.setOnClickListener(v -> { refreshPassengerSummary(); loadAdvanceBookingsSummary(); buildReportPageContent(root); });
        root.addView(refreshBtn);

        // หมายเหตุ
        TextView note = new TextView(this);
        note.setText("* รายได้คำนวณจากราคาตั๋วของผู้โดยสารที่จอง/เช็คอินกับคันนี้เท่านั้น ไม่รวมค่าจ้างจากบริษัท");
        note.setTextColor(COLOR_TEXT_MUTED);
        note.setTextSize(11);
        root.addView(note);
    }

    private void applyReportTabStyles() {
        if (reportTabButtons == null) return;
        for (int i = 0; i < reportTabButtons.length; i++) {
            TextView tab = reportTabButtons[i];
            GradientDrawable bg = new GradientDrawable();
            bg.setCornerRadius(dp(8));
            boolean selected = (i == reportSelectedPeriod);
            bg.setColor(selected ? COLOR_TEAL : Color.WHITE);
            tab.setBackground(bg);
            tab.setTextColor(selected ? Color.WHITE : COLOR_TEXT_MUTED);
        }
    }

    private void buildReportDetailForPeriod(LinearLayout container, int period) {
        if (container == null) return;
        container.removeAllViews();
        if (period == 0) {
            container.addView(buildSectionCard("⏱  สรุปกะวันนี้", new String[][]{
                {"เวลาเริ่มงาน",  prefs.getString("today_start_time", "--:--")},
                {"เวลาสิ้นสุด",   prefs.getString("today_end_time",   "--:--")},
                {"ชั่วโมงทำงาน", prefs.getString("today_active_hrs", "0") + " ชม."},
            }));
            container.addView(buildSectionCard("🗺  เส้นทางวันนี้", new String[][]{
                {"เส้นทาง",   "สนามชัยเขต → ฉะเชิงเทรา"},
                {"คิวที่วิ่ง", prefs.getString(KEY_TODAY_QUEUE, "—")},
                {"เที่ยวทั้งหมด", prefs.getString("today_trips", "—") + " เที่ยว"},
            }));
        } else if (period == 1) {
            container.addView(buildSectionCard("📅  สัปดาห์นี้", new String[][]{
                {"วันทำงาน",   prefs.getString("stat_week_days", "0") + " วัน"},
                {"เที่ยววิ่ง",  prefs.getString("stat_week_trips", "0") + " เที่ยว"},
                {"ผู้โดยสาร",  prefs.getString("stat_week_pax", "0") + " คน"},
            }));
        } else {
            container.addView(buildSectionCard("📈  สถิติรวมทั้งหมด", new String[][]{
                {"วันที่ทำงาน",   prefs.getString("stat_total_days", "0") + " วัน"},
                {"เที่ยวรวม",     prefs.getString("stat_total_trips", "0") + " เที่ยว"},
                {"ผู้โดยสารรวม",  prefs.getString("stat_total_pax", "0") + " คน"},
                {"ชั่วโมงรวม",    prefs.getString("stat_total_hrs", "0") + " ชม."},
            }));
            container.addView(buildSectionCard("🗓  ข้อมูลการจองตั๋วล่วงหน้า", advanceBookingRowsForCard()));
        }
    }

    // ===== ข้อมูลการจองตั๋วล่วงหน้า (7 วันข้างหน้า) =====
    private final java.util.List<String[]> advanceBookingRows = new java.util.ArrayList<>();
    private boolean advanceBookingsLoading = false;

    private String[][] advanceBookingRowsForCard() {
        if (advanceBookingRows.isEmpty()) {
            return new String[][]{{"สถานะ", advanceBookingsLoading ? "กำลังโหลด…" : "ยังไม่มีการจองล่วงหน้า"}};
        }
        return advanceBookingRows.toArray(new String[0][]);
    }

    private void loadAdvanceBookingsSummary() {
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null || advanceBookingsLoading) return;
        advanceBookingsLoading = true;
        final int days = 7;
        java.text.SimpleDateFormat keyFmt = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
        java.text.SimpleDateFormat labelFmt = new java.text.SimpleDateFormat("d MMM", new java.util.Locale("th"));
        java.util.Calendar cal = java.util.Calendar.getInstance();
        final String[] dateKeys = new String[days];
        final String[] dateLabels = new String[days];
        for (int i = 0; i < days; i++) {
            cal.add(java.util.Calendar.DATE, 1);
            dateKeys[i] = keyFmt.format(cal.getTime());
            dateLabels[i] = labelFmt.format(cal.getTime()) + (i == 0 ? " (พรุ่งนี้)" : "");
        }
        final int[] counts = new int[days];
        final double[] amounts = new double[days];
        final int[] pending = {days};
        for (int i = 0; i < days; i++) {
            final int idx = i;
            FirebaseDatabase.getInstance()
                    .getReference("operations/driverTicketsByServiceDate/" + dateKeys[idx] + "/" + vehicleId)
                    .addListenerForSingleValueEvent(new ValueEventListener() {
                        @Override public void onDataChange(DataSnapshot snap) {
                            int c = 0;
                            double amt = 0;
                            for (DataSnapshot child : snap.getChildren()) {
                                String status = String.valueOf(child.child("status").getValue());
                                if ("cancelled".equals(status)) continue;
                                c++;
                                amt += ticketFareAmount(child);
                            }
                            counts[idx] = c;
                            amounts[idx] = amt;
                            onAdvanceDayDone();
                        }
                        @Override public void onCancelled(DatabaseError error) { onAdvanceDayDone(); }
                        private void onAdvanceDayDone() {
                            pending[0]--;
                            if (pending[0] == 0) {
                                advanceBookingRows.clear();
                                for (int j = 0; j < days; j++) {
                                    if (counts[j] <= 0) continue;
                                    advanceBookingRows.add(new String[]{dateLabels[j], counts[j] + " คน / " + formatBaht((float) amounts[j])});
                                }
                                advanceBookingsLoading = false;
                                if (reportSelectedPeriod == 2 && reportDetailContainer != null) {
                                    buildReportDetailForPeriod(reportDetailContainer, 2);
                                }
                            }
                        }
                    });
        }
    }


    private LinearLayout buildHeroStat(String label, String mainValue, String subValue) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(14), 0, dp(14), 0);
        col.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextColor(Color.argb(190, 255, 255, 255));
        l.setTextSize(11);
        col.addView(l);
        TextView v1 = new TextView(this);
        v1.setText(mainValue);
        v1.setTextColor(Color.WHITE);
        v1.setTextSize(15);
        v1.setTypeface(Typeface.DEFAULT_BOLD);
        col.addView(v1);
        TextView v2 = new TextView(this);
        v2.setText(subValue);
        v2.setTextColor(Color.argb(200, 255, 255, 255));
        v2.setTextSize(12);
        col.addView(v2);
        return col;
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

        // === Profile hero card (gradient, สไตล์ Grab/Uber driver profile) ===
        LinearLayout profileCard = new LinearLayout(this);
        profileCard.setOrientation(LinearLayout.VERTICAL);
        profileCard.setPadding(dp(18), dp(20), dp(18), dp(18));
        GradientDrawable profileBg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[]{COLOR_NAVY, COLOR_OCEAN});
        profileBg.setCornerRadius(dp(18));
        profileCard.setBackground(profileBg);
        profileCard.setElevation(dp(2));
        LinearLayout.LayoutParams pcLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pcLp.setMargins(0, 0, 0, dp(14));
        profileCard.setLayoutParams(pcLp);

        LinearLayout identityRow = new LinearLayout(this);
        identityRow.setOrientation(LinearLayout.HORIZONTAL);
        identityRow.setGravity(Gravity.CENTER_VERTICAL);

        // Avatar วงกลม
        FrameLayout avatar = new FrameLayout(this);
        GradientDrawable avBg = new GradientDrawable();
        avBg.setShape(GradientDrawable.OVAL);
        avBg.setColor(COLOR_TEAL);
        avatar.setBackground(avBg);
        LinearLayout.LayoutParams avLp = new LinearLayout.LayoutParams(dp(60), dp(60));
        avLp.setMargins(0, 0, dp(14), 0);
        avatar.setLayoutParams(avLp);
        TextView avIcon = new TextView(this);
        avIcon.setText("👤");
        avIcon.setTextSize(26);
        avIcon.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams avIconLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        avIconLp.gravity = Gravity.CENTER;
        avatar.addView(avIcon, avIconLp);
        identityRow.addView(avatar);

        LinearLayout profileInfo = new LinearLayout(this);
        profileInfo.setOrientation(LinearLayout.VERTICAL);
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) vehicleId = "ยังไม่ได้เข้าสู่ระบบ";
        String erpVehicleId = prefs.getString(KEY_ERP_VEHICLE_ID, "ยังไม่ได้กำหนด");
        TextView driverName = new TextView(this);
        driverName.setText("คนขับรถ  " + vehicleId);
        driverName.setTextColor(Color.WHITE);
        driverName.setTextSize(17);
        driverName.setTypeface(Typeface.DEFAULT_BOLD);
        profileInfo.addView(driverName);
        TextView driverSub = new TextView(this);
        driverSub.setText("สนามชัยเดินรถ จำกัด  •  สาย 373");
        driverSub.setTextColor(Color.argb(190, 255, 255, 255));
        driverSub.setTextSize(12);
        driverSub.setPadding(0, dp(3), 0, 0);
        profileInfo.addView(driverSub);
        identityRow.addView(profileInfo);
        profileCard.addView(identityRow);

        // divider
        android.view.View pDivider = new android.view.View(this);
        pDivider.setBackgroundColor(Color.argb(50, 255, 255, 255));
        LinearLayout.LayoutParams pDividerLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        pDividerLp.setMargins(0, dp(16), 0, dp(12));
        profileCard.addView(pDivider, pDividerLp);

        // สถิติย่อ (เที่ยวรวม / ผู้โดยสารสะสม / เวอร์ชันแอพ) — แถวสไตล์โปรไฟล์ Grab
        LinearLayout statsRow = new LinearLayout(this);
        statsRow.setOrientation(LinearLayout.HORIZONTAL);
        statsRow.addView(buildHeroStat("เที่ยวรวม", prefs.getString("stat_total_trips", "0"), "เที่ยว"));
        statsRow.addView(buildHeroStat("ผู้โดยสารสะสม", prefs.getString("stat_total_pax", "0"), "คน"));
        statsRow.addView(buildHeroStat("เวอร์ชันแอพ", "v" + BuildConfig.VERSION_NAME, ""));
        profileCard.addView(statsRow);
        root.addView(profileCard);

        // ข้อมูลรถ
        root.addView(buildSectionCard("🚌  ข้อมูลรถที่ใช้", new String[][]{
            {"ทะเบียนที่ใช้งาน (Runtime)", vehicleId},
            {"ทะเบียนตามระบบ ERP",         erpVehicleId},
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

        // ปุ่ม: รายละเอียดรถ / ออกจากระบบ
        TextView changeVehicleBtn = new TextView(this);
        changeVehicleBtn.setText("รายละเอียดรถที่ได้รับมอบหมาย");
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

        TextView signOutBtn = new TextView(this);
        signOutBtn.setText("ออกจากระบบ");
        signOutBtn.setTextColor(Color.WHITE);
        signOutBtn.setTextSize(14);
        signOutBtn.setTypeface(Typeface.DEFAULT_BOLD);
        signOutBtn.setGravity(Gravity.CENTER);
        signOutBtn.setPadding(dp(20), dp(14), dp(20), dp(14));
        GradientDrawable signOutBg = new GradientDrawable();
        signOutBg.setColor(COLOR_RED);
        signOutBg.setCornerRadius(dp(12));
        signOutBtn.setBackground(signOutBg);
        LinearLayout.LayoutParams signOutLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        signOutLp.setMargins(0, dp(8), 0, dp(8));
        signOutBtn.setLayoutParams(signOutLp);
        signOutBtn.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("ออกจากระบบ")
                .setMessage("หยุดส่ง GPS และออกจากระบบบัญชีคนขับนี้หรือไม่?")
                .setPositiveButton("ออกจากระบบ", (d, w) -> signOutDriver())
                .setNegativeButton("ยกเลิก", null)
                .show());
        root.addView(signOutBtn);
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
            navTabLabels[i].setTextColor(color);
            navTabLabels[i].setTypeface(active ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            // PNG icon alpha
            if (navIconImgs[i] != null) {
                navIconImgs[i].setAlpha(active ? 1.0f : 0.45f);
                GradientDrawable dot = new GradientDrawable();
                dot.setShape(GradientDrawable.RECTANGLE);
                dot.setCornerRadius(dp(2));
                dot.setColor(active ? COLOR_TEAL : Color.TRANSPARENT);
                dot.setSize(dp(20), dp(3));
                navIconImgs[i].setBackground(active ? dot : null);
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
        String runtimeVehicleId = authorizedRuntimeVehicleId();
        String erpVehicleId = prefs.getString(KEY_ERP_VEHICLE_ID, "");
        new AlertDialog.Builder(this)
                .setTitle("Vehicle assigned by central system")
                .setMessage("ERP vehicle: " + erpVehicleId
                        + "\nRuntime vehicle: " + runtimeVehicleId
                        + "\n\nTo change vehicles, update Driver Identity Center or sign out and use another approved account.")
                .setPositiveButton("OK", null)
                .show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int getResIdByName(String name) {
        return getResources().getIdentifier(name, "drawable", getPackageName());
    }

    private void requestPermissionsThenStart() {
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before starting GPS.");
            return;
        }
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
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before starting GPS.");
            return;
        }
        if (prefs.getBoolean(KEY_ENABLED, false)) stopGpsService();
        else requestPermissionsThenStart();
    }

    private void startGpsService() {
        if (!hasAuthenticatedDriverIdentity()) {
            requireActiveDriverOrReturnToLogin("Please sign in before starting GPS.");
            return;
        }
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

        // ===== Auto log GPS lost/recovered =====
        checkAutoGpsLostRecovered(gpsAgoSec);

        // แจ้งเตือนถ้ามีปัญหา — แสดงผลในหน้าจอ + บันทึกขึ้น Firebase เท่านั้น (ไม่ขึ้นกระดิ่ง)
        StringBuilder errSb = new StringBuilder();
        if (gpsAgoSec > 90) {
            String gpsCause;
            if (restartCount >= 3) gpsCause = "GPS หาย + Service ถูก kill " + restartCount + " ครั้ง — OS บังคับหยุด GpsService (Battery Optimization)";
            else if (restartCount > 0) gpsCause = "GPS หาย " + gpsAgoSec + "s + Service restart " + restartCount + " ครั้ง — อาจถูก kill แล้วยังไม่ได้ GPS fix ใหม่";
            else gpsCause = "GPS หาย " + gpsAgoSec + "s — FusedLocationProvider หยุดส่ง callback (Service ยังอยู่ ไม่ถูก kill)";
            errSb.append("⚠ ").append(gpsCause).append("\n");
        }
        if (fbAgoSec > 90) {
            String fbCause = fbAgoSec > 300
                ? "Firebase ขาด " + fbAgoSec + "s — WebSocket หลุดนาน อาจ goOffline ค้างหรือ Auth expire"
                : "Firebase ช้า " + fbAgoSec + "s — เน็ตอ่อนหรือ reconnect ยังไม่เสร็จ";
            errSb.append("⚠ ").append(fbCause).append("\n");
        }
        if (restartCount >= 3) errSb.append("⚠ Service ถูก kill " + restartCount + " ครั้ง — ตรวจสอบ Battery Optimization และ Background Process Limit\n");
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
                String vehicleId = authorizedRuntimeVehicleId();
                if (vehicleId == null) return;
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
            String vehicleId = authorizedRuntimeVehicleId();
            if (vehicleId == null) return;
            DatabaseReference logRef = FirebaseDatabase.getInstance()
                    .getReference("driverLogs/" + vehicleId).push();
            Map<String, Object> data = new HashMap<>();
            data.put("message", message.replace("⚠ ", "").replace("\n", " | "));
            data.put("timestamp", now);
            data.put("device", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")");
            data.put("appVersion", BuildConfig.VERSION_NAME);
            data.put("gpsAgoSec", gpsAgoSec);
            data.put("fbAgoSec", fbAgoSec);
            int rc = prefs.getInt(KEY_RESTART_COUNT, 0);
            data.put("restartCount", rc);
            // level: error = GPS หายนาน / Firebase ขาดนาน / kill บ่อย, warn = ปัญหาเล็กน้อย
            boolean isError = gpsAgoSec > 90 || fbAgoSec > 300 || rc >= 3;
            data.put("level", isError ? "error" : "warn");
            // extra: สรุปสถานะ technical สำหรับ admin วิเคราะห์
            Map<String, Object> extra = new HashMap<>();
            extra.put("gpsAgoSec", gpsAgoSec);
            extra.put("fbAgoSec", fbAgoSec);
            extra.put("restartCount", rc);
            extra.put("lastRestartAt", prefs.getLong(KEY_LAST_RESTART, 0));
            extra.put("trackingEnabled", prefs.getBoolean(KEY_ENABLED, false));
            extra.put("lastError", prefs.getString(KEY_LAST_ERROR, ""));
            extra.put("lastStatus", prefs.getString(KEY_LAST_STATUS, ""));
            extra.put("coords", prefs.getString(KEY_LAST_COORDS, ""));
            // ===== 4 ข้อที่ต้องการเพื่อหาสาเหตุ GPS หาย =====
            // 1. WakeLock ยังถือไว้ไหม — ถ้า false = CPU หลับ FLP หยุดทำงานทันที
            extra.put("wakelockHeld", prefs.getBoolean(KEY_WAKELOCK_HELD, false));
            // 2. callback ยังลงทะเบียนอยู่ไหม — ถ้า false = request ถูก cancel ไปเงียบๆ
            extra.put("callbackRegistered", prefs.getBoolean(KEY_CALLBACK_REGISTERED, false));
            // 3. callback มาแต่ถูก filter ทิ้งกี่ครั้ง — ถ้า > 0 = chip ยังส่งแต่ accuracy เลว, ถ้า 0 = callback ไม่มาเลย
            extra.put("locationFilteredCount", prefs.getInt(KEY_LOCATION_FILTER_COUNT, 0));
            // 4. request ล่าสุด throw exception ไหม — ถ้ามีข้อความ = FLP ปฏิเสธ request
            extra.put("lastRequestError", prefs.getString(KEY_LAST_REQUEST_ERROR, ""));
            if (Build.VERSION.SDK_INT >= 23) {
                android.os.PowerManager pm2 = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                extra.put("batteryUnrestricted", pm2 != null && pm2.isIgnoringBatteryOptimizations(getPackageName()));
            }
            data.put("extra", extra);

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
        String vehicleId = authorizedRuntimeVehicleId();
        if (vehicleId == null) {
            requireActiveDriverOrReturnToLogin("Please sign in before opening the driver app.");
            return;
        }
        vehiclePickerText.setText(vehicleId + "\n▾");
        updateLiveMapIfVisible();

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

package com.sanamchai.drivergps;

import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

// รับ FCM data message เพื่อ "ปลุก" แอพกรณีที่ Android ฆ่าโปรเซสทิ้งไปเลยจริงๆ —
// ต่างจากกลไก driverCommands (Firebase Realtime Database listener ใน MainActivity)
// ซึ่งใช้งานได้เฉพาะตอนที่แอพยังมีบางส่วนค้างอยู่ในหน่วยความจำเท่านั้น FCM เป็นกลไกระดับ OS
// ที่ Android ให้สิทธิ์พิเศษปลุกแอพที่ถูกฆ่าได้ (ไม่การันตี 100% ถ้าเจอเครื่องที่บล็อกหนักมาก
// แต่ดีกว่ากลไกเดิมที่ทำอะไรไม่ได้เลยถ้าโปรเซสตายสนิท)
public class DriverFcmService extends FirebaseMessagingService {
    private static final String TAG = "DriverFcmService";

    @Override public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        registerTokenForCurrentVehicle(token);
    }

    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);
        String type = message.getData() != null ? message.getData().get("type") : null;
        if (!"wake_gps".equals(type)) return;
        Log.d(TAG, "ได้รับ FCM wake_gps — สั่งเริ่ม GpsService");

        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean(MainActivity.KEY_ENABLED, false)) return;

        android.content.Intent service = new android.content.Intent(this, GpsService.class);
        service.setAction(GpsService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(service);
        } else {
            startService(service);
        }
        GpsService.scheduleHealthCheck(this);
    }

    // เรียกทั้งตอน token ใหม่ (onNewToken) และตอนแอพเข้าสู่โหมดทำงานปกติ (มี vehicleId แล้ว)
    // เพื่อให้แน่ใจว่า token ล่าสุดผูกกับรถคันที่ถูกต้องเสมอ ไม่ใช่รถคันเก่าที่คนขับเคยขับ
    static void registerTokenForCurrentVehicle(String token) {
        if (token == null || token.isEmpty()) return;
        try {
            com.google.firebase.auth.FirebaseAuth auth = com.google.firebase.auth.FirebaseAuth.getInstance();
            if (auth.getCurrentUser() == null) return;
            String uid = auth.getCurrentUser().getUid();
            FirebaseDatabase.getInstance()
                    .getReference("data/driverIdentityCenter/accounts").child(uid).child("runtimeVehicleId")
                    .get()
                    .addOnSuccessListener(snap -> {
                        String vehicleId = snap.getValue(String.class);
                        if (vehicleId == null || vehicleId.isEmpty()) return;
                        FirebaseDatabase.getInstance()
                                .getReference("fcmTokensByVehicle").child(vehicleId)
                                .setValue(token);
                    });
        } catch (Exception ignored) {}
    }
}

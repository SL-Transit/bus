package com.sanamchai.drivergps;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

// รับเฉพาะสัญญาณ "restart ตัวเอง" ที่แอพส่งให้ตัวเองผ่าน AlarmManager เท่านั้น
// แยกออกมาจาก BootReceiver เพราะ BootReceiver ต้องเปิด exported=true ไว้เสมอ
// (เพื่อรับ BOOT_COMPLETED จากระบบ) ทำให้แอพอื่นในเครื่องสามารถส่ง broadcast
// ปลอมมาสั่ง restart service ได้ถ้าใช้ action เดียวกันแบบไม่มีการป้องกันสิทธิ์เลย
// ตัว receiver นี้ผูกกับ signature-level permission ที่แอพอื่นขอไม่ได้
// (ต้อง sign ด้วย key เดียวกับแอพนี้เท่านั้นถึงจะส่งมาได้)
public class RestartReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        if (!GpsService.ACTION_RESTART.equals(action)) return;

        SharedPreferences prefs = context.getSharedPreferences(
                MainActivity.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(MainActivity.KEY_ENABLED, false)) return;

        Intent service = new Intent(context, GpsService.class);
        service.setAction(GpsService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(service);
        } else {
            context.startService(service);
        }
        GpsService.scheduleHealthCheck(context);
    }
}

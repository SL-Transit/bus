package com.sanamchai.drivergps;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();

        boolean isBoot = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.coloros.action.startservice".equals(action);

        boolean isRestart = GpsService.ACTION_RESTART.equals(action);

        if (!isBoot && !isRestart) return;

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
    }
}

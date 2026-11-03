package com.geesh.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Exact Alarm Wakeup Receiver:
 * Triggered by AlarmManager even in deep Android Doze mode when screen is locked.
 * Forwards the inactivity balance-check trigger directly to GeeshForegroundService.
 */
class GeeshAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("GeeshAlarmReceiver", "Inactivity exact alarm fired! Forwarding to GeeshForegroundService")
        val serviceIntent = Intent(context, GeeshForegroundService::class.java).apply {
            action = GeeshForegroundService.ACTION_CHECK_INACTIVITY
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e("GeeshAlarmReceiver", "Failed to start service from alarm: ${e.message}", e)
        }
    }
}

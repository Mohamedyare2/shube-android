package com.shube.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.shube.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class GatewayForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    
    companion object {
        const val ACTION_PROCESS_SMS = "com.shube.app.action.PROCESS_SMS"
        const val ACTION_START_GATEWAY = "com.shube.app.action.START_GATEWAY"
        const val ACTION_STOP_GATEWAY = "com.shube.app.action.STOP_GATEWAY"
        
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "shube_gateway_channel"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        
        when (action) {
            ACTION_START_GATEWAY -> {
                startForeground(NOTIFICATION_ID, createNotification("Gateway Active", "Listening for payments..."))
                Log.d("GatewayService", "Gateway started")
            }
            ACTION_STOP_GATEWAY -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                Log.d("GatewayService", "Gateway stopped")
            }
            ACTION_PROCESS_SMS -> {
                // Ensure we are in foreground
                startForeground(NOTIFICATION_ID, createNotification("Processing Payment", "Matching customer..."))
                
                val smsHash = intent.getStringExtra("sms_hash") ?: return START_STICKY
                val sender = intent.getStringExtra("sender") ?: ""
                val amount = intent.getDoubleExtra("amount", 0.0)
                
                scope.launch {
                    processTransactionAsync(smsHash, sender, amount)
                }
            }
        }
        
        return START_STICKY
    }
    
    private suspend fun processTransactionAsync(hash: String, sender: String, amount: Double) {
        Log.d("GatewayService", "Processing transaction: $hash")
        
        // 1. Look up customer in local Room DB (synced from Supabase)
        // 2. Look up bundle rule for amount
        // 3. Start USSD State Machine
        
        // Update notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification("Starting USSD", "Recharging $sender..."))
        
        // The actual USSD execution would delegate to TelephonyManager.sendUssdRequest
        // and/or UssdAccessibilityService
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // Not a bound service
    }
    
    private fun createNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "SHUBE Gateway Service",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Keeps the SMS listener and USSD processor active in the background"
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }
}

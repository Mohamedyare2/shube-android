package com.shube.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.shube.app.local.DevicePreferences
import com.shube.app.local.PinManager
import com.shube.app.supabase.SupabaseRepository
import com.shube.app.supabase.TransactionInsert
import com.shube.app.ussd.SomaliUssdResponseAnalyzer
import com.shube.app.ussd.UssdResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

class GatewayForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    
    // Mutex to ensure USSD transactions are processed sequentially (FIFO queue)
    private val ussdMutex = Mutex()

    companion object {
        const val ACTION_PROCESS_SMS  = "com.shube.app.action.PROCESS_SMS"
        const val ACTION_START_GATEWAY = "com.shube.app.action.START_GATEWAY"
        const val ACTION_STOP_GATEWAY  = "com.shube.app.action.STOP_GATEWAY"

        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "shube_gateway_channel"
        private const val USSD_DIALOG_TIMEOUT_MS = 45_000L
    }

    private var heartbeatJob: kotlinx.coroutines.Job? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else {
            0
        }

        when (intent?.action) {
            ACTION_START_GATEWAY -> {
                if (type != 0) startForeground(NOTIFICATION_ID, createNotification("Gateway Active", "Listening for payments..."), type)
                else startForeground(NOTIFICATION_ID, createNotification("Gateway Active", "Listening for payments..."))
                Log.d("GatewayService", "Gateway started")
                startHeartbeatLoop()
            }
            ACTION_STOP_GATEWAY -> {
                heartbeatJob?.cancel()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                Log.d("GatewayService", "Gateway stopped")
            }
            ACTION_PROCESS_SMS -> {
                if (type != 0) startForeground(NOTIFICATION_ID, createNotification("Processing Payment", "Matching customer..."), type)
                else startForeground(NOTIFICATION_ID, createNotification("Processing Payment", "Matching customer..."))

                if (heartbeatJob == null || heartbeatJob?.isActive != true) {
                    startHeartbeatLoop()
                }

                val smsHash  = intent.getStringExtra("sms_hash")   ?: return START_STICKY
                val sender   = intent.getStringExtra("sender")      ?: ""
                val amount   = intent.getDoubleExtra("amount", 0.0)
                val txId     = intent.getStringExtra("tx_id")       ?: ""
                val body     = intent.getStringExtra("body")        ?: ""
                val testMode = intent.getBooleanExtra("test_mode", false)

                scope.launch {
                    ussdMutex.withLock {
                        processTransactionAsync(smsHash, sender, amount, txId, body, testMode)
                    }
                }
            }
        }
        return START_STICKY
    }

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            val api = com.shube.app.network.ApiService.getInstance(this@GatewayForegroundService)
            val prefs = DevicePreferences.getInstance(this@GatewayForegroundService)
            while (isActive) {
                prefs.deviceId?.let { id ->
                    val hb = api.sendHeartbeat(id)
                    if (hb.isDisabled) {
                        Log.w("GatewayService", "Device or Operator is DISABLED by admin. Stopping service.")
                        notify("Gateway Disabled", "Qalabka ama Account-ka waa la hakiyay (Disabled).")
                        stopSelf()
                        return@launch
                    }
                }
                delay(60_000) // 1 minute
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CORE GATEWAY PIPELINE
    // ─────────────────────────────────────────────────────────────

    private suspend fun processTransactionAsync(
        hash: String,
        sender: String,
        amount: Double,
        externalTxId: String,
        smsBody: String,
        testMode: Boolean = false
    ) {
        val prefs = DevicePreferences.getInstance(this)
        val deviceId   = prefs.deviceId ?: run {
            Log.e("GatewayService", "No device ID — aborting")
            return
        }
        val operatorId = prefs.operatorId ?: run {
            Log.e("GatewayService", "No operator ID - aborting")
            return
        }
        val profileId  = prefs.profileId ?: operatorId

        Log.d("GatewayService", "Processing: amount=$amount SLS, sender=$sender")

        // ── Acquire WakeLock so CPU and screen stay awake during USSD/transaction ──────
        val powerManager = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wakeLock = powerManager?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or 
            android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or 
            android.os.PowerManager.ON_AFTER_RELEASE, 
            "Shube::TransactionProcessing"
        )
        wakeLock?.acquire(180_000L) // 3 mins safety timeout

        try {
            // ── Step 0: Check if device or operator is disabled ──────
            val isDeviceActive = SupabaseRepository.isDeviceActive(deviceId)
            if (!isDeviceActive) {
                Log.w("GatewayService", "Device or Operator is DISABLED/REVOKED. Ignoring transaction.")
                notify("Gateway Paused", "Qalabka ama Account-ka waa la hakiyay (Disabled).")
                return
            }

            // ── Step 1: Check if sender is a registered customer ─────
            notify("Looking Up Customer", "Checking if $sender is registered...")
            val customer = SupabaseRepository.getCustomerBySender(sender)
            val somtelNumber = customer?.somtelNumber
            if (somtelNumber == null) {
                Log.w("GatewayService", "Unregistered sender $sender. Ignoring SMS.")
                return // Completely ignore, no transaction created
            }

            // ── Step 2: Find bundle rule matching the amount ─────────
            notify("Matching Bundle", "Looking up $amount SLS bundle rule...")
            val bundle = SupabaseRepository.getBundleByAmount(amount, profileId)
            if (bundle == null) {
                Log.w("GatewayService", "Amount $amount SLS does not match any bundle rule. Assuming it's a normal transfer. Ignoring.")
                return
            }
            Log.d("GatewayService", "Bundle matched: ${bundle.bundleName}")

            // ── Step 3: Create transaction row (status = processing) ─
            notify("Starting USSD", "Dialing ${bundle.ussdCode.take(8)}...")
            val transactionId = SupabaseRepository.createTransaction(
                TransactionInsert(
                    operatorId   = operatorId,
                    deviceId     = deviceId,
                    telesomNumber = sender,
                    somtelNumber = somtelNumber,
                    amountSls    = amount,
                    bundleRuleId = bundle.id,
                    smsHash      = hash,
                    smsBody      = smsBody,
                    testMode     = testMode,
                    status       = "processing"
                )
            )

            if (transactionId == null) {
                Log.e("GatewayService", "Failed to create transaction row — aborting USSD to avoid double-charging")
                return
            }

            // ── Step 4: Prepare USSD code and sequential replies ─────
            val pin = PinManager.getInstance(this).getPin() ?: "00000"
            val codeToDial = bundle.ussdCode
                .replace("{bundle_option}", bundle.ussdOption)
                .replace("{somtel_number}", somtelNumber)
                .replace("{pin}", pin)

            val replies = bundle.ussdReplies.map { reply ->
                reply
                    .replace("{bundle_option}", bundle.ussdOption)
                    .replace("{somtel_number}", somtelNumber)
                    .replace("{numberka}", somtelNumber)
                    .replace("{number}", somtelNumber)
                    .replace("{pin}", pin)
            }

            Log.d("GatewayService", "Executing USSD: $codeToDial with replies: $replies for transaction $transactionId")
            notify("Starting USSD", "Dialing ${codeToDial.take(15)}...")

            // ── Step 5: Execute USSD Session ──────────────────────────
            // Start active session in Accessibility service with expected replies
            UssdAccessibilityService.startSession(replies)

            // Dial the USSD code
            val dialed = dialUssd(codeToDial)
            if (!dialed) {
                UssdAccessibilityService.stopSession()
                SupabaseRepository.updateTransactionStatus(
                    transactionId = transactionId,
                    status = "failed",
                    notes = "CALL_PHONE permission not granted or call failed",
                    resultText = null,
                    completedAt = java.time.Instant.now().toString()
                )
                notify("❌ Bundle Failed", "Call permission not granted")
                return
            }

            // Wait for final response dialog (up to 45 seconds)
            val event = withTimeoutOrNull(USSD_DIALOG_TIMEOUT_MS) {
                UssdAccessibilityService.ussdDialogFlow.first()
            }

            // Always stop session so accessibility service returns to dormant state
            UssdAccessibilityService.stopSession()

            val rawResponseText = event?.text
            Log.d("GatewayService", "USSD Raw Response: '$rawResponseText' for transaction $transactionId")

            // ── Step 6: Analyze response and update transaction status ─
            val analysis = SomaliUssdResponseAnalyzer.analyze(rawResponseText)
            val (status, failureReason) = when (analysis.status) {
                UssdResult.SUCCESS              -> Pair("success", null)
                UssdResult.FAILED               -> Pair("failed", analysis.diagnosticReason)
                UssdResult.UNKNOWN              -> {
                    if (rawResponseText == null) Pair("failed", "Timeout: no USSD response dialog received within 45s")
                    else Pair("unknown_result", analysis.diagnosticReason)
                }
                UssdResult.INTERACTION_REQUIRED -> Pair("ussd_interaction_required", analysis.diagnosticReason)
            }

            SupabaseRepository.updateTransactionStatus(
                transactionId = transactionId,
                status = status,
                notes = failureReason,
                resultText = rawResponseText,
                completedAt = java.time.Instant.now().toString()
            )

            // Update notification with final status
            val icon = if (status == "success") "✅" else "❌"
            notify("$icon Bundle ${if (status == "success") "Sent" else "Failed"}", "${bundle.bundleName} for $sender — $status")

            // Return to standby after 3 seconds
            delay(3_000)
            notify("Gateway Active", "Listening for payments...")

        } finally {
            if (wakeLock?.isHeld == true) {
                try { wakeLock.release() } catch (_: Exception) {}
            }
        }
    }

    private fun dialUssd(code: String): Boolean {
        return try {
            if (checkSelfPermission(android.Manifest.permission.CALL_PHONE) !=
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Log.e("GatewayService", "CALL_PHONE permission not granted!")
                return false
            }
            val encoded = Uri.encode(code)
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$encoded")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Log.d("GatewayService", "Dialed USSD via ACTION_CALL: $code")
            true
        } catch (e: Exception) {
            Log.e("GatewayService", "Exception in dialUssd", e)
            false
        }
    }

    private fun notify(title: String, text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, createNotification(title, text))
    }

    override fun onDestroy() { super.onDestroy(); job.cancel() }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "SHUBE Gateway Service",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Keeps the SMS listener and USSD processor active in the background"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }
}

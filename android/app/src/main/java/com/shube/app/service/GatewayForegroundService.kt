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
import com.shube.app.local.DevicePreferences
import com.shube.app.supabase.SupabaseRepository
import com.shube.app.supabase.TransactionInsert
import com.shube.app.ussd.UssdResult
import com.shube.app.ussd.UssdStateMachine
import com.shube.app.ussd.UssdStep
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class GatewayForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    companion object {
        const val ACTION_PROCESS_SMS  = "com.shube.app.action.PROCESS_SMS"
        const val ACTION_START_GATEWAY = "com.shube.app.action.START_GATEWAY"
        const val ACTION_STOP_GATEWAY  = "com.shube.app.action.STOP_GATEWAY"

        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "shube_gateway_channel"
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

                val smsHash  = intent.getStringExtra("sms_hash")   ?: return START_STICKY
                val sender   = intent.getStringExtra("sender")      ?: ""
                val amount   = intent.getDoubleExtra("amount", 0.0)
                val txId     = intent.getStringExtra("tx_id")       ?: ""
                val body     = intent.getStringExtra("body")        ?: ""

                scope.launch {
                    processTransactionAsync(smsHash, sender, amount, txId, body)
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
                    api.sendHeartbeat(id)
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
        smsBody: String
    ) {
        val prefs = DevicePreferences.getInstance(this)
        val deviceId   = prefs.deviceId ?: run {
            Log.e("GatewayService", "No device ID — aborting")
            return
        }
        val operatorId = prefs.operatorId ?: run {
            Log.e("GatewayService", "No operator ID — aborting")
            return
        }

        Log.d("GatewayService", "Processing: amount=$amount SLS, sender=$sender")

        // ── Step 1: Find bundle rule matching the amount ─────────
        notify("Matching Bundle", "Looking up $amount SLS bundle rule...")
        val bundle = SupabaseRepository.getBundleByAmount(amount)
        if (bundle == null) {
            Log.w("GatewayService", "No bundle rule found for $amount SLS — logging and skipping")
            // No matching bundle — we still log but do NOT do USSD
            SupabaseRepository.createTransaction(
                TransactionInsert(
                    operatorId   = operatorId,
                    deviceId     = deviceId,
                    customerId   = null,
                    senderNumber = sender,
                    somtelNumber = null,
                    amountSls    = amount,
                    bundleName   = null,
                    ussdCode     = null,
                    smsHash      = hash,
                    status       = "FAILED",
                    notes        = "No bundle rule found for $amount SLS"
                )
            )
            notify("Payment Skipped", "No bundle rule for $amount SLS")
            return
        }
        Log.d("GatewayService", "Bundle matched: ${bundle.bundleName}")

        // ── Step 2: Look up customer's Somtel number ─────────────
        notify("Looking Up Customer", "Finding Somtel # for $sender...")
        val customer = SupabaseRepository.getCustomerBySender(sender)
        val somtelNumber = customer?.somtelNumber
        if (somtelNumber == null) {
            Log.w("GatewayService", "No customer found for sender $sender")
        }

        // ── Step 3: Create transaction row (status = PROCESSING) ─
        notify("Starting USSD", "Dialing ${bundle.ussdCode.take(8)}...")
        val transactionId = SupabaseRepository.createTransaction(
            TransactionInsert(
                operatorId   = operatorId,
                deviceId     = deviceId,
                customerId   = customer?.id,
                senderNumber = sender,
                somtelNumber = somtelNumber,
                amountSls    = amount,
                bundleName   = bundle.bundleName,
                ussdCode     = bundle.ussdCode,
                smsHash      = hash,
                status       = "PROCESSING"
            )
        )

        if (transactionId == null) {
            Log.e("GatewayService", "Failed to create transaction row — aborting USSD to avoid double-charging")
            return
        }

        // ── Step 4: Build USSD steps from the bundle rule ────────
        val steps = buildUssdSteps(bundle)

        // ── Step 5: Execute USSD workflow ─────────────────────────
        val ussdMachine = UssdStateMachine(this)
        val result = ussdMachine.executeWorkflow(
            steps         = steps,
            somtelNumber  = somtelNumber ?: "",
            bundleOption  = bundle.ussdOption
        )

        Log.d("GatewayService", "USSD result: $result for transaction $transactionId")

        // ── Step 6: Update transaction status ─────────────────────
        val (status, notes) = when (result) {
            UssdResult.SUCCESS            -> Pair("SUCCESS",  "USSD workflow completed successfully")
            UssdResult.FAILED             -> Pair("FAILED",   "USSD reported failure")
            UssdResult.UNKNOWN            -> Pair("UNKNOWN",  "USSD completed but result is unclear")
            UssdResult.INTERACTION_REQUIRED -> Pair("FAILED", "Accessibility service not active — could not automate USSD")
        }

        SupabaseRepository.updateTransactionStatus(transactionId, status, notes)

        // Update notification with final status
        val icon = when (result) {
            UssdResult.SUCCESS -> "✅"
            else               -> "❌"
        }
        notify("$icon Bundle ${if (result == UssdResult.SUCCESS) "Sent" else "Failed"}", "${bundle.bundleName} for $sender — $status")

        // Return to standby after 5 seconds
        kotlinx.coroutines.delay(5_000)
        notify("Gateway Active", "Listening for payments...")
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    /**
     * Converts a BundleRule into the ordered list of UssdStep objects
     * that the UssdStateMachine will execute.
     *
     * The rule has:
     *   - ussdCode   e.g. "*137*{somtel_number}*{bundle_option}*{pin}#"
     *   - ussdReplies e.g. ["1", "3", "1"]  — press after each USSD menu
     */
    private fun buildUssdSteps(bundle: com.shube.app.supabase.BundleRule): List<UssdStep> {
        val steps = mutableListOf<UssdStep>()

        // Step 1: Always DIAL the USSD code
        steps.add(
            UssdStep(
                type              = "DIAL",
                ussdCodeTemplate  = bundle.ussdCode,
                timeoutMs         = 12_000
            )
        )

        // Step 2+: Add each follow-up reply
        bundle.ussdReplies.forEach { reply ->
            steps.add(
                UssdStep(
                    type      = "SEND_REPLY",
                    value     = reply,
                    timeoutMs = 8_000
                )
            )
        }

        // Final step: Read the response for result matching
        steps.add(
            UssdStep(
                type            = "READ_RESPONSE",
                timeoutMs       = 8_000,
                successPatterns = listOf("success", "imtixaan", "la diray", "sent", "activated"),
                failurePatterns = listOf("failed", "error", "khalad", "xasilan", "insufficient")
            )
        )

        return steps
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

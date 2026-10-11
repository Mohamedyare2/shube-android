package com.mumin.app.service

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
import com.mumin.app.local.LocalPrefs
import com.mumin.app.supabase.BundleRule
import com.mumin.app.supabase.SupabaseRepository
import com.mumin.app.supabase.TransactionInsert
import com.mumin.app.ussd.MuminAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

/**
 * Foreground service that:
 * 1. Receives incoming payment SMS
 * 2. Parses the payment sender number (Telesom / Zaad)
 * 3. CRITICAL: Sets the recipient data bundle number to be IDENTICAL to the payment sender number!
 * 4. Finds matching bundle rule
 * 5. Executes USSD transaction
 * 6. Updates transaction status in Supabase
 */
class MuminForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    companion object {
        const val ACTION_PROCESS_PAYMENT = "com.mumin.app.action.PROCESS_PAYMENT"
        const val ACTION_START_SERVICE   = "com.mumin.app.action.START_SERVICE"
        const val ACTION_STOP_SERVICE    = "com.mumin.app.action.STOP_SERVICE"

        private const val NOTIFICATION_ID = 3001
        private const val CHANNEL_ID      = "mumin_service_channel"
        private const val DIALOG_TIMEOUT_MS = 30_000L
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val fgType = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q)
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0

        when (intent?.action) {
            ACTION_START_SERVICE -> {
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Mu'min App Active", "Listening for incoming payments..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Mu'min App Active", "Listening for incoming payments..."))
            }
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_PROCESS_PAYMENT -> {
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Mu'min App", "Processing payment transaction..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Mu'min App", "Processing payment transaction..."))

                val senderNumber = intent.getStringExtra("sender_number")
                val amount       = intent.getDoubleExtra("amount", 0.0)
                val txId         = intent.getStringExtra("tx_id") ?: ""
                val smsBody      = intent.getStringExtra("sms_body") ?: ""

                scope.launch {
                    processMuminTransaction(senderNumber, amount, txId, smsBody)
                }
            }
        }
        return START_STICKY
    }

    /**
     * CORE MU'MIN LOGIC:
     * In Mu'min App, the recipient phone number MUST automatically be the same as
     * the phone number from which the payment is being sent.
     */
    private suspend fun processMuminTransaction(
        paymentSenderNumber: String?,
        amountSls: Double,
        externalTxId: String,
        smsBody: String
    ) {
        val prefs = LocalPrefs(this)
        val operatorId = prefs.operatorId ?: run {
            Log.e("MuminService", "No operator ID configured — cannot process")
            notify("⚠️ Mu'min Error", "Operator account not configured. Please log in.")
            return
        }
        val profileId = prefs.profileId

        // ── Validation: Check sender number ─────────────────────────
        if (paymentSenderNumber.isNullOrBlank()) {
            Log.e("MuminService", "Payment-sending number cannot be reliably identified. Halting.")
            notify("❌ Mu'min Error", "Could not identify sender phone number. Transaction halted.")
            return
        }

        // Clean and format recipient number
        val cleanNumber = paymentSenderNumber.replace(Regex("""\D"""), "")
        val finalRecipient = when {
            cleanNumber.startsWith("252") && cleanNumber.length == 12 -> cleanNumber.substring(3)
            cleanNumber.startsWith("0") && cleanNumber.length == 10 -> cleanNumber.substring(1)
            else -> cleanNumber
        }

        if (finalRecipient.length !in 7..10) {
            Log.e("MuminService", "Invalid phone number format: $finalRecipient. Halting.")
            notify("❌ Mu'min Error", "Invalid phone number: $finalRecipient")
            return
        }

        // CRITICAL: SENDER NUMBER IS RECIPIENT NUMBER
        val telesomNumber = finalRecipient
        val somtelRecipientNumber = finalRecipient

        Log.d("MuminService", "Mu'min Rule applied: Sender=$telesomNumber == Recipient=$somtelRecipientNumber")
        notify("Mu'min Processing", "Sender & Recipient: $somtelRecipientNumber | SLS $amountSls")

        // ── Acquire WakeLock ────────────────────────────────────────
        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wl = pm?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    android.os.PowerManager.ON_AFTER_RELEASE,
            "Mumin::Transaction"
        )
        wl?.acquire(180_000L)

        try {
            // ── Step 1: Find matching bundle rule ───────────────────
            val bundle = SupabaseRepository.getBundleByAmount(amountSls, operatorId, profileId)
            if (bundle == null) {
                Log.w("MuminService", "No active bundle rule found for SLS $amountSls. Ignoring non-bundle transfer.")
                notify("Mu'min Notice", "SLS $amountSls does not match any bundle. Ignored.")
                return
            }

            // ── Step 2: Create transaction in Supabase ──────────────
            val transactionId = SupabaseRepository.createTransaction(
                TransactionInsert(
                    operatorId    = operatorId,
                    deviceId      = prefs.deviceId,
                    telesomNumber = telesomNumber,
                    somtelNumber  = somtelRecipientNumber,
                    amountSls     = amountSls,
                    bundleRuleId  = bundle.id,
                    smsHash       = externalTxId.ifEmpty { "TX_${System.currentTimeMillis()}" },
                    smsBody       = smsBody,
                    status        = "processing"
                )
            )

            if (transactionId == null) {
                Log.e("MuminService", "Failed to create Supabase transaction row — aborting")
                return
            }

            // ── Step 3: Check Accessibility Service ─────────────────
            if (!MuminAccessibilityService.isServiceActive) {
                Log.w("MuminService", "Accessibility service not active")
                SupabaseRepository.updateTransactionStatus(
                    transactionId,
                    "ussd_interaction_required",
                    "Accessibility service not enabled on device"
                )
                notify("⚠️ Mu'min Action Required", "Turn on Mu'min Accessibility in Settings")
                return
            }

            // ── Step 4: Build and execute USSD ──────────────────────
            val pin = prefs.ussdPin ?: ""
            val option = bundle.ussdOption ?: ""

            val dialCode = bundle.ussdCode
                .replace("{bundle_option}", option)
                .replace("{somtel_number}", somtelRecipientNumber)
                .replace("{recipient_number}", somtelRecipientNumber)
                .replace("{number}", somtelRecipientNumber)
                .replace("{pin}", pin)

            Log.d("MuminService", "Dialing USSD: $dialCode for recipient $somtelRecipientNumber")
            notify("📞 Dialing USSD", "Bundle ${bundle.bundleName} -> $somtelRecipientNumber")

            dialUssd(dialCode)

            // ── Step 5: Wait for outcome dialog ─────────────────────
            val resultDialogText = withTimeoutOrNull(DIALOG_TIMEOUT_MS) {
                MuminAccessibilityService.ussdDialogFlow.first()
            }

            if (resultDialogText == null) {
                SupabaseRepository.updateTransactionStatus(transactionId, "timeout", "USSD timed out")
                notify("⏱️ Timeout", "No USSD response within 30s")
                return
            }

            val lower = resultDialogText.lowercase()
            val status = when {
                lower.contains("guul") || lower.contains("success") ||
                        lower.contains("u shubtay") || lower.contains("lagu shubay") ||
                        lower.contains("sent") || lower.contains("confirmed") -> "success"
                lower.contains("khalad") || lower.contains("failed") ||
                        lower.contains("error") || lower.contains("haraagaagu kuguma filna") -> "failed"
                else -> "unknown_result"
            }

            SupabaseRepository.updateTransactionStatus(
                transactionId,
                status,
                resultDialogText,
                completedAt = java.time.Instant.now().toString()
            )

            val icon = if (status == "success") "✅" else "❌"
            notify("$icon Mu'min Bundle Sent", "${bundle.bundleName} to $somtelRecipientNumber: $status")

        } catch (e: Exception) {
            Log.e("MuminService", "Error processing transaction: ${e.message}", e)
            notify("❌ Mu'min Error", e.message ?: "Transaction failed")
        } finally {
            if (wl?.isHeld == true) {
                try { wl.release() } catch (_: Exception) {}
            }
            delay(5_000)
            notify("Mu'min App Active", "Listening for incoming payments...")
        }
    }

    private fun dialUssd(code: String) {
        if (checkSelfPermission(android.Manifest.permission.CALL_PHONE) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) {
            Log.e("MuminService", "CALL_PHONE permission not granted")
            return
        }
        val encoded = Uri.encode(code)
        val intent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$encoded")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(intent)
    }

    private fun notify(title: String, text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    private fun buildNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val ch = NotificationChannel(CHANNEL_ID, "Mu'min Service", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Mu'min background payment and bundle processor"
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

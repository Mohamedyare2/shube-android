package com.geesh.app.service

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
import com.geesh.app.local.GeeshDatabase
import com.geesh.app.local.LocalPrefs
import com.geesh.app.local.ProcessedTransaction
import com.geesh.app.ussd.GeeshAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first

/**
 * Foreground service that:
 *  1. Receives a parsed SMS (hadhaag/amount + tixraac) from SmsBroadcastReceiver
 *  2. Checks local Room DB to prevent duplicate processing
 *  3. Builds USSD code from flexible template: *806*{number}*{lacag}*{pin}#
 *     - {number}, {pin}, and reply are all optional (user configures on server)
 *     - Amount used is the INTEGER part only (e.g. $4.3 -> 4)
 *  4. Waits for the USSD dialog via GeeshAccessibilityService
 *  5. Optionally injects a reply and records the result
 */
class GeeshForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    companion object {
        const val ACTION_PROCESS_SMS   = "com.geesh.app.action.PROCESS_SMS"
        const val ACTION_START_SERVICE = "com.geesh.app.action.START_SERVICE"
        const val ACTION_STOP_SERVICE  = "com.geesh.app.action.STOP_SERVICE"

        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID      = "geesh_service_channel"

        // Timeout waiting for accessibility dialog (ms)
        private const val DIALOG_TIMEOUT_MS = 30_000L

        /**
         * Default template when none is set by the server.
         * Placeholders:
         *   {lacag}  — integer amount (REQUIRED, always replaced)
         *   {number} — optional recipient number
         *   {pin}    — optional PIN
         * Server can provide any combination, e.g.:
         *   *806*{number}*{lacag}*{pin}#
         *   *806*{number}*{lacag}#
         *   *806*{lacag}#
         */
        private const val DEFAULT_TEMPLATE = "*806*{lacag}#"
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
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Geesh Active", "Dhagaysanaya fariimaha..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Geesh Active", "Dhagaysanaya fariimaha..."))
            }
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_PROCESS_SMS -> {
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub la helay..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub la helay..."))

                val amount  = intent.getDoubleExtra("amount", 0.0)
                val tixraac = intent.getStringExtra("tixraac") ?: ""
                val smsBody = intent.getStringExtra("sms_body") ?: ""

                scope.launch { processPayment(amount, tixraac, smsBody) }
            }
        }
        return START_STICKY
    }

    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun processPayment(amount: Double, tixraac: String, smsBody: String) {
        val db  = GeeshDatabase.getInstance(this)
        val dao = db.transactionDao()

        Log.d("GeeshService", "Processing payment: \$$amount, tixraac=$tixraac")

        // ── Duplicate check ───────────────────────────────────────────────────
        if (tixraac.isNotEmpty()) {
            val existing = dao.findByTixraac(tixraac)
            if (existing != null) {
                Log.w("GeeshService", "Duplicate Tixraac $tixraac — already processed (${existing.ussdResult}). Skipping.")
                notify("Geesh", "Tixraac $tixraac horay baa loo diray — la iska daayay")
                return
            }
        }

        // ── Save to DB as pending ─────────────────────────────────────────────
        val record = ProcessedTransaction(
            tixraac      = tixraac.ifEmpty { "NO_TIXRAAC_${System.currentTimeMillis()}" },
            amountDollar = amount,
            smsBody      = smsBody,
            ussdResult   = "pending"
        )
        val inserted = dao.insert(record)
        if (inserted == -1L) {
            Log.w("GeeshService", "DB insert returned -1 (duplicate key). Aborting.")
            return
        }

        // ── Check Accessibility Service ───────────────────────────────────────
        if (!GeeshAccessibilityService.isServiceActive) {
            Log.e("GeeshService", "Accessibility service is NOT active. Cannot enter reply automatically.")
            notify("⚠️ Geesh", "Accessibility Service ma shaqaynayso! Fur Settings si aad u shiddo.")
            dao.updateResult(record.tixraac, "failed_accessibility")
            return
        }

        // ── Acquire WakeLock ──────────────────────────────────────────────────
        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wl = pm?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
            android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
            android.os.PowerManager.ON_AFTER_RELEASE,
            "Geesh::USSD"
        )
        wl?.acquire(120_000L) // 2 min safety

        try {
            val prefs = LocalPrefs(this)

            // ── Build USSD code from flexible template ────────────────────────
            // Template examples (all set by admin on the server):
            //   *806*{number}*{lacag}*{pin}#    (number + pin both present)
            //   *806*{number}*{lacag}#           (no pin)
            //   *806*{lacag}#                    (no number, no pin)
            val template = prefs.ussdTemplate?.takeIf { it.isNotBlank() } ?: DEFAULT_TEMPLATE

            // Amount is already the integer part from the parser
            val amountStr = amount.toInt().toString()

            val ussdCode = template
                .replace("{lacag}", amountStr)
                .replace("{amount}", amountStr)

            Log.d("GeeshService", "Dialing USSD: $ussdCode  (template=$template, amount=$amountStr)")
            notify("Geesh 📞", "Diray: $ussdCode")

            // ── Optional single reply ─────────────────────────────────────────
            val ussdReply = prefs.ussdReply?.takeIf { it.isNotBlank() }
            if (ussdReply != null) {
                GeeshAccessibilityService.nextReply = ussdReply
                Log.d("GeeshService", "Reply will be sent: $ussdReply")
            } else {
                GeeshAccessibilityService.nextReply = null
                Log.d("GeeshService", "No reply configured — USSD only")
            }

            // ── Dial ─────────────────────────────────────────────────────────
            dialUssd(ussdCode)

            // ── Wait for confirmation dialog ─────────────────────────────────
            val resultText = withTimeoutOrNull(DIALOG_TIMEOUT_MS) {
                GeeshAccessibilityService.ussdDialogFlow.first()
            }

            if (resultText == null) {
                Log.e("GeeshService", "USSD timed out — no dialog received within ${DIALOG_TIMEOUT_MS}ms")
                dao.updateResult(record.tixraac, "timeout")
                notify("❌ Geesh", "Waqtigu dhameeyay — jawaab ma la helin")
                return
            }

            Log.d("GeeshService", "USSD response: $resultText")

            // ── Classify result ───────────────────────────────────────────────
            val lower = resultText.lowercase()
            val result = when {
                lower.contains("guul") || lower.contains("success") ||
                lower.contains("la diray") || lower.contains("sent") -> "success"
                lower.contains("khalad") || lower.contains("failed") ||
                lower.contains("error") -> "failed"
                else -> "unknown"
            }

            dao.updateResult(record.tixraac, result)

            val icon = if (result == "success") "✅" else "⚠️"
            notify("$icon Geesh", "Natiijaday: $result | \$$amount | $resultText".take(80))

        } finally {
            if (wl?.isHeld == true) try { wl.release() } catch (_: Exception) {}
            // Reset to standby after 5 s
            delay(5_000)
            notify("Geesh Active", "Dhagaysanaya fariimaha...")
        }
    }

    // ─── Dial USSD via phone call intent ─────────────────────────────────────
    private fun dialUssd(code: String) {
        if (checkSelfPermission(android.Manifest.permission.CALL_PHONE) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) {
            Log.e("GeeshService", "CALL_PHONE permission not granted!")
            return
        }
        val encoded = Uri.encode(code)
        val intent = Intent(Intent.ACTION_CALL).apply {
            data  = Uri.parse("tel:$encoded")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(intent)
    }

    // ─── Notification helpers ─────────────────────────────────────────────────
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
        val ch = NotificationChannel(CHANNEL_ID, "Geesh Service", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Geesh background payment processor"
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }

    override fun onDestroy() { super.onDestroy(); job.cancel() }
    override fun onBind(intent: Intent?): IBinder? = null
}

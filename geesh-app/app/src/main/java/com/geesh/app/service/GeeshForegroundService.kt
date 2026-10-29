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
import com.geesh.app.parser.GeeshSmsParser
import com.geesh.app.ussd.GeeshAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first

data class PaymentTask(
    val amount: Double,
    val amountFormatted: String,
    val tixraac: String,
    val smsBody: String,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Foreground service that:
 *  1. Receives parsed SMS messages and puts them into a strict FIFO queue.
 *  2. Processes transactions sequentially in order of arrival (first-come, first-served).
 *  3. Supports both CARD mode (direct USSD) and BANK mode (*800# deposit flow).
 *  4. Retries failed USSD transfers automatically.
 *  5. Automatically checks card balance via *801# when no 898 SMS is received for user-defined interval,
 *     and sweeps any balance >= $0.12 into the active payment channel.
 */
class GeeshForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    // FIFO Queue for incoming payment requests
    private val paymentQueue = Channel<PaymentTask>(Channel.UNLIMITED)

    // Guard against concurrent USSD operations
    @Volatile
    private var isBusyProcessing = false

    private var lastBalanceCheckTimestamp = 0L

    companion object {
        const val ACTION_PROCESS_SMS   = "com.geesh.app.action.PROCESS_SMS"
        const val ACTION_START_SERVICE = "com.geesh.app.action.START_SERVICE"
        const val ACTION_STOP_SERVICE  = "com.geesh.app.action.STOP_SERVICE"

        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID      = "geesh_service_channel"

        // Timeout waiting for USSD flow completion (ms) - 75s for multi-step bank flow
        private const val DIALOG_TIMEOUT_MS = 75_000L
        private const val BALANCE_CHECK_TIMEOUT_MS = 35_000L

        private const val DEFAULT_TEMPLATE = "*806*{lacag}#"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startQueueWorker()
        startInactivityTimer()
    }

    /**
     * Sequential FIFO Worker:
     * Takes one transaction from the queue at a time, completes its full USSD cycle,
     * retries if needed, waits a short cool-down, then takes the next one.
     */
    private fun startQueueWorker() {
        scope.launch {
            for (task in paymentQueue) {
                isBusyProcessing = true
                try {
                    processPaymentWithRetry(task.amount, task.amountFormatted, task.tixraac, task.smsBody)
                } catch (e: Exception) {
                    Log.e("GeeshService", "Error processing task for ${task.tixraac}", e)
                } finally {
                    isBusyProcessing = false
                }
                // Cool-down pause so telecom network & dialer UI settle before next USSD
                delay(4_000)
            }
        }
    }

    /**
     * Inactivity Timer:
     * Periodically monitors time since last 898 SMS was received.
     * If no 898 SMS received for the selected interval (5m - 60m), dials *801# to check balance.
     */
    private fun startInactivityTimer() {
        scope.launch {
            while (isActive) {
                delay(30_000) // check every 30 seconds
                try {
                    val prefs = LocalPrefs(this@GeeshForegroundService)
                    if (!prefs.autoCheckBalanceEnabled) continue

                    val balancePin = prefs.balanceCheckPin?.trim()
                    if (balancePin.isNullOrBlank()) continue

                    val intervalMs = prefs.checkBalanceIntervalMinutes * 60 * 1000L
                    val now = System.currentTimeMillis()
                    val timeSinceLastSms = now - prefs.lastSmsReceivedTimestamp
                    val timeSinceLastCheck = now - lastBalanceCheckTimestamp

                    if (timeSinceLastSms >= intervalMs && timeSinceLastCheck >= intervalMs) {
                        if (isBusyProcessing) {
                            Log.d("GeeshService", "Auto-check postponed: USSD payment currently in progress")
                            continue
                        }
                        performAutoBalanceCheck(balancePin)
                    }
                } catch (e: Exception) {
                    Log.e("GeeshService", "Error in auto-check balance timer", e)
                }
            }
        }
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
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub baa timid..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub baa timid..."))

                val amount  = intent.getDoubleExtra("amount", 0.0)
                val amountFormatted = intent.getStringExtra("amount_formatted") ?: amount.toString().removeSuffix(".0").replace(".", "*")
                val tixraac = intent.getStringExtra("tixraac") ?: ""
                val smsBody = intent.getStringExtra("sms_body") ?: ""

                val task = PaymentTask(amount, amountFormatted, tixraac, smsBody)
                val sent = paymentQueue.trySend(task)
                Log.d("GeeshService", "Enqueued payment task: tixraac=$tixraac, amount=$amount, success=${sent.isSuccess}")
                notify("Geesh Safka", "Lacag \$$amount ayaa safka lagu daray...")
            }
        }
        return START_STICKY
    }

    // ─────────────────────────────────────────────────────────────────────────

    private suspend fun processPaymentWithRetry(amount: Double, amountFormatted: String, tixraac: String, smsBody: String) {
        val db  = GeeshDatabase.getInstance(this)
        val dao = db.transactionDao()

        Log.d("GeeshService", "Processing payment: \$$amount (formatted: $amountFormatted), tixraac=$tixraac")

        // ── Duplicate check ───────────────────────────────────────────────────
        if (tixraac.isNotEmpty()) {
            val existing = dao.findByTixraac(tixraac)
            if (existing != null && existing.ussdResult == "success") {
                Log.w("GeeshService", "Duplicate Tixraac $tixraac — already successfully processed. Skipping.")
                notify("Geesh", "Tixraac $tixraac horay baa loo diray — la iska daayay")
                return
            }
        }

        // ── Save / Update in DB as pending ────────────────────────────────────
        val record = ProcessedTransaction(
            tixraac      = tixraac.ifEmpty { "NO_TIXRAAC_${System.currentTimeMillis()}" },
            amountDollar = amount,
            smsBody      = smsBody,
            ussdResult   = "pending"
        )
        dao.insert(record)

        // ── Check Accessibility Service ───────────────────────────────────────
        if (!GeeshAccessibilityService.isServiceActive) {
            Log.e("GeeshService", "Accessibility service is NOT active. Cannot enter replies automatically.")
            notify("⚠️ Geesh", "Accessibility Service ma shaqaynayso! Fur Settings si aad u shiddo.")
            dao.updateResult(record.tixraac, "failed_accessibility")
            return
        }

        val prefs = LocalPrefs(this)
        val isBankMode = prefs.paymentMode.equals("BANK", ignoreCase = true)

        var finalResult = "failed"
        var finalDialog = ""

        // Try up to 2 attempts (initial attempt + 1 retry if failed)
        for (attempt in 1..2) {
            if (attempt > 1) {
                Log.w("GeeshService", "Payment attempt 1 failed. Waiting 5s before RETRY attempt 2 for $tixraac...")
                notify("⚠️ Geesh", "USSD wuu fashilmay, mar labaad ayaa la isku dayayaa (\$$amount)...")
                delay(5_000)
            }

            val (resultStatus, dialogText) = executeSingleTransfer(isBankMode, prefs, amount, amountFormatted)
            finalResult = resultStatus
            finalDialog = dialogText

            if (resultStatus == "success") {
                Log.d("GeeshService", "Payment succeeded on attempt $attempt: $dialogText")
                break
            }
        }

        dao.updateResult(record.tixraac, finalResult)
        val icon = if (finalResult == "success") "✅" else "❌"
        notify("$icon Geesh", "Natiijada: $finalResult | \$$amount | $finalDialog".take(80))
    }

    private suspend fun executeSingleTransfer(
        isBankMode: Boolean,
        prefs: LocalPrefs,
        amount: Double,
        amountFormatted: String
    ): Pair<String, String> {
        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wl = pm?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
            android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
            android.os.PowerManager.ON_AFTER_RELEASE,
            "Geesh::USSD_Transfer"
        )
        wl?.acquire(120_000L)

        try {
            val ussdCodeToDial: String

            if (isBankMode) {
                val pinHore = prefs.bankInitialPin?.trim()
                val bankPin = prefs.bankPin?.trim()

                if (pinHore.isNullOrBlank() || bankPin.isNullOrBlank()) {
                    Log.e("GeeshService", "Bank PIN-yada lama buuxin! Initial PIN ama Bank PIN waa maran.")
                    notify("❌ Geesh", "Bank PIN lama buuxin! Fadlan geli PIN-ka Hore iyo Bank PIN.")
                    return Pair("failed_missing_pins", "Bank PIN-yada lama helin")
                }

                ussdCodeToDial = "*800#"

                // In Bank Account mode, amount is entered into a standard reply field with dot (e.g. "0.5")
                val bankAmount = if (amount % 1.0 == 0.0) {
                    amount.toLong().toString()
                } else {
                    amountFormatted.replace("*", ".")
                }

                val bankReplies = listOf(
                    pinHore,
                    "5",
                    "2",
                    bankAmount,
                    "1",
                    bankPin,
                    "1"
                )

                GeeshAccessibilityService.setReplies(bankReplies)
                Log.d("GeeshService", "Dialing Bank USSD: *800# with amount=$bankAmount (replies: $bankReplies)")
                notify("Geesh 🏦", "Bank: *800# (\$$bankAmount) diraya...")

            } else {
                val template = prefs.ussdTemplate?.takeIf { it.isNotBlank() } ?: DEFAULT_TEMPLATE
                var code = template
                    .replace("{lacag}", amountFormatted)
                    .replace("{amount}", amountFormatted)

                val ussdReply = prefs.ussdReply?.takeIf { it.isNotBlank() }
                if (ussdReply != null && code.contains("{pin}")) {
                    code = code.replace("{pin}", ussdReply)
                }
                ussdCodeToDial = code

                if (ussdReply != null && !template.contains("{pin}")) {
                    GeeshAccessibilityService.setReplies(listOf(ussdReply))
                } else {
                    GeeshAccessibilityService.clearReplies()
                }

                Log.d("GeeshService", "Dialing Card USSD: $ussdCodeToDial")
                notify("Geesh 💳", "Diray: $ussdCodeToDial")
            }

            dialUssd(ussdCodeToDial)

            val resultText = withTimeoutOrNull(DIALOG_TIMEOUT_MS) {
                GeeshAccessibilityService.ussdDialogFlow.first()
            }

            if (resultText == null) {
                Log.e("GeeshService", "USSD timed out — no dialog received within ${DIALOG_TIMEOUT_MS}ms")
                return Pair("timeout", "Waqtigu wuu dhamaaday")
            }

            Log.d("GeeshService", "USSD Response: $resultText")

            val isSuccess = isTransferSuccessful(isBankMode, resultText)
            val status = if (isSuccess) "success" else "failed"

            return Pair(status, resultText)

        } finally {
            if (wl?.isHeld == true) try { wl.release() } catch (_: Exception) {}
        }
    }

    /**
     * Determines if the transfer succeeded based on exact telecom confirmation phrases:
     *  - Bank mode: contains "waxaad lacag dhigatay"
     *  - Direct Card mode: contains "waxaad" and "u dirtay"
     */
    private fun isTransferSuccessful(isBankMode: Boolean, dialogText: String): Boolean {
        val lower = dialogText.lowercase()
        return if (isBankMode) {
            lower.contains("waxaad lacag dhigatay") || lower.contains("lagu shubay") || lower.contains("guul")
        } else {
            (lower.contains("waxaad") && lower.contains("u dirtay")) || lower.contains("la diray") || lower.contains("guul")
        }
    }

    /**
     * Dials *801# with balanceCheckPin, parses dialog, and sweeps balance if >= $0.12.
     */
    private suspend fun performAutoBalanceCheck(balancePin: String) {
        if (!GeeshAccessibilityService.isServiceActive) {
            Log.w("GeeshService", "Auto-check skipped: Accessibility is not active")
            return
        }

        isBusyProcessing = true
        lastBalanceCheckTimestamp = System.currentTimeMillis()

        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wl = pm?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
            android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
            android.os.PowerManager.ON_AFTER_RELEASE,
            "Geesh::AutoBalanceCheck"
        )
        wl?.acquire(60_000L)

        try {
            Log.d("GeeshService", "Triggering Auto Balance Check via *801#")
            notify("Geesh 🔍", "Hadhaaga ayaa la eegayaa (*801#)...")

            GeeshAccessibilityService.setReplies(listOf(balancePin))
            dialUssd("*801#")

            val resultText = withTimeoutOrNull(BALANCE_CHECK_TIMEOUT_MS) {
                GeeshAccessibilityService.ussdDialogFlow.first()
            }

            if (resultText == null) {
                Log.w("GeeshService", "Auto-check balance timed out without response")
                return
            }

            Log.d("GeeshService", "Balance dialog received: $resultText")

            val parsed = GeeshSmsParser().parseBalanceDialog(resultText)
            if (parsed == null) {
                Log.w("GeeshService", "Could not parse dollar balance from dialog: $resultText")
                return
            }

            if (parsed.isSendable) {
                // Balance is >= $0.12 — sweep it!
                Log.d("GeeshService", "Auto-sweep triggered! Balance \$$parsed.amountDollar >= \$0.12")
                notify("Geesh 💰", "Hadhaag la helay: \$${parsed.amountDollar} — Safka ayaa lagu daray!")

                val task = PaymentTask(
                    amount = parsed.amountDollar,
                    amountFormatted = parsed.amountFormatted,
                    tixraac = "SWEEP_${System.currentTimeMillis()}",
                    smsBody = "Auto-Sweep *801#: $resultText"
                )
                paymentQueue.trySend(task)

            } else {
                Log.d("GeeshService", "Balance is \$${parsed.amountDollar} (under \$0.12 minimum). Skipping transfer.")
                notify("Geesh ℹ️", "Hadhaagu waa \$${parsed.amountDollar} (< \$0.12) — lama dirin.")
            }

        } catch (e: Exception) {
            Log.e("GeeshService", "Exception in performAutoBalanceCheck", e)
        } finally {
            if (wl?.isHeld == true) try { wl.release() } catch (_: Exception) {}
            isBusyProcessing = false
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

    override fun onDestroy() {
        super.onDestroy()
        paymentQueue.close()
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

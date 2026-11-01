package com.geesh.app.service

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import java.util.Collections

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
 *  4. Single-execution guarantee: NEVER sends duplicate/retry payments blindly.
 *  5. Automatically checks card balance via *801# when no 898 SMS is received for user-defined interval,
 *     using AlarmManager to reliably wake up even in deep Android Doze mode.
 */
class GeeshForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    // FIFO Queue for incoming payment requests
    private val paymentQueue = Channel<PaymentTask>(Channel.UNLIMITED)

    // In-memory set of currently active/queued tixraacs to prevent duplicate execution
    private val activeTixraacs = Collections.synchronizedSet(mutableSetOf<String>())

    // Guard against concurrent USSD operations
    @Volatile
    private var isBusyProcessing = false

    companion object {
        const val ACTION_PROCESS_SMS      = "com.geesh.app.action.PROCESS_SMS"
        const val ACTION_START_SERVICE    = "com.geesh.app.action.START_SERVICE"
        const val ACTION_STOP_SERVICE     = "com.geesh.app.action.STOP_SERVICE"
        const val ACTION_CHECK_INACTIVITY = "com.geesh.app.action.CHECK_INACTIVITY"

        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID      = "geesh_service_channel"

        private const val CARD_DIALOG_TIMEOUT_MS = 35_000L
        private const val BANK_DIALOG_TIMEOUT_MS = 90_000L
        private const val BALANCE_CHECK_TIMEOUT_MS = 30_000L

        private const val DEFAULT_TEMPLATE = "*806*{lacag}#"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startQueueWorker()
        startInactivityTimer()
        scheduleNextInactivityAlarm()
    }

    /**
     * Sequential FIFO Worker:
     * Takes one transaction from the queue at a time, completes its full USSD cycle,
     * waits a short cool-down, then takes the next one.
     */
    private fun startQueueWorker() {
        scope.launch {
            for (task in paymentQueue) {
                isBusyProcessing = true
                try {
                    processPayment(task.amount, task.amountFormatted, task.tixraac, task.smsBody)
                } catch (e: Exception) {
                    Log.e("GeeshService", "Error processing task for ${task.tixraac}", e)
                } finally {
                    isBusyProcessing = false
                    if (task.tixraac.isNotEmpty()) {
                        activeTixraacs.remove(task.tixraac)
                    }
                }
                delay(3_000)
            }
        }
    }

    /**
     * Coroutine timer loop for when the device is actively awake.
     */
    private fun startInactivityTimer() {
        scope.launch {
            while (isActive) {
                delay(60_000) // check once a minute while awake
                try {
                    checkInactivityAndTriggerBalance()
                } catch (e: Exception) {
                    Log.e("GeeshService", "Error in auto-check balance timer loop", e)
                }
            }
        }
    }

    /**
     * Schedules the next exact AlarmManager alarm based on remaining time until the interval.
     */
    private fun scheduleNextInactivityAlarm() {
        try {
            val prefs = LocalPrefs(this)
            if (!prefs.autoCheckBalanceEnabled) return

            val alarmMgr = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(this, GeeshForegroundService::class.java).apply {
                action = ACTION_CHECK_INACTIVITY
            }
            val pending = PendingIntent.getService(
                this,
                2002,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val intervalMinutes = prefs.checkBalanceIntervalMinutes.coerceAtLeast(5)
            val intervalMs = intervalMinutes * 60 * 1000L
            val now = System.currentTimeMillis()

            val remainingSms = intervalMs - (now - prefs.lastSmsReceivedTimestamp)
            val remainingCheck = intervalMs - (now - prefs.lastBalanceCheckTimestamp)
            val waitMs = maxOf(remainingSms, remainingCheck).coerceAtLeast(60_000L)

            val triggerTime = now + waitMs
            Log.d("GeeshService", "Scheduled next inactivity alarm in ${waitMs / 1000}s")
            alarmMgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pending)
        } catch (e: Exception) {
            Log.w("GeeshService", "Could not set inactivity alarm: ${e.message}")
        }
    }

    /**
     * Checks if enough time has elapsed since the last 898 SMS without any transaction,
     * and triggers *801# balance check if condition is met.
     */
    private fun checkInactivityAndTriggerBalance() {
        val prefs = LocalPrefs(this)
        if (!prefs.autoCheckBalanceEnabled) return

        val balancePin = prefs.balanceCheckPin?.trim()
        if (balancePin.isNullOrBlank()) return

        val intervalMinutes = prefs.checkBalanceIntervalMinutes.coerceAtLeast(5)
        val intervalMs = intervalMinutes * 60 * 1000L
        val now = System.currentTimeMillis()
        val timeSinceLastSms = now - prefs.lastSmsReceivedTimestamp
        val timeSinceLastCheck = now - prefs.lastBalanceCheckTimestamp

        if (timeSinceLastSms >= intervalMs && timeSinceLastCheck >= intervalMs) {
            if (isBusyProcessing) {
                Log.d("GeeshService", "Auto-check postponed: USSD payment currently in progress")
                return
            }
            // Update timestamp immediately to prevent re-entrant calls
            prefs.lastBalanceCheckTimestamp = now
            scope.launch {
                performAutoBalanceCheck(balancePin)
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
                scheduleNextInactivityAlarm()
            }
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_CHECK_INACTIVITY -> {
                checkInactivityAndTriggerBalance()
                scheduleNextInactivityAlarm()
            }
            ACTION_PROCESS_SMS -> {
                if (fgType != 0) startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub baa timid..."), fgType)
                else startForeground(NOTIFICATION_ID, buildNotification("Geesh", "Fariin cusub baa timid..."))

                val amount  = intent.getDoubleExtra("amount", 0.0)
                val amountFormatted = intent.getStringExtra("amount_formatted") ?: amount.toString().removeSuffix(".0").replace(".", "*")
                val tixraac = intent.getStringExtra("tixraac") ?: ""
                val smsBody = intent.getStringExtra("sms_body") ?: ""

                // Prevent duplicate processing if same tixraac is already queued
                if (tixraac.isNotEmpty()) {
                    if (!activeTixraacs.add(tixraac)) {
                        Log.w("GeeshService", "Tixraac $tixraac is already queued — ignoring duplicate intent")
                        return START_STICKY
                    }
                }

                val task = PaymentTask(amount, amountFormatted, tixraac, smsBody)
                val sent = paymentQueue.trySend(task)
                Log.d("GeeshService", "Enqueued payment task: tixraac=$tixraac, amount=$amount, success=${sent.isSuccess}")
                notify("Geesh Safka", "Lacag \$$amount ayaa safka lagu daray...")
            }
        }
        return START_STICKY
    }

    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Executes a single transfer for the given task.
     * Guaranteed NO BLIND RETRIES: Financial transactions are dialed only once.
     */
    private suspend fun processPayment(amount: Double, amountFormatted: String, tixraac: String, smsBody: String) {
        val db  = GeeshDatabase.getInstance(this)
        val dao = db.transactionDao()

        Log.d("GeeshService", "Processing payment: \$$amount (formatted: $amountFormatted), tixraac=$tixraac")

        // Database duplicate check
        if (tixraac.isNotEmpty()) {
            val existing = dao.findByTixraac(tixraac)
            if (existing != null && (existing.ussdResult == "success" || existing.ussdResult == "pending")) {
                Log.w("GeeshService", "Duplicate Tixraac $tixraac already exists in DB (${existing.ussdResult}). Skipping.")
                notify("Geesh", "Tixraac $tixraac horay baa loo diray — la iska daayay")
                return
            }
        }

        val record = ProcessedTransaction(
            tixraac      = tixraac.ifEmpty { "NO_TIXRAAC_${System.currentTimeMillis()}" },
            amountDollar = amount,
            smsBody      = smsBody,
            ussdResult   = "pending"
        )
        dao.insert(record)

        if (!GeeshAccessibilityService.isServiceActive) {
            Log.e("GeeshService", "Accessibility service is NOT active.")
            notify("⚠️ Geesh", "Accessibility Service ma shaqaynayso! Fur Settings si aad u shiddo.")
            dao.updateResult(record.tixraac, "failed_accessibility")
            return
        }

        val prefs = LocalPrefs(this)
        val isBankMode = prefs.paymentMode.equals("BANK", ignoreCase = true)

        // Single execution: Dial USSD once and capture true outcome
        val (finalResult, finalDialog) = executeSingleTransfer(isBankMode, prefs, amount, amountFormatted)

        dao.updateResult(record.tixraac, finalResult)
        val icon = if (finalResult == "success") "✅" else "⚠️"
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
        val wakeLockDuration = if (isBankMode) 120_000L else 60_000L
        wl?.acquire(wakeLockDuration)

        try {
            val ussdCodeToDial: String

            if (isBankMode) {
                val pinHore = prefs.bankInitialPin?.trim()
                val bankPin = prefs.bankPin?.trim()

                if (pinHore.isNullOrBlank() || bankPin.isNullOrBlank()) {
                    Log.e("GeeshService", "Bank PIN-yada lama buuxin! Initial PIN ama Bank PIN waa maran.")
                    notify("⚠️ Geesh", "Bank PIN lama buuxin! Fadlan geli PIN-ka Hore iyo Bank PIN.")
                    return Pair("failed_missing_pins", "Bank PIN-yada lama helin")
                }

                ussdCodeToDial = "*800#"

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

                // Start active USSD session in Accessibility service
                GeeshAccessibilityService.startSession(bankReplies)
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
                    GeeshAccessibilityService.startSession(listOf(ussdReply))
                } else {
                    GeeshAccessibilityService.startSession(emptyList())
                }

                Log.d("GeeshService", "Dialing Card USSD: $ussdCodeToDial")
                notify("Geesh 💳", "Diray: $ussdCodeToDial")
            }

            dialUssd(ussdCodeToDial)

            val timeoutMs = if (isBankMode) BANK_DIALOG_TIMEOUT_MS else CARD_DIALOG_TIMEOUT_MS
            val resultText = withTimeoutOrNull(timeoutMs) {
                GeeshAccessibilityService.ussdDialogFlow.first()
            }

            if (resultText == null) {
                Log.e("GeeshService", "USSD timed out — no dialog received within ${timeoutMs}ms")
                return Pair("timeout", "Waqtigu wuu dhamaaday")
            }

            Log.d("GeeshService", "USSD Response: $resultText")

            val isSuccess = isTransferSuccessful(isBankMode, resultText)
            val status = if (isSuccess) "success" else "failed"

            return Pair(status, resultText)

        } finally {
            // Always stop session so accessibility service returns to completely dormant state
            GeeshAccessibilityService.stopSession()
            if (wl?.isHeld == true) try { wl.release() } catch (_: Exception) {}
        }
    }

    /**
     * Determines if the transfer succeeded based on comprehensive telecom confirmation phrases.
     */
    private fun isTransferSuccessful(isBankMode: Boolean, dialogText: String): Boolean {
        val lower = dialogText.lowercase()

        // 1. Explicit failure keywords
        val failureKeywords = listOf(
            "khalad", "failed", "error", "maku filna", "ma haysatid", "kuma filna",
            "ma shaqaynayo", "invalid", "lama heli karo", "waqtigu wuu dhamaaday",
            "cancelled", "la kansalay", "waa la joojiyay"
        )
        if (failureKeywords.any { lower.contains(it) }) {
            return false
        }

        // 2. Success keywords
        return if (isBankMode) {
            lower.contains("waxaad lacag dhigatay") ||
            lower.contains("dhigatay") ||
            lower.contains("dhigasho") ||
            lower.contains("lagu shubay") ||
            lower.contains("ku shubtay") ||
            lower.contains("xisaabta") ||
            lower.contains("xisaabtaada") ||
            lower.contains("u wareejisay") ||
            lower.contains("wareejisay") ||
            lower.contains("guul") ||
            lower.contains("success")
        } else {
            (lower.contains("waxaad") && lower.contains("dirtay")) ||
            (lower.contains("waxaad") && lower.contains("wareejisay")) ||
            lower.contains("u dirtay") ||
            lower.contains("dirtay") ||
            lower.contains("la diray") ||
            lower.contains("u wareejisay") ||
            lower.contains("wareejisay") ||
            lower.contains("sent") ||
            lower.contains("guul") ||
            lower.contains("success") ||
            lower.contains("hadhaagaagu waa") ||
            lower.contains("haraagaagu waa") ||
            lower.contains("adeega sarifka")
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

        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        @Suppress("DEPRECATION")
        val wl = pm?.newWakeLock(
            android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
            android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP or
            android.os.PowerManager.ON_AFTER_RELEASE,
            "Geesh::AutoBalanceCheck"
        )
        wl?.acquire(45_000L)

        try {
            Log.d("GeeshService", "Triggering Auto Balance Check via *801#")
            notify("Geesh 🔍", "Hadhaaga ayaa la eegayaa (*801#)...")

            GeeshAccessibilityService.startSession(listOf(balancePin))
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
                Log.d("GeeshService", "Auto-sweep triggered! Balance \$${parsed.amountDollar} >= \$0.12")
                notify("Geesh 💰", "Hadhaag la helay: \$${parsed.amountDollar} — Safka ayaa lagu daray!")

                delay(2500)

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
            GeeshAccessibilityService.stopSession()
            if (wl?.isHeld == true) try { wl.release() } catch (_: Exception) {}
            isBusyProcessing = false
        }
    }

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

    private fun notify(title: String, text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    private fun buildNotification(title: String, text: String): Notification {
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
            "Geesh Automation Service",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Keeps the USSD payment automation running in the background"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

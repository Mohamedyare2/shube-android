package com.geesh.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.geesh.app.local.LocalPrefs
import com.geesh.app.parser.GeeshSmsParser

/**
 * Listens for incoming SMS messages.
 * Only processes messages from sender "898" (Telesom / Adeega Sarifka).
 */
class GeeshSmsReceiver : BroadcastReceiver() {

    private val parser = GeeshSmsParser()

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        // Group multi-part messages by sender
        val bySender = messages.groupBy { it.originatingAddress }

        for ((sender, msgs) in bySender) {
            if (sender == null) continue

            val cleanSender = sender.trim()
            // ONLY process SMS from sender containing "898" (e.g. "898", "+252898")
            if (cleanSender != "898" && !cleanSender.endsWith("898")) {
                Log.d("GeeshSmsReceiver", "Ignored SMS from non-898 sender: $cleanSender")
                continue
            }

            val body = msgs.joinToString("") { it.messageBody ?: "" }
            Log.d("GeeshSmsReceiver", "SMS from 898 received: $body")

            // Strict Filter: ONLY process and reset timer for ADEEGA SARIFKA!
            // Reject ZAAD DOLLAR or any non-Sarifka SMS completely.
            if (!parser.isAdeegaSarifka(body)) {
                Log.d("GeeshSmsReceiver", "Ignored 898 SMS because it is not ADEEGA SARIFKA (e.g. ZAAD DOLLAR): $body")
                continue
            }

            // Critical: Update lastSmsReceivedTimestamp ONLY when a genuine ADEEGA SARIFKA message arrives!
            // This resets the auto-check balance timer appropriately.
            try {
                LocalPrefs(context).lastSmsReceivedTimestamp = System.currentTimeMillis()
                Log.d("GeeshSmsReceiver", "Reset lastSmsReceivedTimestamp because ADEEGA SARIFKA SMS arrived")
            } catch (e: Exception) {
                Log.w("GeeshSmsReceiver", "Failed to update lastSmsReceivedTimestamp: ${e.message}")
            }

            val parsed = parser.parse(body)
            if (parsed == null) {
                Log.d("GeeshSmsReceiver", "Could not parse dollar amount from ADEEGA SARIFKA SMS — ignoring")
                continue
            }

            Log.d("GeeshSmsReceiver", "Parsed: amount=\$${parsed.amountDollar}, tixraac=${parsed.tixraac}")

            // Start the processing service
            val serviceIntent = Intent(context, GeeshForegroundService::class.java).apply {
                action = GeeshForegroundService.ACTION_PROCESS_SMS
                putExtra("amount", parsed.amountDollar)
                putExtra("amount_formatted", parsed.amountFormatted)
                putExtra("tixraac", parsed.tixraac ?: "")
                putExtra("sms_body", body)
            }
            context.startForegroundService(serviceIntent)
        }
    }
}

package com.geesh.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.geesh.app.parser.GeeshSmsParser

/**
 * Listens for incoming SMS messages.
 * Only processes messages from sender "898" (Adeega Sarifka).
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

            // ONLY process SMS from sender "898" (Telesom/Adeega Sarifka)
            if (sender.trim() != "898") {
                Log.d("GeeshSmsReceiver", "Ignored SMS from non-898 sender: $sender")
                continue
            }

            val body = msgs.joinToString("") { it.messageBody ?: "" }
            Log.d("GeeshSmsReceiver", "SMS from 898: $body")

            val parsed = parser.parse(body)
            if (parsed == null) {
                Log.d("GeeshSmsReceiver", "Could not parse dollar amount from 898 SMS — ignoring")
                continue
            }

            Log.d("GeeshSmsReceiver", "Parsed: amount=\$${parsed.amountDollar}, tixraac=${parsed.tixraac}")

            // Start the processing service
            val serviceIntent = Intent(context, GeeshForegroundService::class.java).apply {
                action = GeeshForegroundService.ACTION_PROCESS_SMS
                putExtra("amount",   parsed.amountDollar)
                putExtra("tixraac", parsed.tixraac ?: "")
                putExtra("sms_body", body)
            }
            context.startForegroundService(serviceIntent)
        }
    }
}

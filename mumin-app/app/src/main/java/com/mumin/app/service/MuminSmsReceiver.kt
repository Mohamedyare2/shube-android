package com.mumin.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.mumin.app.local.LocalPrefs
import com.mumin.app.parser.MuminSmsParser

/**
 * BroadcastReceiver for incoming SMS.
 * Extracts payment sender and triggers Mu'min foreground processing.
 */
class MuminSmsReceiver : BroadcastReceiver() {

    private val parser = MuminSmsParser()

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = LocalPrefs(context)
        if (!prefs.isLoggedIn) {
            Log.d("MuminSmsReceiver", "Operator not logged in — skipping SMS")
            return
        }

        if (!prefs.autoExecute) {
            Log.d("MuminSmsReceiver", "Auto execute disabled by operator — skipping SMS")
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val bySender = messages.groupBy { it.originatingAddress }

        for ((sender, msgs) in bySender) {
            if (sender == null) continue

            val body = msgs.joinToString("") { it.messageBody ?: "" }
            Log.d("MuminSmsReceiver", "SMS received from $sender: $body")

            val parsed = parser.parse(body, sender)
            if (parsed == null) {
                Log.d("MuminSmsReceiver", "Not an incoming payment SMS or non-matching format")
                continue
            }

            Log.d("MuminSmsReceiver", "Parsed Payment: sender=${parsed.senderNumber}, amount=${parsed.amountSls}, tx=${parsed.transactionId}")

            val serviceIntent = Intent(context, MuminForegroundService::class.java).apply {
                action = MuminForegroundService.ACTION_PROCESS_PAYMENT
                putExtra("sender_number", parsed.senderNumber)
                putExtra("amount", parsed.amountSls)
                putExtra("tx_id", parsed.transactionId)
                putExtra("sms_body", body)
            }
            context.startForegroundService(serviceIntent)
        }
    }
}

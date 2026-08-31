package com.shube.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.shube.app.parser.SmsParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.security.MessageDigest

class SmsBroadcastReceiver : BroadcastReceiver() {

    private val parser = SmsParser()
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages.isNullOrEmpty()) return

            // Group multipart messages by sender
            val msgsBySender = messages.groupBy { it.originatingAddress }
            
            for ((sender, msgs) in msgsBySender) {
                if (sender == null) continue

                // ⚠️ SECURITY: Only process SMS from Telesom's official short codes/names.
                // This prevents fake payment SMS attacks from regular numbers.
                val allowedSenders = listOf("222", "telesom", "zaad")
                if (sender.lowercase() !in allowedSenders) {
                    Log.d("SmsReceiver", "Ignored SMS from non-Telesom sender: $sender")
                    continue
                }
                
                val fullBody = msgs.joinToString("") { it.messageBody ?: "" }
                val timestamp = msgs.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
                
                Log.d("SmsReceiver", "Received Telesom SMS from $sender")
                
                val parsed = parser.parse(fullBody, sender)
                if (parsed != null) {
                    val smsHash = generateSmsHash(sender, fullBody, timestamp)
                    
                    Log.d("SmsReceiver", "Parsed Payment: ${parsed.amountSls} SLS from ${parsed.senderNumber}. Hash: $smsHash")
                    
                    // Dispatch to processing queue (WorkManager or Foreground Service)
                    processTransaction(context, parsed, fullBody, smsHash, timestamp)
                }
            }
        }
    }
    
    private fun generateSmsHash(sender: String, body: String, timestamp: Long): String {
        // Create a unique hash to prevent duplicate processing of the exact same SMS
        val input = "$sender|$body|$timestamp"
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    private fun processTransaction(
        context: Context, 
        parsed: com.shube.app.parser.ParsedSms, 
        body: String, 
        hash: String, 
        timestamp: Long
    ) {
        // In a full implementation, this would:
        // 1. Save the raw SMS to local Room DB queue
        // 2. Start/bind to GatewayForegroundService to begin the USSD workflow state machine
        
        // Example intent to start the processing service:
        val serviceIntent = Intent(context, GatewayForegroundService::class.java).apply {
            action = GatewayForegroundService.ACTION_PROCESS_SMS
            putExtra("sms_hash", hash)
            putExtra("sender", parsed.senderNumber)
            putExtra("amount", parsed.amountSls)
            putExtra("tx_id", parsed.transactionId)
            putExtra("body", body)
            putExtra("timestamp", timestamp)
        }
        
        context.startForegroundService(serviceIntent)
    }
}

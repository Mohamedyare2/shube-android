package com.shube.app.parser

import java.util.regex.Pattern

data class ParsedSms(
    val amountSls: Double,
    val currency: String,
    val senderNumber: String?,
    val transactionId: String?
)

class SmsParser {

    // These patterns would ideally be loaded from the 'sms_parser_config' Supabase table
    // and cached locally in Room for offline use. 
    // Providing default fallback patterns based on the requirement.
    
    // Matches: "SLSH1,500" or "1,500 SLS" or "SLSH 1,500"
    private val amountPattern = Pattern.compile("(?:SLSH\\s*|SLS\\s*)(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)|(?:(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*SLS)", Pattern.CASE_INSENSITIVE)
    // Matches number in parentheses: (634284015) or after "from ", "ka", or "ka heshay"
    private val senderPattern = Pattern.compile(
        """(?:\(\s*(\d{7,12})\s*\)|from\s+(\d{7,12})|ka\s+(?:heshay\s+)?(\d{7,12})|heshay\s+(\d{7,12}))""",
        Pattern.CASE_INSENSITIVE
    )
    private val txIdPattern = Pattern.compile("Tix[:\\s]*([A-Za-z0-9]+)|Ref(?:[:\\s]+)?([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE)

    fun parse(messageBody: String, sender: String): ParsedSms? {
        // Normalize whitespace and newlines for easier matching
        val normalizedBody = messageBody.replace(Regex("\\s+"), " ")

        // Prevent processing outgoing transfers
        if (normalizedBody.contains("ayaad u dirtay", ignoreCase = true) || 
            normalizedBody.contains("u dirtay", ignoreCase = true)) {
            return null
        }

        val amountMatcher = amountPattern.matcher(normalizedBody)
        if (!amountMatcher.find()) {
            return null // Cannot determine amount, invalid payment SMS
        }

        // Check the text immediately following the amount
        val textAfterAmount = normalizedBody.substring(amountMatcher.end()).trimStart()
        
        // Ensure it is an incoming payment
        val isIncoming = textAfterAmount.startsWith("ka", ignoreCase = true) || 
                         textAfterAmount.startsWith("received", ignoreCase = true) ||
                         normalizedBody.contains("ka heshay", ignoreCase = true) ||
                         normalizedBody.contains("received", ignoreCase = true)
        
        if (!isIncoming) {
            return null
        }

        val amountStr = (amountMatcher.group(1) ?: amountMatcher.group(2))?.replace(",", "") ?: return null
        val amount = amountStr.toDoubleOrNull() ?: return null
        val currency = amountMatcher.group(2)?.uppercase() ?: "SLS"

        val senderMatcher = senderPattern.matcher(messageBody)
        val rawSender = if (senderMatcher.find()) {
            senderMatcher.group(1) ?: senderMatcher.group(2) ?: senderMatcher.group(3) ?: senderMatcher.group(4)
        } else {
            // Fallback to the actual SMS sender if not found in body
            sender
        }

        // Clean and normalize sender number to standard 9-digit format (63XXXXXXX)
        val cleanSender = rawSender?.replace(Regex("""\D"""), "")?.let { raw ->
            when {
                raw.startsWith("252") && raw.length == 12 -> raw.substring(3)
                raw.startsWith("0") && raw.length == 10 -> raw.substring(1)
                raw.length == 7 -> "63$raw" // Telesom local 7-digit e.g. 4284015 -> 634284015
                else -> raw
            }
        }

        val txIdMatcher = txIdPattern.matcher(messageBody)
        val transactionId = if (txIdMatcher.find()) {
            txIdMatcher.group(1) ?: txIdMatcher.group(2)
        } else {
            null
        }

        return ParsedSms(
            amountSls = amount,
            currency = currency,
            senderNumber = cleanSender,
            transactionId = transactionId
        )
    }
}

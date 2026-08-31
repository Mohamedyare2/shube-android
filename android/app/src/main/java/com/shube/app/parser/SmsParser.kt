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
    // Matches number in parentheses: (634284015) or after "from "
    private val senderPattern = Pattern.compile("(?:\\((\\d{7,10})\\)|from\\s+(\\d{7,10}))", Pattern.CASE_INSENSITIVE)
    private val txIdPattern = Pattern.compile("Tix[:\\s]*([A-Za-z0-9]+)|Ref(?:[:\\s]+)?([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE)

    fun parse(messageBody: String, sender: String): ParsedSms? {
        val amountMatcher = amountPattern.matcher(messageBody)
        if (!amountMatcher.find()) {
            return null // Cannot determine amount, invalid payment SMS
        }

        val amountStr = (amountMatcher.group(1) ?: amountMatcher.group(2))?.replace(",", "") ?: return null
        val amount = amountStr.toDoubleOrNull() ?: return null
        val currency = amountMatcher.group(2)?.uppercase() ?: "SLS"

        val senderMatcher = senderPattern.matcher(messageBody)
        val extractedSender = if (senderMatcher.find()) {
            // group(1) = parentheses match e.g. (634284015), group(2) = "from" match
            senderMatcher.group(1) ?: senderMatcher.group(2)
        } else {
            // Fallback to the actual SMS sender if not found in body
            sender
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
            senderNumber = extractedSender,
            transactionId = transactionId
        )
    }
}

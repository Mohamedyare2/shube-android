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
    
    // Example: "You have received 5,500 SLS from 0634284015. Ref: TXN123456"
    private val amountPattern = Pattern.compile("(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*(SLS)", Pattern.CASE_INSENSITIVE)
    private val senderPattern = Pattern.compile("from\\s+(06[3-7]\\d{7})", Pattern.CASE_INSENSITIVE)
    private val txIdPattern = Pattern.compile("Ref(?:[:\\s]+)?([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE)

    fun parse(messageBody: String, sender: String): ParsedSms? {
        val amountMatcher = amountPattern.matcher(messageBody)
        if (!amountMatcher.find()) {
            return null // Cannot determine amount, invalid payment SMS
        }

        val amountStr = amountMatcher.group(1)?.replace(",", "") ?: return null
        val amount = amountStr.toDoubleOrNull() ?: return null
        val currency = amountMatcher.group(2)?.uppercase() ?: "SLS"

        val senderMatcher = senderPattern.matcher(messageBody)
        val extractedSender = if (senderMatcher.find()) {
            senderMatcher.group(1)
        } else {
            // Fallback to the actual SMS sender if not found in body
            sender
        }

        val txIdMatcher = txIdPattern.matcher(messageBody)
        val transactionId = if (txIdMatcher.find()) {
            txIdMatcher.group(1)
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

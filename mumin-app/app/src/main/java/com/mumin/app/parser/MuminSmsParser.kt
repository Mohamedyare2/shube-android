package com.mumin.app.parser

import java.util.regex.Pattern

data class ParsedPaymentSms(
    val amountSls: Double,
    val currency: String,
    val senderNumber: String?, // Payment sender phone number
    val transactionId: String?
)

/**
 * Parses payment SMS (Zaad / Telesom / Edahab) to extract:
 * 1. The payment amount (SLS or USD)
 * 2. The sender phone number (e.g. 63XXXXXXX)
 * 3. The transaction reference ID
 *
 * For Mu'min App, the senderNumber will AUTOMATICALLY and STRICTLY
 * be used as the recipient data bundle number!
 */
class MuminSmsParser {

    private val amountPattern = Pattern.compile(
        """(?:SLSH\s*|SLS\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?)|(?:(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*SLS)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches sender in parentheses: (634284015) or after "from " or "ka heshay"
    private val senderPattern = Pattern.compile(
        """(?:\((\d{7,10})\)|from\s+(\d{7,10})|ka\s+(\d{7,10}))""",
        Pattern.CASE_INSENSITIVE
    )

    private val txIdPattern = Pattern.compile(
        """Tix[:\s]*([A-Za-z0-9]+)|Ref(?:[:\s]+)?([A-Za-z0-9]+)""",
        Pattern.CASE_INSENSITIVE
    )

    fun parse(messageBody: String, smsSender: String): ParsedPaymentSms? {
        val normalizedBody = messageBody.replace(Regex("""\s+"""), " ")

        // Prevent processing outgoing transfers
        if (normalizedBody.contains("ayaad u dirtay", ignoreCase = true) ||
            normalizedBody.contains("u dirtay", ignoreCase = true)) {
            return null
        }

        val amountMatcher = amountPattern.matcher(normalizedBody)
        if (!amountMatcher.find()) {
            return null
        }

        val textAfterAmount = normalizedBody.substring(amountMatcher.end()).trimStart()
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
        val extractedSender = if (senderMatcher.find()) {
            senderMatcher.group(1) ?: senderMatcher.group(2) ?: senderMatcher.group(3)
        } else {
            smsSender
        }

        val txIdMatcher = txIdPattern.matcher(messageBody)
        val transactionId = if (txIdMatcher.find()) {
            txIdMatcher.group(1) ?: txIdMatcher.group(2)
        } else {
            null
        }

        // Clean sender number: strip any leading 0 or 252 country code to leave standard 9-digit format (63XXXXXXX)
        val cleanSender = extractedSender?.replace(Regex("""\D"""), "")?.let { raw ->
            when {
                raw.startsWith("252") && raw.length == 12 -> raw.substring(3)
                raw.startsWith("0") && raw.length == 10 -> raw.substring(1)
                else -> raw
            }
        }

        return ParsedPaymentSms(
            amountSls = amount,
            currency = currency,
            senderNumber = cleanSender,
            transactionId = transactionId
        )
    }
}

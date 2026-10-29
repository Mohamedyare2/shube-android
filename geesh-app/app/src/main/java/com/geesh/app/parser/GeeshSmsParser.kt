package com.geesh.app.parser

import android.util.Log
import java.util.Locale
import java.util.regex.Pattern

/**
 * Parsed result from a Geesh (Adeega Sarifka) SMS.
 */
data class ParsedGeeshSms(
    val amountDollar: Double,   // e.g. 5.55 (for DB)
    val amountFormatted: String, // e.g. "5*55" (for USSD)
    val tixraac: String?        // e.g. "15727885435"
)

/**
 * Parsed result from *801# Balance check dialog.
 */
data class ParsedBalance(
    val amountDollar: Double,
    val amountFormatted: String,
    val isSendable: Boolean // true if amount >= 0.12
)

/**
 * Parses incoming SMS from sender "898" and USSD *801# balance dialogs.
 */
class GeeshSmsParser {

    companion object {
        const val MINIMUM_SWEEP_AMOUNT = 0.12
    }

    // Matches the FIRST "$X" or "$X.XX" in the message
    private val amountPattern = Pattern.compile(
        """\$([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches "Tixraac: 15727885435" — captures the reference number
    private val tixraacPattern = Pattern.compile(
        """Tixraac\s*:\s*([0-9]+)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches balance dialog: "Hadhaageedu waa $0.1007"
    private val balancePattern = Pattern.compile(
        """(?:Hadhaageedu\s+waa\s+|Hadhaagaagu\s+waa\s+)?\$([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    fun parse(body: String): ParsedGeeshSms? {
        // 1. Get the sent amount (the first $ match)
        val amountMatcher = amountPattern.matcher(body)
        if (!amountMatcher.find()) {
            Log.d("GeeshParser", "No dollar amount found in SMS body")
            return null
        }
        
        val rawStr = amountMatcher.group(1) ?: return null
        val amountDouble = rawStr.toDoubleOrNull() ?: return null
        
        // 2. Format it for USSD: replace '.' with '*' (e.g. "5.55" -> "5*55")
        val amountFormatted = rawStr.replace(".", "*")

        // 3. Get Tixraac
        val tixraacMatcher = tixraacPattern.matcher(body)
        val tixraac = if (tixraacMatcher.find()) tixraacMatcher.group(1) else null

        Log.d("GeeshParser", "Final: amountDollar=\$$amountDouble, formatted=$amountFormatted, tixraac=$tixraac")
        return ParsedGeeshSms(amountDollar = amountDouble, amountFormatted = amountFormatted, tixraac = tixraac)
    }

    /**
     * Parses the USSD balance response dialog from *801#
     * Example:
     *   <-ADEEGA SARIFKA- >
     *   Xisaabtaada(8879400-252634555496)
     *   Hadhaageedu waa $0.1007
     */
    fun parseBalanceDialog(dialogText: String): ParsedBalance? {
        val matcher = balancePattern.matcher(dialogText)
        if (!matcher.find()) {
            Log.d("GeeshParser", "No dollar balance pattern found in USSD dialog: $dialogText")
            return null
        }

        val rawStr = matcher.group(1) ?: return null
        val amountDouble = rawStr.toDoubleOrNull() ?: return null

        // Telecom USSD requires at most 2 decimal places (cents)
        val normalizedStr = if (rawStr.contains(".") && rawStr.substringAfter(".").length > 2) {
            String.format(Locale.US, "%.2f", amountDouble)
        } else {
            rawStr
        }.removeSuffix(".00").removeSuffix(".0")

        val amountFormatted = normalizedStr.replace(".", "*")
        val isSendable = amountDouble >= MINIMUM_SWEEP_AMOUNT

        Log.d("GeeshParser", "Parsed Balance: \$$amountDouble (formatted: $amountFormatted, isSendable=$isSendable)")
        return ParsedBalance(
            amountDollar = amountDouble,
            amountFormatted = amountFormatted,
            isSendable = isSendable
        )
    }
}

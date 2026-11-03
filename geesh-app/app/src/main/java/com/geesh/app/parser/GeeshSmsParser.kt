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
        """\$\s*([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches "Tixraac: 15727885435" — captures the reference number
    private val tixraacPattern = Pattern.compile(
        """Tixraac\s*:\s*([0-9]+)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches balance dialog: "Hadhaageedu waa $0.1007" or "Hadhaagaagu waa $0.50" or "$0.50"
    private val balancePattern = Pattern.compile(
        """(?:Hadhaag[a-z]*\s+waa\s+|Haraag[a-z]*\s+waa\s+)?\$\s*([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    /**
     * Checks if the SMS is strictly an incoming "ADEEGA SARIFKA" exchange message.
     * Must contain "ADEEGA SARIFKA", "u sariftay", and must NOT be an outgoing transfer.
     */
    fun isAdeegaSarifka(body: String): Boolean {
        val upper = body.uppercase()

        // 1. Must contain "ADEEGA SARIFKA"
        val hasSarifka = upper.contains("ADEEGA SARIFKA") || upper.contains("ADEEGA SARRIFKA") || upper.contains("SARIFKA")
        if (!hasSarifka) {
            return false
        }

        // 2. Reject regular ZAAD DOLLAR if no SARIFKA
        if (upper.contains("ZAAD DOLLAR") && !upper.contains("ADEEGA SARIFKA")) {
            return false
        }

        // 3. Reject any outgoing transfer confirmation messages to avoid double sending
        if (upper.contains("U WAREEJISAY") ||
            upper.contains("U DIRTAY") ||
            upper.contains("AYAAD U DIRTAY") ||
            upper.contains("DHIGATAY") ||
            upper.contains("KU SHUBTAY")) {
            Log.d("GeeshParser", "SMS ignored: Outgoing transfer confirmation, not an incoming exchange")
            return false
        }

        // 4. Must strictly contain "u sariftay" (the distinct signature of an incoming customer exchange)
        val hasSariftay = upper.contains("U SARIFTAY") || upper.contains("U SARRIFTAY") || upper.contains("SARIFTAY")
        if (!hasSariftay) {
            Log.d("GeeshParser", "SMS ignored: Missing 'u sariftay' keyword")
            return false
        }

        return true
    }

    fun parse(body: String): ParsedGeeshSms? {
        // Enforce incoming ADEEGA SARIFKA check
        if (!isAdeegaSarifka(body)) {
            Log.d("GeeshParser", "SMS ignored: Not an incoming ADEEGA SARIFKA transaction")
            return null
        }

        // 1. Get the sent amount directly from "Waxaad $X u sariftay"
        val sariftayMatcher = Pattern.compile(
            """Waxaad\s+\$([0-9]+(?:\.[0-9]+)?)\s+u\s+sariftay""",
            Pattern.CASE_INSENSITIVE
        ).matcher(body)

        val rawStr = if (sariftayMatcher.find()) {
            sariftayMatcher.group(1)
        } else {
            // Fallback to the first dollar amount
            val amountMatcher = amountPattern.matcher(body)
            if (amountMatcher.find()) amountMatcher.group(1) else null
        } ?: return null

        val amountDouble = rawStr.toDoubleOrNull() ?: return null

        // 2. Format it for USSD: replace '.' with '*' (e.g. "5.55" -> "5*55")
        val amountFormatted = rawStr.replace(".", "*")

        // 3. Get Tixraac (mandatory)
        val tixraacMatcher = tixraacPattern.matcher(body)
        val tixraac = if (tixraacMatcher.find()) tixraacMatcher.group(1) else null

        if (tixraac.isNullOrBlank()) {
            Log.w("GeeshParser", "SMS ignored: Tixraac missing from Adeega Sarifka SMS")
            return null
        }

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
        val rawDouble = rawStr.toDoubleOrNull() ?: return null

        // Round down (floor) to 2 decimal places to avoid sweeping more than available
        val amountDouble = (Math.floor(rawDouble * 100.0) / 100.0)

        // Telecom USSD formatting
        val formattedStr = if (amountDouble % 1.0 == 0.0) {
            amountDouble.toLong().toString()
        } else {
            String.format(Locale.US, "%.2f", amountDouble).trimEnd('0').trimEnd('.')
        }

        val amountFormatted = formattedStr.replace(".", "*")
        val isSendable = amountDouble >= MINIMUM_SWEEP_AMOUNT

        Log.d("GeeshParser", "Parsed Balance: \$$amountDouble (raw: $rawDouble, formatted: $amountFormatted, isSendable=$isSendable)")
        return ParsedBalance(
            amountDollar = amountDouble,
            amountFormatted = amountFormatted,
            isSendable = isSendable
        )
    }
}

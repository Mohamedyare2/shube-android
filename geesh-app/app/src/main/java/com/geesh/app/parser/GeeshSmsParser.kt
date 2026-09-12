package com.geesh.app.parser

import android.util.Log
import java.util.regex.Pattern

/**
 * Parsed result from a Geesh (Adeega Sarifka) SMS.
 */
data class ParsedGeeshSms(
    val amountDollar: Double,   // e.g. 2.0  (from "$2")
    val tixraac: String?        // e.g. "15727885435" (unique transaction ID)
)

/**
 * Parses incoming SMS from sender "898" to extract dollar amount and Tixraac.
 *
 * Expected format (Somali):
 *   [‑[‑ADEEGA SARIFKA‑]‑]
 *   Tixraac: 15727885435,
 *   Waxaad $2 u sariftay SLSH22,000CABDIRAXIIN DAHIR MAXAMUUD(252636859785).
 *
 * Key extraction rules:
 *  - Amount: the number immediately after the "$" sign
 *  - Tixraac: the number after "Tixraac:" label
 */
class GeeshSmsParser {

    // Matches "$5" or "$2.50" etc. — captures just the numeric part
    private val amountPattern = Pattern.compile(
        """\$([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    // Matches "Tixraac: 15727885435" — captures the reference number
    private val tixraacPattern = Pattern.compile(
        """Tixraac\s*:\s*([0-9]+)""",
        Pattern.CASE_INSENSITIVE
    )

    fun parse(body: String): ParsedGeeshSms? {
        val amountMatcher = amountPattern.matcher(body)
        if (!amountMatcher.find()) {
            Log.d("GeeshParser", "No dollar amount found in SMS body")
            return null
        }

        val amountStr = amountMatcher.group(1) ?: return null
        val amount = amountStr.toDoubleOrNull() ?: return null

        val tixraacMatcher = tixraacPattern.matcher(body)
        val tixraac = if (tixraacMatcher.find()) tixraacMatcher.group(1) else null

        Log.d("GeeshParser", "Parsed: amount=\$$amount, tixraac=$tixraac")
        return ParsedGeeshSms(amountDollar = amount, tixraac = tixraac)
    }
}

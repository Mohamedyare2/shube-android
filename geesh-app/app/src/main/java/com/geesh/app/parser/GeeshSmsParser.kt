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
 *   [-[-ADEEGA SARIFKA-]-]
 *   Tixraac: 15727885435,
 *   Waxaad $2 u sariftay SLSH22,000CABDIRAXIIN DAHIR MAXAMUUD(252636859785).
 *
 *   OR balance message:
 *   [-ADEEGA SARIFKA-]
 *   Waxaad $3 ku shubtey bank account-kaaga: 644XXX41, Hadhaagaaga waa $0.89.
 *
 * Key extraction rules:
 *  - Amount: reads "Hadhaagaaga waa $X" first (remaining balance).
 *            Falls back to the first "$X" in SMS if Hadhaaga not found.
 *            Only the INTEGER part is used: $4.3 -> 4, $0.89 -> 0
 *  - Tixraac: the number after "Tixraac:" label
 */
class GeeshSmsParser {

    // Matches "Hadhaagaaga waa $0.89" — captures the numeric part after "$"
    private val hadhaagaPattern = Pattern.compile(
        """Hadhaagaaga\s+waa\s+\$([0-9]+(?:\.[0-9]+)?)""",
        Pattern.CASE_INSENSITIVE
    )

    // Fallback: Matches "$5" or "$2.50" — captures just the numeric part
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
        // 1. Try to read Hadhaagaaga (remaining balance) first
        val hadhaagaMatcher = hadhaagaPattern.matcher(body)
        val amountRaw: Double?

        if (hadhaagaMatcher.find()) {
            val str = hadhaagaMatcher.group(1) ?: return null
            amountRaw = str.toDoubleOrNull()
            Log.d("GeeshParser", "Hadhaaga found: \$$amountRaw")
        } else {
            // 2. Fall back to first "$X" in the message
            val amountMatcher = amountPattern.matcher(body)
            if (!amountMatcher.find()) {
                Log.d("GeeshParser", "No dollar amount found in SMS body")
                return null
            }
            val str = amountMatcher.group(1) ?: return null
            amountRaw = str.toDoubleOrNull()
            Log.d("GeeshParser", "Fallback amount found: \$$amountRaw")
        }

        if (amountRaw == null) return null

        // Integer part only: $4.3 -> 4, $0.89 -> 0
        val amount = Math.floor(amountRaw)

        val tixraacMatcher = tixraacPattern.matcher(body)
        val tixraac = if (tixraacMatcher.find()) tixraacMatcher.group(1) else null

        Log.d("GeeshParser", "Final: amount=\$$amount (raw=\$$amountRaw), tixraac=$tixraac")
        return ParsedGeeshSms(amountDollar = amount, tixraac = tixraac)
    }
}

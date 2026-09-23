package com.geesh.app.parser

import android.util.Log
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
 * Parses incoming SMS from sender "898" to extract dollar amount and Tixraac.
 *
 * Expected format (Somali):
 *   [-[-ADEEGA SARIFKA-]-]
 *   Tixraac: 15727885435,
 *   Waxaad $2 u sariftay SLSH22,000CABDIRAXIIN DAHIR MAXAMUUD(252636859785).
 *
 *   OR
 *   [-[-ADEEGA SARIFKA-]-]
 *   Tixraac: 15727923334,
 *   Waxaad $0.5 u sariftay...
 */
class GeeshSmsParser {

    // Matches the FIRST "$X" or "$X.XX" in the message (which is the sent amount)
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
}

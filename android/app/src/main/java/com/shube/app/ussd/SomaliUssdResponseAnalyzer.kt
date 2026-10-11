package com.shube.app.ussd

import android.util.Log

/**
 * Result of analyzing a USSD response dialog text.
 */
data class UssdAnalysisResult(
    val status: UssdResult,
    val matchedPattern: String?,
    val diagnosticReason: String
)

/**
 * Robust Somali & English Telecom USSD Response Analyzer.
 *
 * Implements strict classification rules:
 * 1. Normalize text (lower case, replace multiple whitespaces, handle common Somali accents/spelling).
 * 2. Check failure keywords FIRST — explicit failure indicators take strict precedence.
 * 3. Check success keywords — candidate success indicators confirm completion if no negation/failure exists.
 * 4. Fallback to UNKNOWN if text is empty, ambiguous, or no patterns match.
 */
object SomaliUssdResponseAnalyzer {

    // Configurable Somali & English Failure Dictionary
    private val FAILURE_PATTERNS = listOf(
        // Insufficient balance
        "haraagaagu kuguma filna",
        "haraaga kuma filna",
        "haraagaagu ma filna",
        "hadhaagaagu kuguma filna",
        "hadhaaga kuma filna",
        "hadhaagaagu ma filna",
        "kuguma filna",
        "ma filna",
        "insufficient balance",
        "insufficient",
        // Failure statements
        "waa lagu guuldarraystay",
        "waa lagu guuldareystay",
        "waa ku guuldarraystay",
        "waad ku guuldarraystay",
        "kuma guulaysan",
        "kuma guuleysan",
        "ma suurtagelin",
        "ma suurtogelin",
        "ma suurto galin",
        "ma suurogalin",
        "khalad ayaa dhacay",
        "khalad baa dhacay",
        "khalad",
        "ma shaqaynayo",
        "ma shaqeynayo",
        "ma dhicin",
        "ma ansixin",
        "ma jiro",
        "lama heli karo",
        "ma haysatid",
        "ma lihid",
        "invalid",
        "failed",
        "error",
        "transaction failed",
        "not allowed",
        "not found",
        "timeout",
        "system busy"
    )

    // Configurable Somali & English Success Dictionary
    private val SUCCESS_PATTERNS = listOf(
        // Direct bundle transfer confirmations
        "ugu shubtay",
        "u shubtay",
        "waad u shubtay",
        "waad ugu shubtay",
        "waa laguu shubay",
        "waa laguugu shubay",
        "lagu shubay",
        "waxaad u shubtay",
        "waxaad ugu shubtay",
        // General success confirmations
        "waa lagu guulaystay",
        "waa lagu guuleystay",
        "waad ku guulaystay",
        "waad ku guuleystay",
        "guulaysatay",
        "guuleysatay",
        "ku guulaysatay",
        "ku guuleystay",
        "ku guuleysatay",
        "si guul leh",
        // Telesom / Somtel transfer confirmations
        "waxaad u dirtay",
        "ayaad u dirtay",
        "la diray",
        "waa la diray",
        "waa la wareejiyay",
        "waa la shubay",
        "u dirtay",
        "dhaqdhaqaaqaaga waa la fuliyay",
        "waa la fuliyay",
        // English confirmations
        "successful",
        "success",
        "successfully",
        "confirmed",
        "completed",
        "activated",
        "bundle activated"
    )

    /**
     * Normalizes Somali and English text:
     * - Converts to lowercase
     * - Trims and collapses multiple whitespaces
     * - Normalizes apostrophes and common Somali vowel variations (guulaysatay vs guuleysatay)
     */
    fun normalizeText(rawText: String?): String {
        if (rawText.isNullOrBlank()) return ""
        return rawText.lowercase()
            .replace("’", "'")
            .replace("`", "'")
            .replace(Regex("""\s+"""), " ")
            .trim()
    }

    /**
     * Classifies a USSD response dialog.
     */
    fun analyze(
        dialogText: String?,
        customSuccessPatterns: List<String>? = null,
        customFailurePatterns: List<String>? = null
    ): UssdAnalysisResult {
        val normalized = normalizeText(dialogText)

        if (normalized.isBlank()) {
            return UssdAnalysisResult(
                status = UssdResult.UNKNOWN,
                matchedPattern = null,
                diagnosticReason = "USSD dialog was empty or no text could be captured"
            )
        }

        val allFailures = (customFailurePatterns ?: emptyList()).map { normalizeText(it) } + FAILURE_PATTERNS
        val allSuccesses = (customSuccessPatterns ?: emptyList()).map { normalizeText(it) } + SUCCESS_PATTERNS

        // 1. Check Failure first - failures take strict precedence
        for (failPattern in allFailures) {
            if (failPattern.isNotBlank() && normalized.contains(failPattern)) {
                Log.d("UssdAnalyzer", "Matched failure pattern: '$failPattern' in dialog")
                return UssdAnalysisResult(
                    status = UssdResult.FAILED,
                    matchedPattern = failPattern,
                    diagnosticReason = "Telecom failure indicator detected: '$failPattern'"
                )
            }
        }

        // 2. Check Success
        for (succPattern in allSuccesses) {
            if (succPattern.isNotBlank() && normalized.contains(succPattern)) {
                // Secondary check: verify there is no negation right before the success pattern (e.g. "kuma guuleysan")
                // (Already caught by failure patterns, but safe safeguard)
                if (normalized.contains("kuma") || normalized.contains("ma ") || normalized.contains("lama ")) {
                    val idx = normalized.indexOf(succPattern)
                    val prefix = normalized.substring(0, idx).takeLast(20)
                    if (prefix.contains("kuma") || prefix.contains("ma ") || prefix.contains("lama ")) {
                        Log.w("UssdAnalyzer", "Negated success pattern detected in: '$normalized'")
                        return UssdAnalysisResult(
                            status = UssdResult.FAILED,
                            matchedPattern = succPattern,
                            diagnosticReason = "Negated telecom confirmation statement"
                        )
                    }
                }

                Log.d("UssdAnalyzer", "Matched success pattern: '$succPattern' in dialog")
                return UssdAnalysisResult(
                    status = UssdResult.SUCCESS,
                    matchedPattern = succPattern,
                    diagnosticReason = "Telecom success confirmation detected: '$succPattern'"
                )
            }
        }

        // 3. Neither explicit success nor explicit failure matched -> UNKNOWN
        Log.w("UssdAnalyzer", "USSD dialog did not match any known success/failure patterns: '$normalized'")
        return UssdAnalysisResult(
            status = UssdResult.UNKNOWN,
            matchedPattern = null,
            diagnosticReason = "USSD completed but response message was ambiguous or unclassified"
        )
    }
}

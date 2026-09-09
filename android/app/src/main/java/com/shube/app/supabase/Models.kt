package com.shube.app.supabase

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Matches the `bundle_rules` table in Supabase.
 */
@Serializable
data class BundleRule(
    val id: String,
    @SerialName("amount_sls") val amountSls: Double,
    @SerialName("bundle_name") val bundleName: String,
    @SerialName("data_amount") val dataAmount: Double,
    @SerialName("data_unit") val dataUnit: String,
    @SerialName("ussd_option") val ussdOption: String,
    @SerialName("ussd_code") val ussdCode: String,
    @SerialName("ussd_replies") val ussdReplies: List<String> = emptyList(),
    val active: Boolean = true
)

/**
 * Matches the `customers` table in Supabase.
 */
@Serializable
data class Customer(
    val id: String,
    @SerialName("telesom_number") val telesomNumber: String,
    @SerialName("somtel_number") val somtelNumber: String,
    val active: Boolean = true
)

/**
 * Payload to INSERT into the `transactions` table.
 * Column names MUST match 001_schema.sql exactly — extra fields cause Supabase to reject the INSERT.
 */
@Serializable
data class TransactionInsert(
    @SerialName("operator_id")    val operatorId: String,
    @SerialName("device_id")      val deviceId: String,
    @SerialName("telesom_number") val telesomNumber: String,
    @SerialName("somtel_number")  val somtelNumber: String?,
    @SerialName("amount_sls")     val amountSls: Double,
    @SerialName("sms_hash")       val smsHash: String,
    @SerialName("bundle_rule_id") val bundleRuleId: String?,
    @SerialName("sms_body")       val smsBody: String? = null,
    @SerialName("test_mode")      val testMode: Boolean = false,
    val status: String = "processing"
    // NOTE: customer_id and notes are NOT columns in the transactions table — do NOT add them
)

/**
 * Payload to UPDATE the `transactions` row after USSD execution.
 * Only includes columns that actually exist in the DB schema.
 * status MUST be lowercase to match the DB CHECK constraint.
 */
@Serializable
data class TransactionUpdate(
    val status: String,
    @SerialName("failure_reason") val failureReason: String? = null,
    @SerialName("completed_at")   val completedAt: String? = null
    // NOTE: "notes" is NOT a column in transactions table
)

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
    @SerialName("sender_phone") val senderPhone: String,
    @SerialName("somtel_number") val somtelNumber: String,
    val active: Boolean = true
)

/**
 * Payload to INSERT into the `transactions` table.
 */
@Serializable
data class TransactionInsert(
    @SerialName("operator_id") val operatorId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("customer_id") val customerId: String?,
    @SerialName("sender_number") val senderNumber: String,
    @SerialName("somtel_number") val somtelNumber: String?,
    @SerialName("amount_sls") val amountSls: Double,
    @SerialName("bundle_name") val bundleName: String?,
    @SerialName("ussd_code") val ussdCode: String?,
    @SerialName("sms_hash") val smsHash: String,
    val status: String = "PROCESSING",
    val notes: String? = null
)

/**
 * Payload to UPDATE the `transactions` row after USSD execution.
 */
@Serializable
data class TransactionUpdate(
    val status: String,
    val notes: String? = null
)

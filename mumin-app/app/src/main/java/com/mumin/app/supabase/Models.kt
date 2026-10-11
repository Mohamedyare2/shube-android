package com.mumin.app.supabase

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BundleRule(
    val id: String,
    @SerialName("bundle_name")
    val bundleName: String,
    @SerialName("amount_sls")
    val amountSls: Double,
    @SerialName("ussd_code")
    val ussdCode: String,
    @SerialName("ussd_option")
    val ussdOption: String? = null,
    val active: Boolean = true,
    @SerialName("created_by")
    val createdBy: String? = null
)

@Serializable
data class TransactionInsert(
    @SerialName("operator_id")
    val operatorId: String,
    @SerialName("device_id")
    val deviceId: String? = null,
    @SerialName("telesom_number")
    val telesomNumber: String,
    @SerialName("somtel_number")
    val somtelNumber: String,
    @SerialName("amount_sls")
    val amountSls: Double,
    @SerialName("bundle_rule_id")
    val bundleRuleId: String? = null,
    @SerialName("sms_hash")
    val smsHash: String? = null,
    @SerialName("sms_body")
    val smsBody: String? = null,
    @SerialName("test_mode")
    val testMode: Boolean = false,
    val status: String = "processing"
)

@Serializable
data class TransactionUpdate(
    val status: String,
    @SerialName("failure_reason")
    val failureReason: String? = null,
    @SerialName("completed_at")
    val completedAt: String? = null
)

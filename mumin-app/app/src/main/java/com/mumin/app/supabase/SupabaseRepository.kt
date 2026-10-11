package com.mumin.app.supabase

import android.util.Log
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SupabaseRepository {

    private val client get() = SupabaseService.serviceClient

    /**
     * Retrieves active bundle rules for this operator.
     */
    suspend fun getBundleRules(operatorId: String, profileId: String?): List<BundleRule> = withContext(Dispatchers.IO) {
        try {
            val filterId = profileId ?: operatorId
            client.postgrest["bundle_rules"]
                .select {
                    filter {
                        eq("active", true)
                        eq("created_by", filterId)
                    }
                }
                .decodeList<BundleRule>()
        } catch (e: Exception) {
            Log.e("MuminRepo", "getBundleRules error: ${e.message}", e)
            emptyList()
        }
    }

    /**
     * Finds the active bundle rule matching the given SLS amount exactly.
     */
    suspend fun getBundleByAmount(amountSls: Double, operatorId: String, profileId: String?): BundleRule? = withContext(Dispatchers.IO) {
        try {
            val filterId = profileId ?: operatorId
            val result = client.postgrest["bundle_rules"]
                .select {
                    filter {
                        eq("active", true)
                        eq("amount_sls", amountSls)
                        eq("created_by", filterId)
                    }
                    limit(1)
                }
                .decodeList<BundleRule>()
            result.firstOrNull()
        } catch (e: Exception) {
            Log.e("MuminRepo", "getBundleByAmount error: ${e.message}", e)
            null
        }
    }

    /**
     * Creates a new transaction record.
     */
    suspend fun createTransaction(payload: TransactionInsert): String? = withContext(Dispatchers.IO) {
        try {
            val result = client.postgrest["transactions"]
                .insert(payload) {
                    select(Columns.list("id"))
                }
                .decodeSingle<Map<String, String>>()
            result["id"]
        } catch (e: Exception) {
            Log.e("MuminRepo", "createTransaction error: ${e.message}", e)
            null
        }
    }

    /**
     * Updates transaction status.
     */
    suspend fun updateTransactionStatus(
        transactionId: String,
        status: String,
        notes: String? = null,
        completedAt: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            client.postgrest["transactions"]
                .update(TransactionUpdate(
                    status = status,
                    failureReason = if (status in listOf("failed", "ussd_interaction_required", "unknown_result", "invalid_amount")) notes else null,
                    completedAt = completedAt
                )) {
                    filter { eq("id", transactionId) }
                }
            true
        } catch (e: Exception) {
            Log.e("MuminRepo", "updateTransactionStatus error: ${e.message}", e)
            false
        }
    }
}

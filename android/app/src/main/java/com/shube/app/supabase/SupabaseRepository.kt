package com.shube.app.supabase

import android.util.Log
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Provides all Supabase database operations needed by the gateway.
 * Uses the anon key — RLS policies enforce what each user can access.
 */
object SupabaseRepository {

    private val client get() = SupabaseService.client

    // ─────────────────────────────────────────────────────────────
    // BUNDLE RULES
    // ─────────────────────────────────────────────────────────────

    /**
     * Finds the active bundle rule matching the given SLS amount exactly.
     * Returns the first match, or null if no matching rule exists.
     */
    suspend fun getBundleByAmount(amountSls: Double): BundleRule? = withContext(Dispatchers.IO) {
        try {
            val result = client.postgrest["bundle_rules"]
                .select {
                    filter {
                        eq("active", true)
                        eq("amount_sls", amountSls)
                    }
                    limit(1)
                }
                .decodeList<BundleRule>()
            result.firstOrNull()
        } catch (e: Exception) {
            Log.e("SupabaseRepo", "getBundleByAmount error: ${e.message}", e)
            null
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CUSTOMERS
    // ─────────────────────────────────────────────────────────────

    /**
     * Looks up a customer by the phone number that sent the Hormuud/Somtel payment SMS.
     */
    suspend fun getCustomerBySender(senderPhone: String): Customer? = withContext(Dispatchers.IO) {
        try {
            val result = client.postgrest["customers"]
                .select {
                    filter {
                        eq("telesom_number", senderPhone)
                        eq("active", true)
                    }
                    limit(1)
                }
                .decodeList<Customer>()
            result.firstOrNull()
        } catch (e: Exception) {
            Log.e("SupabaseRepo", "getCustomerBySender error: ${e.message}", e)
            null
        }
    }

    // ─────────────────────────────────────────────────────────────
    // TRANSACTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Creates a new transaction row with status = "PROCESSING".
     * Returns the new row's id, or null on failure.
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
            Log.e("SupabaseRepo", "createTransaction error: ${e.message}", e)
            null
        }
    }

    /**
     * Updates a transaction's status and optional notes after USSD execution.
     * status should be one of: "SUCCESS", "FAILED", "UNKNOWN"
     */
    suspend fun updateTransactionStatus(
        transactionId: String,
        status: String,
        notes: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            client.postgrest["transactions"]
                .update(TransactionUpdate(status = status, notes = notes)) {
                    filter { eq("id", transactionId) }
                }
            true
        } catch (e: Exception) {
            Log.e("SupabaseRepo", "updateTransactionStatus error: ${e.message}", e)
            false
        }
    }
}

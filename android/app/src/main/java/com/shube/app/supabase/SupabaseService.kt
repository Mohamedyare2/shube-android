package com.shube.app.supabase

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseService {

    private const val SUPABASE_URL = "https://eabwhgujwywwiormujrr.supabase.co"
    private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzE4OTAsImV4cCI6MjEwMjU0Nzg5MH0.Evq9rRYECPnwe2rU-a7FJ8-Ygwk1YKzcEDeWXkyzjMg"

    /**
     * Service key received at pair time.
     * Call initServiceClient() after setting this.
     */
    @Volatile
    var serviceKey: String? = null

    /**
     * Anon client — used only for auth, not for DB writes.
     */
    val client: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = SUPABASE_ANON_KEY
        ) {
            install(Auth) {
                autoLoadFromStorage = true
                alwaysAutoRefresh = true
            }
            install(Postgrest)
            install(Realtime)
        }
    }

    /**
     * Service-role client — used by SupabaseRepository for all DB writes.
     * Initialized once via initServiceClient() after pairing.
     * Falls back to anon client before pairing (reads only).
     */
    @Volatile
    private var _serviceClient: SupabaseClient? = null

    val serviceClient: SupabaseClient
        get() = _serviceClient ?: client

    /**
     * Call this once after receiving the service key from the pair endpoint.
     * Idempotent — re-calling with the same key is a no-op.
     */
    fun initServiceClient(key: String) {
        if (_serviceClient != null && serviceKey == key) return
        serviceKey = key
        _serviceClient = createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = key
        ) {
            install(Postgrest)
        }
    }
}

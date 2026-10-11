package com.mumin.app.supabase

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseService {

    private const val SUPABASE_URL = "https://eabwhgujwywwiormujrr.supabase.co"
    private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzE4OTAsImV4cCI6MjEwMjU0Nzg5MH0.Evq9rRYECPnwe2rU-a7FJ8-Ygwk1YKzcEDeWXkyzjMg"
    private const val SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYndoZ3Vqd3l3d2lvcm11anJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk3MTg5MCwiZXhwIjoyMTAyNTQ3ODkwfQ.K96uB97UeRImTRQtoaNTPTN3pdgUkMqeAjwlzhnbEIM"

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

    val serviceClient: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = SUPABASE_SERVICE_ROLE_KEY
        ) {
            install(Postgrest)
        }
    }
}

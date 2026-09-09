package com.shube.app

import android.app.Application
import com.shube.app.local.DevicePreferences
import com.shube.app.supabase.SupabaseService

class ShubeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Restore saved Supabase service key so DB writes work after app restart
        val prefs = DevicePreferences.getInstance(this)
        prefs.supabaseServiceKey?.let { key ->
            SupabaseService.initServiceClient(key)
        }
    }
}


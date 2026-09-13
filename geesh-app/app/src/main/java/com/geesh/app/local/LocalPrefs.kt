package com.geesh.app.local

import android.content.Context
import android.content.SharedPreferences

class LocalPrefs(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("geesh_prefs", Context.MODE_PRIVATE)

    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(value) = prefs.edit().putString("access_token", value).apply()

    var username: String?
        get() = prefs.getString("username", null)
        set(value) = prefs.edit().putString("username", value).apply()

    var ussdTemplate: String?
        get() = prefs.getString("ussd_template", null)
        set(value) = prefs.edit().putString("ussd_template", value).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000"
        set(value) = prefs.edit().putString("base_url", value).apply()
        
    fun clear() {
        prefs.edit().clear().apply()
    }
}

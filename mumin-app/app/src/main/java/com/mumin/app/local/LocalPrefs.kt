package com.mumin.app.local

import android.content.Context
import android.content.SharedPreferences

class LocalPrefs(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("mumin_prefs", Context.MODE_PRIVATE)

    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(value) = prefs.edit().putString("access_token", value).apply()

    var username: String?
        get() = prefs.getString("username", null)
        set(value) = prefs.edit().putString("username", value).apply()

    var operatorId: String?
        get() = prefs.getString("operator_id", null)
        set(value) = prefs.edit().putString("operator_id", value).apply()

    var profileId: String?
        get() = prefs.getString("profile_id", null)
        set(value) = prefs.edit().putString("profile_id", value).apply()

    var deviceId: String?
        get() = prefs.getString("device_id", null)
        set(value) = prefs.edit().putString("device_id", value).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", "https://shube.vercel.app") ?: "https://shube.vercel.app"
        set(value) = prefs.edit().putString("base_url", value).apply()

    var ussdPin: String?
        get() = prefs.getString("ussd_pin", null)
        set(value) = prefs.edit().putString("ussd_pin", value).apply()

    var autoExecute: Boolean
        get() = prefs.getBoolean("auto_execute", true)
        set(value) = prefs.edit().putBoolean("auto_execute", value).apply()

    val isLoggedIn: Boolean
        get() = !accessToken.isNullOrBlank() && !operatorId.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }
}

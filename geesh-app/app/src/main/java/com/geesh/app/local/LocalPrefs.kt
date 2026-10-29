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

    /**
     * Active payment mode:
     *  "CARD" = Card / Direct USSD
     *  "BANK" = Bank Account (*800#)
     * When one is turned ON, the other turns OFF.
     */
    var paymentMode: String
        get() = prefs.getString("payment_mode", "CARD") ?: "CARD"
        set(value) = prefs.edit().putString("payment_mode", value).apply()

    /**
     * USSD Template — stored from server on login or edited locally.
     * Format: *806*{number}*{lacag}*{pin}#
     */
    var ussdTemplate: String?
        get() = prefs.getString("ussd_template", null)
        set(value) = prefs.edit().putString("ussd_template", value).apply()

    /**
     * Optional reply to send after the USSD dialog appears in Card mode.
     */
    var ussdReply: String?
        get() = prefs.getString("ussd_reply", null)
        set(value) = prefs.edit().putString("ussd_reply", value).apply()

    /**
     * Bank mode: Initial PIN (Reply 1)
     */
    var bankInitialPin: String?
        get() = prefs.getString("bank_initial_pin", null)
        set(value) = prefs.edit().putString("bank_initial_pin", value).apply()

    /**
     * Bank mode: Bank Secret PIN (Reply 6)
     */
    var bankPin: String?
        get() = prefs.getString("bank_pin", null)
        set(value) = prefs.edit().putString("bank_pin", value).apply()

    /**
     * Auto Check Balance & Sweep Settings (*801# fallback when no SMS arrives)
     */
    var autoCheckBalanceEnabled: Boolean
        get() = prefs.getBoolean("auto_check_balance_enabled", false)
        set(value) = prefs.edit().putBoolean("auto_check_balance_enabled", value).apply()

    var checkBalanceIntervalMinutes: Int
        get() = prefs.getInt("check_balance_interval_minutes", 10)
        set(value) = prefs.edit().putInt("check_balance_interval_minutes", value).apply()

    var balanceCheckPin: String?
        get() = prefs.getString("balance_check_pin", null)
        set(value) = prefs.edit().putString("balance_check_pin", value).apply()

    var lastSmsReceivedTimestamp: Long
        get() = prefs.getLong("last_sms_received_timestamp", System.currentTimeMillis())
        set(value) = prefs.edit().putLong("last_sms_received_timestamp", value).apply()

    /**
     * App Lock Screen Security Settings (Protects phone & app without blocking USSD)
     */
    var appLockEnabled: Boolean
        get() = prefs.getBoolean("app_lock_enabled", false)
        set(value) = prefs.edit().putBoolean("app_lock_enabled", value).apply()

    var appLockPin: String?
        get() = prefs.getString("app_lock_pin", null)
        set(value) = prefs.edit().putString("app_lock_pin", value).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", "https://admin.shube.so") ?: "https://admin.shube.so"
        set(value) = prefs.edit().putString("base_url", value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }
}

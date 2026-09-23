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
     * USSD Template — stored from server on login.
     * Format: *806*{number}*{lacag}*{pin}#
     * All parts except *806* and {lacag} are optional.
     * Examples:
     *   *806*{number}*{lacag}*{pin}#       (full)
     *   *806*{number}*{lacag}#             (no pin)
     *   *806*{lacag}#                      (no number, no pin)
     */
    var ussdTemplate: String?
        get() = prefs.getString("ussd_template", null)
        set(value) = prefs.edit().putString("ussd_template", value).apply()

    /**
     * Optional single reply to send after the USSD dialog appears.
     * If null or empty — no reply is sent (user entered nothing on server).
     */
    var ussdReply: String?
        get() = prefs.getString("ussd_reply", null)
        set(value) = prefs.edit().putString("ussd_reply", value).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", "https://admin.shube.so") ?: "https://admin.shube.so"
        set(value) = prefs.edit().putString("base_url", value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }
}

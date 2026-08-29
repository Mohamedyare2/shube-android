package com.shube.app.local

import android.content.Context
import android.content.SharedPreferences

/**
 * Stores device pairing state and server configuration.
 * Persists across app restarts so the operator doesn't need to re-pair every time.
 */
class DevicePreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("shube_device_prefs", Context.MODE_PRIVATE)

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var operatorId: String?
        get() = prefs.getString(KEY_OPERATOR_ID, null)
        set(value) = prefs.edit().putString(KEY_OPERATOR_ID, value).apply()

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value.trimEnd('/')).apply()

    var deviceName: String
        get() = prefs.getString(KEY_DEVICE_NAME, "My Worker Phone") ?: "My Worker Phone"
        set(value) = prefs.edit().putString(KEY_DEVICE_NAME, value).apply()

    val isPaired: Boolean
        get() = deviceId != null

    fun clearPairing() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_OPERATOR_ID)
            .apply()
    }

    companion object {
        private const val KEY_DEVICE_ID   = "device_id"
        private const val KEY_OPERATOR_ID = "operator_id"
        private const val KEY_SERVER_URL  = "server_url"
        private const val KEY_DEVICE_NAME = "device_name"

        // Change this to your computer's local IP when testing on the same WiFi
        // Example: "http://192.168.1.105:5050"
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:5050" // Android emulator localhost

        @Volatile private var instance: DevicePreferences? = null

        fun getInstance(context: Context): DevicePreferences {
            return instance ?: synchronized(this) {
                instance ?: DevicePreferences(context.applicationContext).also { instance = it }
            }
        }
    }
}

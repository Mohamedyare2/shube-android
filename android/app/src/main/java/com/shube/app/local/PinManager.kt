package com.shube.app.local

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PinManager(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "shube_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _isPinSet = MutableStateFlow(hasPin())
    val isPinSet: StateFlow<Boolean> = _isPinSet.asStateFlow()

    fun savePin(pin: String) {
        sharedPreferences.edit().putString(KEY_USSD_PIN, pin).apply()
        _isPinSet.value = true
    }

    fun getPin(): String? {
        return sharedPreferences.getString(KEY_USSD_PIN, null)
    }
    
    fun hasPin(): Boolean {
        return sharedPreferences.contains(KEY_USSD_PIN)
    }

    fun clearPin() {
        sharedPreferences.edit().remove(KEY_USSD_PIN).apply()
        _isPinSet.value = false
    }

    companion object {
        private const val KEY_USSD_PIN = "ussd_pin"
        
        @Volatile
        private var instance: PinManager? = null

        fun getInstance(context: Context): PinManager {
            return instance ?: synchronized(this) {
                instance ?: PinManager(context.applicationContext).also { instance = it }
            }
        }
    }
}

package com.shube.app.network

import android.content.Context
import android.os.BatteryManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.shube.app.local.DevicePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class PairResult(
    val success: Boolean,
    val deviceId: String? = null,
    val operatorId: String? = null,
    val error: String? = null
)

data class HeartbeatResult(
    val success: Boolean,
    val error: String? = null
)

/**
 * HTTP client for the SHUBE Admin API.
 * Handles device pairing and heartbeat reporting.
 */
class ApiService(private val context: Context) {

    private val prefs = DevicePreferences.getInstance(context)

    /**
     * Calls POST /api/devices/pair with the 6-digit pairing code.
     * On success, the device_id and operator_id are returned.
     */
    suspend fun pairDevice(pairingCode: String, serverUrl: String): PairResult =
        withContext(Dispatchers.IO) {
            try {
                val url = URL("$serverUrl/api/devices/pair")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000

                val body = JSONObject().put("pairing_code", pairingCode).toString()
                conn.outputStream.bufferedWriter().use { it.write(body) }

                val code = conn.responseCode
                val response = if (code in 200..299)
                    conn.inputStream.bufferedReader().readText()
                else
                    conn.errorStream?.bufferedReader()?.readText() ?: "{}"

                Log.d("ApiService", "pair response $code: $response")
                conn.disconnect()

                if (code == 200) {
                    val json = JSONObject(response)
                    PairResult(
                        success = json.optBoolean("success", false),
                        deviceId = json.optString("device_id").takeIf { it.isNotEmpty() },
                        operatorId = json.optString("operator_id").takeIf { it.isNotEmpty() }
                    )
                } else {
                    val json = JSONObject(response)
                    PairResult(success = false, error = json.optString("error", "Unknown error"))
                }
            } catch (e: Exception) {
                Log.e("ApiService", "pair error: ${e.message}")
                PairResult(success = false, error = "Could not reach server: ${e.message}")
            }
        }

    /**
     * Sends POST /api/devices/heartbeat with battery level and network type.
     * Called every 60 seconds by HeartbeatWorker.
     */
    suspend fun sendHeartbeat(deviceId: String): HeartbeatResult =
        withContext(Dispatchers.IO) {
            try {
                val serverUrl = prefs.serverUrl
                val url = URL("$serverUrl/api/devices/heartbeat")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 8_000
                conn.readTimeout = 8_000

                val battery = getBatteryLevel()
                val network = getNetworkType()

                val body = JSONObject()
                    .put("device_id", deviceId)
                    .put("battery_level", battery)
                    .put("network_type", network)
                    .toString()

                conn.outputStream.bufferedWriter().use { it.write(body) }

                val code = conn.responseCode
                conn.disconnect()

                Log.d("ApiService", "heartbeat $code — battery=$battery network=$network")
                HeartbeatResult(success = code in 200..299)
            } catch (e: Exception) {
                Log.w("ApiService", "heartbeat error: ${e.message}")
                HeartbeatResult(success = false, error = e.message)
            }
        }

    private fun getBatteryLevel(): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun getNetworkType(): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return "OFFLINE"
        val caps = cm.getNetworkCapabilities(network) ?: return "OFFLINE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> getCellularType(caps)
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Unknown"
        }
    }

    private fun getCellularType(caps: NetworkCapabilities): String {
        // Approximate via bandwidth
        val downMbps = caps.linkDownstreamBandwidthKbps / 1000
        return when {
            downMbps >= 100 -> "4G"
            downMbps >= 10 -> "3G"
            else -> "2G"
        }
    }

    companion object {
        @Volatile private var instance: ApiService? = null
        fun getInstance(context: Context): ApiService {
            return instance ?: synchronized(this) {
                instance ?: ApiService(context.applicationContext).also { instance = it }
            }
        }
    }
}

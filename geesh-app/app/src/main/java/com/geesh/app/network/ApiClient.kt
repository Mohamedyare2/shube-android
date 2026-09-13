package com.geesh.app.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

object ApiClient {
    private val client = OkHttpClient()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun login(url: String, username: String, password: String, deviceId: String): Result<JSONObject> {
        return withContext(Dispatchers.IO) {
            try {
                val jsonBody = JSONObject().apply {
                    put("username", username)
                    put("password", password)
                    put("device_identifier", deviceId)
                    put("device_name", android.os.Build.MODEL)
                }

                val request = Request.Builder()
                    .url("$url/api/geesh/login")
                    .post(jsonBody.toString().toRequestBody(JSON))
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string() ?: ""
                    if (!response.isSuccessful) {
                        val errorMsg = try {
                            JSONObject(responseBody).getString("error")
                        } catch (e: Exception) {
                            "Login failed: ${response.code}"
                        }
                        Result.failure(Exception(errorMsg))
                    } else {
                        Result.success(JSONObject(responseBody))
                    }
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}

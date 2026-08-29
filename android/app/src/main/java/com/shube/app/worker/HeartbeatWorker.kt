package com.shube.app.worker

import android.content.Context
import android.util.Log
import androidx.work.*
import com.shube.app.local.DevicePreferences
import com.shube.app.network.ApiService
import java.util.concurrent.TimeUnit

/**
 * WorkManager periodic task — runs every 60 seconds.
 * Sends battery level and network type to the Admin API.
 * Keeps running even when the app is in the background or screen is off.
 */
class HeartbeatWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val prefs = DevicePreferences.getInstance(applicationContext)
        val deviceId = prefs.deviceId

        if (deviceId == null) {
            Log.w("HeartbeatWorker", "No device ID — skipping heartbeat")
            return Result.success()
        }

        val api = ApiService.getInstance(applicationContext)
        val result = api.sendHeartbeat(deviceId)

        return if (result.success) {
            Log.d("HeartbeatWorker", "Heartbeat sent OK")
            Result.success()
        } else {
            Log.w("HeartbeatWorker", "Heartbeat failed: ${result.error}")
            Result.retry() // Will retry on next schedule
        }
    }

    companion object {
        private const val WORK_NAME = "shube_heartbeat"

        /**
         * Schedules periodic heartbeat — call this once after pairing.
         * WorkManager ensures it keeps running even after device restarts.
         */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(
                repeatInterval = 1,
                repeatIntervalTimeUnit = TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.LINEAR,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP, // Don't restart if already running
                request
            )

            Log.d("HeartbeatWorker", "Heartbeat scheduled every 1 minute")
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Log.d("HeartbeatWorker", "Heartbeat cancelled")
        }
    }
}

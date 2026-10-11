package com.shube.app.ussd

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.util.Log
import com.shube.app.local.PinManager
import com.shube.app.service.UssdAccessibilityService
import com.shube.app.service.UssdDialogEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

data class UssdStep(
    val type: String,
    val ussdCodeTemplate: String? = null,
    val timeoutMs: Long = 10000,
    val value: String? = null,
    val successPatterns: List<String>? = null,
    val failurePatterns: List<String>? = null
)

enum class UssdResult {
    SUCCESS,
    FAILED,
    UNKNOWN,
    INTERACTION_REQUIRED
}

data class UssdExecutionOutcome(
    val result: UssdResult,
    val rawResponseText: String?,
    val diagnosticReason: String
)

class UssdStateMachine(private val context: Context) {
    
    private val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val pinManager = PinManager.getInstance(context)
    private val handler = Handler(Looper.getMainLooper())
    
    /**
     * Executes the USSD workflow steps and returns structured outcome with raw response.
     * 
     * @param steps The configured steps from the database
     * @param somtelNumber The destination number
     * @param bundleOption The USSD bundle option (e.g., '05')
     * @param transactionStartTime Timestamp when this specific transaction began
     * @return UssdExecutionOutcome with classification, raw dialog text, and diagnostic reason
     */
    suspend fun executeWorkflow(
        steps: List<UssdStep>,
        somtelNumber: String,
        bundleOption: String,
        transactionStartTime: Long = System.currentTimeMillis()
    ): UssdExecutionOutcome {
        
        Log.d("UssdStateMachine", "Starting workflow with ${steps.size} steps for $somtelNumber")
        
        // Ensure accessibility service is running if we have multi-step flows
        if (steps.size > 1 && !UssdAccessibilityService.isServiceActive) {
            Log.e("UssdStateMachine", "Accessibility service is not active, cannot complete multi-step USSD")
            return UssdExecutionOutcome(
                result = UssdResult.INTERACTION_REQUIRED,
                rawResponseText = null,
                diagnosticReason = "Accessibility service not active"
            )
        }

        var lastCapturedDialogText: String? = null
        var lastCapturedTimestamp: Long = 0L

        try {
            for ((index, step) in steps.withIndex()) {
                Log.d("UssdStateMachine", "Executing Step ${index + 1}: ${step.type}")
                
                when (step.type) {
                    "DIAL" -> {
                        val template = step.ussdCodeTemplate 
                            ?: return UssdExecutionOutcome(
                                result = UssdResult.FAILED,
                                rawResponseText = null,
                                diagnosticReason = "DIAL step missing USSD template"
                            ).also { Log.e("UssdStateMachine", "DIAL step missing template") }
                        
                        val codeToDial = template
                            .replace("{bundle_option}", bundleOption)
                            .replace("{somtel_number}", somtelNumber)
                            .replace("{pin}", pinManager.getPin() ?: "")
                            
                        Log.d("UssdStateMachine", "Dialing: $codeToDial")
                        
                        val success = dialUssd(codeToDial)
                        if (!success) {
                            Log.e("UssdStateMachine", "Failed to initiate USSD dial")
                            return UssdExecutionOutcome(
                                result = UssdResult.INTERACTION_REQUIRED,
                                rawResponseText = null,
                                diagnosticReason = "CALL_PHONE permission not granted or call failed"
                            )
                        }
                    }
                    
                    "WAIT_RESPONSE" -> {
                        val event = waitForDialog(step.timeoutMs, transactionStartTime)
                        lastCapturedDialogText = event.text
                        lastCapturedTimestamp = event.timestamp
                        Log.d("UssdStateMachine", "Received dialog: ${event.text}")
                    }
                    
                    "ENTER_NUMBER" -> {
                        UssdAccessibilityService.nextReply = somtelNumber
                        val event = waitForDialog(step.timeoutMs, transactionStartTime)
                        lastCapturedDialogText = event.text
                        lastCapturedTimestamp = event.timestamp
                    }
                    
                    "ENTER_PIN" -> {
                        val pin = pinManager.getPin()
                        if (pin.isNullOrBlank()) {
                            Log.e("UssdStateMachine", "PIN not configured")
                            return UssdExecutionOutcome(
                                result = UssdResult.FAILED,
                                rawResponseText = null,
                                diagnosticReason = "PIN not configured on device"
                            )
                        }
                        UssdAccessibilityService.nextReply = pin
                        val event = waitForDialog(step.timeoutMs, transactionStartTime)
                        lastCapturedDialogText = event.text
                        lastCapturedTimestamp = event.timestamp
                    }
                    
                    "SEND_REPLY" -> {
                        val rawReply = step.value ?: "1" // Default confirm
                        val reply = rawReply
                            .replace("{somtel_number}", somtelNumber)
                            .replace("{numberka}", somtelNumber)
                            .replace("{number}", somtelNumber)
                            .replace("{bundle_option}", bundleOption)
                            .replace("{pin}", pinManager.getPin() ?: "00000")
                        Log.d("UssdStateMachine", "Sending USSD reply: $reply (template: $rawReply)")
                        UssdAccessibilityService.nextReply = reply
                        val event = waitForDialog(step.timeoutMs, transactionStartTime)
                        lastCapturedDialogText = event.text
                        lastCapturedTimestamp = event.timestamp
                    }
                    
                    "READ_RESPONSE" -> {
                        // Wait for the final outcome dialog to appear after the last reply was sent
                        try {
                            val event = waitForDialog(step.timeoutMs, transactionStartTime)
                            lastCapturedDialogText = event.text
                            lastCapturedTimestamp = event.timestamp
                            Log.d("UssdStateMachine", "Final response text captured: ${event.text}")
                        } catch (e: TimeoutCancellationException) {
                            Log.w("UssdStateMachine", "Timeout waiting for explicit READ_RESPONSE dialog, using last captured text")
                        }
                        
                        val analysis = SomaliUssdResponseAnalyzer.analyze(
                            dialogText = lastCapturedDialogText,
                            customSuccessPatterns = step.successPatterns,
                            customFailurePatterns = step.failurePatterns
                        )

                        return UssdExecutionOutcome(
                            result = analysis.status,
                            rawResponseText = lastCapturedDialogText,
                            diagnosticReason = analysis.diagnosticReason
                        )
                    }
                }
            }
            
            // If the steps did not have an explicit READ_RESPONSE step, analyze whatever final dialog was seen
            val fallbackAnalysis = SomaliUssdResponseAnalyzer.analyze(
                dialogText = lastCapturedDialogText
            )
            
            return UssdExecutionOutcome(
                result = fallbackAnalysis.status,
                rawResponseText = lastCapturedDialogText,
                diagnosticReason = fallbackAnalysis.diagnosticReason
            )
            
        } catch (e: TimeoutCancellationException) {
            Log.e("UssdStateMachine", "USSD step timed out")
            return UssdExecutionOutcome(
                result = UssdResult.UNKNOWN,
                rawResponseText = lastCapturedDialogText,
                diagnosticReason = "USSD session timed out without receiving expected response"
            )
        } catch (e: Exception) {
            Log.e("UssdStateMachine", "Error during USSD execution", e)
            return UssdExecutionOutcome(
                result = UssdResult.UNKNOWN,
                rawResponseText = lastCapturedDialogText,
                diagnosticReason = "Exception during USSD execution: ${e.message}"
            )
        }
    }
    
    private fun dialUssd(code: String): Boolean {
        return try {
            if (context.checkSelfPermission(android.Manifest.permission.CALL_PHONE) != 
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return false
            }
            
            val encodedCode = android.net.Uri.encode(code)
            
            val intent = android.content.Intent(android.content.Intent.ACTION_CALL).apply {
                data = android.net.Uri.parse("tel:$encodedCode")
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            }
            
            context.startActivity(intent)
            Log.d("UssdStateMachine", "Dialed USSD via ACTION_CALL: $code")
            true
        } catch (e: Exception) {
            Log.e("UssdStateMachine", "Exception in dialUssd", e)
            false
        }
    }
    
    /**
     * Waits for a dialog event that arrived AFTER the current transaction started.
     * Prevents picking up stale dialogs from prior transactions.
     */
    private suspend fun waitForDialog(timeoutMs: Long, minTimestamp: Long): UssdDialogEvent {
        return withTimeout(timeoutMs) {
            UssdAccessibilityService.ussdDialogFlow.first { event ->
                event.timestamp >= (minTimestamp - 1000) // 1 second clock skew tolerance
            }
        }
    }
}

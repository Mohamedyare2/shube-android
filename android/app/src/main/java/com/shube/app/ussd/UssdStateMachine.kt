package com.shube.app.ussd

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.util.Log
import com.shube.app.local.PinManager
import com.shube.app.service.UssdAccessibilityService
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

class UssdStateMachine(private val context: Context) {
    
    private val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val pinManager = PinManager.getInstance(context)
    private val handler = Handler(Looper.getMainLooper())
    
    /**
     * Executes the USSD workflow steps.
     * 
     * @param steps The configured steps from the database
     * @param somtelNumber The destination number
     * @param bundleOption The USSD bundle option (e.g., '05')
     * @return UssdResult indicating the final outcome
     */
    suspend fun executeWorkflow(
        steps: List<UssdStep>,
        somtelNumber: String,
        bundleOption: String
    ): UssdResult {
        
        Log.d("UssdStateMachine", "Starting workflow with ${steps.size} steps")
        
        // Ensure accessibility service is running if we have multi-step flows
        if (steps.size > 1 && !UssdAccessibilityService.isServiceActive) {
            Log.e("UssdStateMachine", "Accessibility service is not active, cannot complete multi-step USSD")
            return UssdResult.INTERACTION_REQUIRED
        }

        var currentDialogText = ""

        try {
            for ((index, step) in steps.withIndex()) {
                Log.d("UssdStateMachine", "Executing Step ${index + 1}: ${step.type}")
                
                when (step.type) {
                    "DIAL" -> {
                        val template = step.ussdCodeTemplate 
                            ?: return UssdResult.FAILED.also { Log.e("UssdStateMachine", "DIAL step missing template") }
                        
                        val codeToDial = template
                            .replace("{bundle_option}", bundleOption)
                            .replace("{somtel_number}", somtelNumber)
                            
                        Log.d("UssdStateMachine", "Dialing: $codeToDial")
                        
                        val success = dialUssd(codeToDial)
                        if (!success) {
                            Log.e("UssdStateMachine", "Failed to initiate USSD dial")
                            return UssdResult.INTERACTION_REQUIRED
                        }
                    }
                    
                    "WAIT_RESPONSE" -> {
                        currentDialogText = waitForDialog(step.timeoutMs)
                        Log.d("UssdStateMachine", "Received dialog: $currentDialogText")
                    }
                    
                    "ENTER_NUMBER" -> {
                        UssdAccessibilityService.nextReply = somtelNumber
                        currentDialogText = waitForDialog(step.timeoutMs)
                    }
                    
                    "ENTER_PIN" -> {
                        val pin = pinManager.getPin()
                        if (pin.isNullOrBlank()) {
                            Log.e("UssdStateMachine", "PIN not configured")
                            return UssdResult.FAILED
                        }
                        UssdAccessibilityService.nextReply = pin
                        currentDialogText = waitForDialog(step.timeoutMs)
                    }
                    
                    "SEND_REPLY" -> {
                        val reply = step.value ?: "1" // Default confirm
                        UssdAccessibilityService.nextReply = reply
                        currentDialogText = waitForDialog(step.timeoutMs)
                    }
                    
                    "READ_RESPONSE" -> {
                        // The previous step's reply resulted in this dialog text
                        Log.d("UssdStateMachine", "Final response text: $currentDialogText")
                        
                        val isSuccess = step.successPatterns?.any { 
                            currentDialogText.contains(it, ignoreCase = true) 
                        } == true
                        
                        val isFailure = step.failurePatterns?.any { 
                            currentDialogText.contains(it, ignoreCase = true) 
                        } == true
                        
                        return when {
                            isSuccess -> UssdResult.SUCCESS
                            isFailure -> UssdResult.FAILED
                            else -> UssdResult.UNKNOWN
                        }
                    }
                }
            }
            
            return UssdResult.SUCCESS // Reached end without returning
            
        } catch (e: TimeoutCancellationException) {
            Log.e("UssdStateMachine", "USSD step timed out")
            return UssdResult.UNKNOWN
        } catch (e: Exception) {
            Log.e("UssdStateMachine", "Error during USSD execution", e)
            return UssdResult.UNKNOWN
        }
    }
    
    private fun dialUssd(code: String): Boolean {
        return try {
            // Check permission before dialing
            if (context.checkSelfPermission(android.Manifest.permission.CALL_PHONE) != 
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return false
            }
            
            // For API 26+
            val callback = object : TelephonyManager.UssdResponseCallback() {
                override fun onReceiveUssdResponse(
                    telephonyManager: TelephonyManager?,
                    request: String?,
                    response: CharSequence?
                ) {
                    Log.d("UssdStateMachine", "onReceiveUssdResponse: $response")
                }

                override fun onReceiveUssdResponseFailed(
                    telephonyManager: TelephonyManager?,
                    request: String?,
                    failureCode: Int
                ) {
                    Log.e("UssdStateMachine", "onReceiveUssdResponseFailed code: $failureCode")
                }
            }
            
            telephonyManager.sendUssdRequest(code, callback, handler)
            true
        } catch (e: Exception) {
            Log.e("UssdStateMachine", "Exception in sendUssdRequest", e)
            false
        }
    }
    
    private suspend fun waitForDialog(timeoutMs: Long): String {
        return withTimeout(timeoutMs) {
            UssdAccessibilityService.ussdDialogFlow.first()
        }
    }
}

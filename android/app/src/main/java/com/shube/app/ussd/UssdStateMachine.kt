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
                            .replace("{pin}", pinManager.getPin() ?: "")
                            
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
                        val rawReply = step.value ?: "1" // Default confirm
                        val reply = rawReply
                            .replace("{somtel_number}", somtelNumber)
                            .replace("{numberka}", somtelNumber)
                            .replace("{number}", somtelNumber)
                            .replace("{bundle_option}", bundleOption)
                            .replace("{pin}", pinManager.getPin() ?: "00000")
                        Log.d("UssdStateMachine", "Sending USSD reply: $reply (template: $rawReply)")
                        UssdAccessibilityService.nextReply = reply
                        currentDialogText = waitForDialog(step.timeoutMs)
                    }
                    
                    "READ_RESPONSE" -> {
                        // The previous step's reply resulted in this dialog text
                        Log.d("UssdStateMachine", "Final response text: $currentDialogText")
                        
                        val defaultSuccessPatterns = listOf(
                            "ku guuleystay", "lagu shubay", "guul", "guuleystay", "u shubtay",
                            "successful", "success", "confirmed", "done", "ok", "haragaagu waa", "haraagaaga cusub"
                        )
                        val defaultFailurePatterns = listOf(
                            "haraagaagu kuguma filna", "ma haysatid", "khalad", "ma shaqaynayo",
                            "failed", "error", "insufficient", "invalid", "not found", "lama heli karo"
                        )

                        val allSuccess = (step.successPatterns ?: emptyList()) + defaultSuccessPatterns
                        val allFailure = (step.failurePatterns ?: emptyList()) + defaultFailurePatterns

                        val isSuccess = allSuccess.any { 
                            currentDialogText.contains(it, ignoreCase = true) 
                        }
                        
                        val isFailure = allFailure.any { 
                            currentDialogText.contains(it, ignoreCase = true) 
                        }
                        
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
            
            // Encode the USSD code (especially the '#' at the end which must become '%23')
            // Otherwise Android treats it as a URI fragment and drops it, causing 'Invalid MMI Code'
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
    
    private suspend fun waitForDialog(timeoutMs: Long): String {
        return withTimeout(timeoutMs) {
            UssdAccessibilityService.ussdDialogFlow.first()
        }
    }
}

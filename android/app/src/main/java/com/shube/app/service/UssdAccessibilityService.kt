package com.shube.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

/**
 * Fallback USSD automation service for devices that do not fully support 
 * multi-step interaction via TelephonyManager.sendUssdRequest().
 * 
 * IMPORTANT: This requires the operator to manually enable the accessibility 
 * service in Android Settings.
 */
data class UssdDialogEvent(
    val text: String,
    val timestamp: Long = System.currentTimeMillis()
)

class UssdAccessibilityService : AccessibilityService() {

    companion object {
        // Shared flow to emit parsed USSD dialog events back to the State Machine
        private val _ussdDialogFlow = MutableSharedFlow<UssdDialogEvent>(extraBufferCapacity = 10)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()
        
        // Command channel to tell this service what to reply (if applicable)
        var nextReply: String? = null
        
        // Lock to prevent multiple accessibility events for the same dialog from triggering duplicate actions
        @Volatile
        var isProcessingDialog = false
        
        var isServiceActive = false
            private set

        fun emitDialog(text: String) {
            _ussdDialogFlow.tryEmit(UssdDialogEvent(text = text))
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        }
        serviceInfo = info
        isServiceActive = true
        Log.d("UssdAccessibility", "Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // We are looking for dialogs, typically from the phone app or system UI
        val className = event.className?.toString() ?: return
        
        val isDialogEvent = className.contains("Dialog", ignoreCase = true) ||
                            className.contains("AlertDialog", ignoreCase = true) ||
                            className.contains("Ussd", ignoreCase = true) ||
                            className.contains("Phone", ignoreCase = true) ||
                            event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED

        // Common USSD dialog class names (varies heavily by OEM)
        if (isDialogEvent) {
            if (isProcessingDialog) return // Ignore redundant events for the same dialog while we process it

            val rootNode = rootInActiveWindow ?: return
            
            val dialogText = extractTextFromNode(rootNode)
            
            // Ignore system loading dialogs (e.g., "USSD code running...", "MMI code started")
            // If we process these, the state machine will advance prematurely and skip replies!
            val lowerText = dialogText.lowercase()
            if (lowerText.contains("running") || lowerText.contains("mmi") || lowerText.contains("wait")) {
                Log.d("UssdAccessibility", "Ignoring system loading dialog: $dialogText")
                return
            }

            if (dialogText.isNotBlank()) {
                Log.d("UssdAccessibility", "Intercepted USSD Dialog: $dialogText")
                
                // If the state machine gave us a reply to enter:
                if (nextReply != null) {
                    val reply = nextReply!!
                    nextReply = null
                    isProcessingDialog = true
                    
                    CoroutineScope(Dispatchers.Main).launch {
                        Log.d("UssdAccessibility", "Polling for EditText (up to 15s)...")
                        // Active polling loop up to 15 seconds (every 250ms, 60 attempts) to ensure EditText is ready
                        var targetNode: AccessibilityNodeInfo? = null
                        var attempts = 0
                        while (attempts < 60) {
                            delay(250)
                            val freshNode = rootInActiveWindow
                            if (freshNode != null) {
                                val editTexts = freshNode.findAccessibilityNodeInfosByViewId("android:id/input")
                                val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(freshNode)
                                if (targetEdit != null) {
                                    targetNode = freshNode
                                    break
                                }
                            }
                            attempts++
                        }

                        if (targetNode != null) {
                            val success = fillAndSubmitDialog(targetNode, reply)
                            Log.d("UssdAccessibility", "Submit reply success: $success after ${attempts * 250}ms")
                        } else {
                            val freshNode = rootInActiveWindow ?: rootNode
                            val success = fillAndSubmitDialog(freshNode, reply)
                            Log.w("UssdAccessibility", "Fallback submit reply success: $success after 15s timeout")
                        }
                        
                        // Emit to state machine AFTER we finish so it doesn't advance prematurely
                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))
                        
                        // Small delay before releasing lock to prevent immediate re-trigger by closing animation
                        delay(500)
                        isProcessingDialog = false
                    }
                } else {
                    isProcessingDialog = true
                    
                    // Just reading a final response, attempt to click OK/Dismiss
                    clickButton(rootNode, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH", "KA SAAR", "HAA"))
                    
                    // Emit immediately since there is no reply
                    _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))
                    
                    CoroutineScope(Dispatchers.Main).launch {
                        delay(500)
                        isProcessingDialog = false
                    }
                }
            }
        }
    }

    private fun extractTextFromNode(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = java.lang.StringBuilder()
        if (node.text != null) {
            sb.append(node.text).append("\n")
        }
        for (i in 0 until node.childCount) {
            sb.append(extractTextFromNode(node.getChild(i)))
        }
        return sb.toString()
    }
    
    private suspend fun fillAndSubmitDialog(node: AccessibilityNodeInfo, text: String): Boolean {
        // Find EditText
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input") // Common ID
        val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(node)
        
        if (targetEdit != null) {
            val arguments = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            
            // Wait slightly after writing the text before clicking send
            delay(500)
            
            // Find Send/OK button
            return clickButton(node, listOf("SEND", "OK", "REPLY"))
        }
        return false
    }
    
    private fun findEditTextFallback(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.className?.toString()?.contains("EditText") == true) return node
        for (i in 0 until node.childCount) {
            val res = findEditTextFallback(node.getChild(i))
            if (res != null) return res
        }
        return null
    }

    private fun clickButton(node: AccessibilityNodeInfo, labels: List<String>): Boolean {
        // Try standard Android button IDs first
        val standardIds = listOf("android:id/button1", "com.android.phone:id/button1")
        for (id in standardIds) {
            val buttons = node.findAccessibilityNodeInfosByViewId(id)
            for (button in buttons) {
                if (button.isClickable) {
                    button.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                }
            }
        }
        for (label in labels) {
            val buttons = node.findAccessibilityNodeInfosByText(label)
            for (button in buttons) {
                if (button.isClickable) {
                    button.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                } else {
                    // Sometimes the parent is the clickable element
                    if (button.parent?.isClickable == true) {
                        button.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        return true
                    }
                }
            }
        }
        return false
    }

    override fun onInterrupt() {
        Log.w("UssdAccessibility", "Service interrupted")
    }

    override fun onDestroy() {
        isServiceActive = false
        Log.d("UssdAccessibility", "Service unbound")
        super.onDestroy()
    }
}

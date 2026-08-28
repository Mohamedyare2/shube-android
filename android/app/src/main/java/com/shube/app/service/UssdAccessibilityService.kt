package com.shube.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Fallback USSD automation service for devices that do not fully support 
 * multi-step interaction via TelephonyManager.sendUssdRequest().
 * 
 * IMPORTANT: This requires the operator to manually enable the accessibility 
 * service in Android Settings.
 */
class UssdAccessibilityService : AccessibilityService() {

    companion object {
        // Shared flow to emit parsed USSD dialog text back to the State Machine
        private val _ussdDialogFlow = MutableSharedFlow<String>(extraBufferCapacity = 5)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()
        
        // Command channel to tell this service what to reply (if applicable)
        var nextReply: String? = null
        
        var isServiceActive = false
            private set
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
        
        // Common USSD dialog class names (varies heavily by OEM)
        if (className.contains("Dialog") || className.contains("AlertDialog")) {
            val rootNode = rootInActiveWindow ?: return
            
            val dialogText = extractTextFromNode(rootNode)
            if (dialogText.isNotBlank()) {
                Log.d("UssdAccessibility", "Intercepted USSD Dialog: $dialogText")
                _ussdDialogFlow.tryEmit(dialogText)
                
                // If the state machine gave us a reply to enter:
                if (nextReply != null) {
                    val reply = nextReply!!
                    nextReply = null
                    
                    // Attempt to find EditText and enter text, then click Send/OK
                    val success = fillAndSubmitDialog(rootNode, reply)
                    Log.d("UssdAccessibility", "Submit reply success: $success")
                } else {
                    // Just reading a final response, attempt to click OK/Dismiss
                    clickButton(rootNode, listOf("OK", "DISMISS", "CANCEL", "DONE"))
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
    
    private fun fillAndSubmitDialog(node: AccessibilityNodeInfo, text: String): Boolean {
        // Find EditText
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input") // Common ID
        val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(node)
        
        if (targetEdit != null) {
            val arguments = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            
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

    override fun onUnbind(intent: Intent?): Boolean {
        isServiceActive = false
        Log.d("UssdAccessibility", "Service unbound")
        return super.onUnbind(intent)
    }
}

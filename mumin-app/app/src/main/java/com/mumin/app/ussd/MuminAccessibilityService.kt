package com.mumin.app.ussd

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

/**
 * Listens for USSD dialog windows and automatically interacts with them.
 */
class MuminAccessibilityService : AccessibilityService() {

    companion object {
        private val _ussdDialogFlow = MutableSharedFlow<String>(extraBufferCapacity = 10)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        @Volatile
        var nextReply: String? = null

        @Volatile
        var isProcessingDialog = false

        var isServiceActive = false
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        }
        isServiceActive = true
        Log.d("MuminAccessibility", "Mu'min Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val className = event.className?.toString() ?: return

        if (className.contains("Dialog") || className.contains("AlertDialog")) {
            if (isProcessingDialog) return

            val rootNode = rootInActiveWindow ?: return
            val dialogText = extractText(rootNode)
            val lower = dialogText.lowercase()

            // Skip progress dialogs
            if (lower.contains("running") || lower.contains("mmi") || lower.contains("wait")) {
                return
            }

            if (dialogText.isBlank()) return

            Log.d("MuminAccessibility", "USSD Dialog: $dialogText")

            val reply = nextReply
            if (reply != null) {
                nextReply = null
                isProcessingDialog = true

                CoroutineScope(Dispatchers.Main).launch {
                    delay(1500)
                    val freshNode = rootInActiveWindow
                    if (freshNode != null) {
                        fillAndSubmit(freshNode, reply)
                    }
                    _ussdDialogFlow.tryEmit(dialogText)
                    delay(500)
                    isProcessingDialog = false
                }
            } else {
                isProcessingDialog = true
                clickButton(rootNode, listOf("OK", "DISMISS", "CANCEL", "DONE"))
                _ussdDialogFlow.tryEmit(dialogText)

                CoroutineScope(Dispatchers.Main).launch {
                    delay(500)
                    isProcessingDialog = false
                }
            }
        }
    }

    private fun extractText(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        if (node.text != null) sb.append(node.text).append("\n")
        for (i in 0 until node.childCount) sb.append(extractText(node.getChild(i)))
        return sb.toString()
    }

    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input")
        val target = if (editTexts.isNotEmpty()) editTexts[0] else findEditText(node) ?: return false

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(300)

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_input", text))
        delay(200)

        var pasted = target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        delay(300)

        val currentText = target.text?.toString() ?: ""
        if (currentText.isBlank()) {
            val bundle = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
            delay(300)
        }

        return clickButton(node, listOf("SEND", "Send", "OK", "Ok", "REPLY", "Reply"))
    }

    private fun findEditText(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.className?.toString()?.contains("EditText") == true) return node
        for (i in 0 until node.childCount) {
            val r = findEditText(node.getChild(i))
            if (r != null) return r
        }
        return null
    }

    private fun clickButton(node: AccessibilityNodeInfo, labels: List<String>): Boolean {
        for (label in labels) {
            val buttons = node.findAccessibilityNodeInfosByText(label)
            for (btn in buttons) {
                if (btn.isClickable) { btn.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
                if (btn.parent?.isClickable == true) { btn.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
            }
        }
        return false
    }

    override fun onInterrupt() {
        Log.w("MuminAccessibility", "Mu'min Accessibility interrupted")
    }

    override fun onDestroy() {
        isServiceActive = false
        super.onDestroy()
    }
}

package com.geesh.app.ussd

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
 * Listens for USSD dialog windows and automatically enters the PIN reply (3495).
 *
 * Flow:
 *   1. App dials *806*0633920307*{amount}*2050#
 *   2. Phone shows a USSD dialog asking for PIN
 *   3. This service detects that dialog, waits 2 s for it to settle,
 *      then types the PIN (3495) and presses SEND.
 *   4. Final confirmation text is emitted via ussdDialogFlow so the
 *      calling coroutine can record the result.
 */
class GeeshAccessibilityService : AccessibilityService() {

    companion object {
        // Flow to receive the text of any USSD dialog that appears
        private val _ussdDialogFlow = MutableSharedFlow<String>(extraBufferCapacity = 5)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        // The reply the service should type the next time a dialog appears
        var nextReply: String? = null

        // Guard against the same dialog firing multiple accessibility events
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
        Log.d("GeeshAccessibility", "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val className = event.className?.toString() ?: return

        if (className.contains("Dialog") || className.contains("AlertDialog")) {
            if (isProcessingDialog) return

            val rootNode = rootInActiveWindow ?: return
            val dialogText = extractText(rootNode)
            val lower = dialogText.lowercase()

            // Skip system "processing…" dialogs — they don't need a reply
            if (lower.contains("running") || lower.contains("mmi") || lower.contains("wait")) {
                Log.d("GeeshAccessibility", "Skipping loading dialog: $dialogText")
                return
            }

            if (dialogText.isBlank()) return

            Log.d("GeeshAccessibility", "USSD Dialog detected: $dialogText")

            val reply = nextReply
            if (reply != null) {
                // We have a reply to enter (PIN: 3495)
                nextReply = null
                isProcessingDialog = true

                CoroutineScope(Dispatchers.Main).launch {
                    Log.d("GeeshAccessibility", "Waiting 2 s for dialog to settle before entering PIN...")
                    delay(2000)

                    val freshNode = rootInActiveWindow
                    if (freshNode != null) {
                        val ok = fillAndSubmit(freshNode, reply)
                        Log.d("GeeshAccessibility", "PIN entry result: $ok")
                    } else {
                        Log.e("GeeshAccessibility", "No window node available after delay")
                    }

                    _ussdDialogFlow.tryEmit(dialogText)

                    delay(500)
                    isProcessingDialog = false
                }
            } else {
                // No pending reply — this is the final confirmation. Just dismiss.
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

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun extractText(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        if (node.text != null) sb.append(node.text).append("\n")
        for (i in 0 until node.childCount) sb.append(extractText(node.getChild(i)))
        return sb.toString()
    }

    /**
     * Enters [text] (the user's PIN) into the USSD reply dialog and presses Send.
     *
     * Strategy (most-to-least reliable on real devices):
     *  1. Find the EditText → focus it → copy [text] to clipboard → paste
     *  2. If paste didn't populate the field, fall back to ACTION_SET_TEXT
     *  3. Click SEND / OK button
     */
    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        // ── 1. Find the input field ──────────────────────────────────────────
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input")
        val target = if (editTexts.isNotEmpty()) editTexts[0] else findEditText(node)

        if (target == null) {
            Log.e("GeeshAccessibility", "No EditText found in USSD dialog — cannot enter PIN")
            return false
        }

        // ── 2. Focus the field ───────────────────────────────────────────────
        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(300)

        // ── 3. Copy PIN to clipboard ─────────────────────────────────────────
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("pin", text))
        Log.d("GeeshAccessibility", "PIN copied to clipboard: $text")
        delay(200)

        // ── 4. Paste into field ──────────────────────────────────────────────
        val pasted = target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        Log.d("GeeshAccessibility", "Paste action result: $pasted")
        delay(300)

        // ── 5. Fallback: if paste didn't work, use ACTION_SET_TEXT ───────────
        val currentText = target.text?.toString() ?: ""
        if (currentText.isBlank()) {
            Log.d("GeeshAccessibility", "Paste didn't populate field — trying ACTION_SET_TEXT")
            val bundle = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
            delay(300)
        }

        // ── 6. Click SEND ────────────────────────────────────────────────────
        val sent = clickButton(node, listOf("SEND", "Send", "OK", "Ok", "REPLY", "Reply"))
        Log.d("GeeshAccessibility", "Send button clicked: $sent")
        return sent
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

    override fun onInterrupt() { Log.w("GeeshAccessibility", "Service interrupted") }

    override fun onDestroy() {
        isServiceActive = false
        super.onDestroy()
    }
}

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
import java.util.Collections

/**
 * Listens for USSD dialog windows and automatically enters the replies (single or multi-step).
 *
 * Supports:
 *   1. Single reply (Card USSD mode)
 *   2. Multi-step replies (Bank mode: *800# -> PIN -> 5 -> 2 -> {lacag} -> 1 -> Bank PIN)
 */
class GeeshAccessibilityService : AccessibilityService() {

    companion object {
        // Flow to receive the final dialog text emitted by USSD
        private val _ussdDialogFlow = MutableSharedFlow<String>(extraBufferCapacity = 5)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        // Queue of sequential replies for USSD dialogs
        private val replyQueue = Collections.synchronizedList(mutableListOf<String>())

        // The reply the service should type next (backward-compatible with single reply)
        var nextReply: String?
            get() = synchronized(replyQueue) { replyQueue.firstOrNull() }
            set(value) {
                synchronized(replyQueue) {
                    replyQueue.clear()
                    if (!value.isNullOrBlank()) {
                        replyQueue.add(value)
                    }
                }
            }

        /**
         * Sets multiple replies for a multi-step USSD session.
         */
        fun setReplies(replies: List<String>) {
            synchronized(replyQueue) {
                replyQueue.clear()
                replyQueue.addAll(replies.filter { it.isNotBlank() })
            }
            Log.d("GeeshAccessibility", "Queued ${replyQueue.size} USSD replies: $replies")
        }

        fun clearReplies() {
            synchronized(replyQueue) {
                replyQueue.clear()
            }
        }

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
            if (lower.contains("running") || lower.contains("mmi") || lower.contains("wait") || lower.contains("fadlan sug")) {
                Log.d("GeeshAccessibility", "Skipping loading dialog: $dialogText")
                return
            }

            if (dialogText.isBlank()) return

            Log.d("GeeshAccessibility", "USSD Dialog detected: $dialogText")

            val hasInput = findEditText(rootNode) != null
            val hasRepliesLeft = synchronized(replyQueue) { replyQueue.isNotEmpty() }

            if (hasInput && hasRepliesLeft) {
                val currentReply = synchronized(replyQueue) {
                    if (replyQueue.isNotEmpty()) replyQueue.removeAt(0) else null
                } ?: return

                isProcessingDialog = true
                Log.d("GeeshAccessibility", "Submitting USSD reply (remaining: ${replyQueue.size}): $currentReply")

                CoroutineScope(Dispatchers.Main).launch {
                    delay(1500) // Wait for dialog to settle

                    val freshNode = rootInActiveWindow
                    if (freshNode != null) {
                        val ok = fillAndSubmit(freshNode, currentReply)
                        Log.d("GeeshAccessibility", "Reply submission result: $ok")
                    } else {
                        Log.e("GeeshAccessibility", "No window node available after delay")
                    }

                    delay(800)
                    isProcessingDialog = false
                }
            } else {
                // No pending reply or dialog has no input field — this is the final confirmation or an alert.
                isProcessingDialog = true
                Log.d("GeeshAccessibility", "Final or alert dialog detected. Dismissing...")

                // Clear any remaining queue if dialog appeared without input
                clearReplies()

                clickButton(rootNode, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH", "KA SAAR", "HAA"))
                _ussdDialogFlow.tryEmit(dialogText)

                CoroutineScope(Dispatchers.Main).launch {
                    delay(800)
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
     * Enters [text] into the USSD reply dialog and presses Send.
     *
     * Strategy:
     *  1. Find the EditText -> focus it -> copy [text] to clipboard -> paste
     *  2. If paste didn't populate the field, fall back to ACTION_SET_TEXT
     *  3. Click SEND / OK button
     */
    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        // ── 1. Find the input field ──────────────────────────────────────────
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input")
        val target = if (editTexts.isNotEmpty()) editTexts[0] else findEditText(node)

        if (target == null) {
            Log.e("GeeshAccessibility", "No EditText found in USSD dialog — cannot enter reply")
            return false
        }

        // ── 2. Focus the field ───────────────────────────────────────────────
        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(300)

        // ── 3. Copy reply to clipboard ───────────────────────────────────────
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_reply", text))
        Log.d("GeeshAccessibility", "Reply copied to clipboard: $text")
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
        val sent = clickButton(node, listOf("SEND", "Send", "OK", "Ok", "REPLY", "Reply", "DIR", "Dir"))
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

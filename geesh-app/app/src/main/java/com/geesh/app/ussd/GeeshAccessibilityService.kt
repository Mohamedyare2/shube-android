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
 *   3. Auto balance check reply (*801# -> PIN)
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
        val className = event.className?.toString() ?: ""

        val isDialogEvent = className.contains("Dialog", ignoreCase = true) ||
                            className.contains("AlertDialog", ignoreCase = true) ||
                            className.contains("Ussd", ignoreCase = true) ||
                            className.contains("Phone", ignoreCase = true) ||
                            event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED

        if (isDialogEvent) {
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

            val hasRepliesLeft = synchronized(replyQueue) { replyQueue.isNotEmpty() }

            if (hasRepliesLeft) {
                // We are expecting an input dialog to enter a reply/PIN
                isProcessingDialog = true
                val currentReply = synchronized(replyQueue) {
                    if (replyQueue.isNotEmpty()) replyQueue.removeAt(0) else null
                } ?: run {
                    isProcessingDialog = false
                    return
                }

                Log.d("GeeshAccessibility", "Expecting input dialog for reply: $currentReply (remaining: ${replyQueue.size})")

                CoroutineScope(Dispatchers.Main).launch {
                    // Poll for up to 2.5 seconds (every 250ms) to allow the EditText to inflate
                    var targetNode: AccessibilityNodeInfo? = null
                    var attempts = 0
                    while (attempts < 10) {
                        delay(250)
                        val freshRoot = rootInActiveWindow
                        if (freshRoot != null) {
                            val edit = findEditText(freshRoot)
                            if (edit != null) {
                                targetNode = freshRoot
                                break
                            }
                        }
                        attempts++
                    }

                    if (targetNode != null) {
                        Log.d("GeeshAccessibility", "EditText ready after ${attempts * 250}ms. Submitting reply: $currentReply")
                        val ok = fillAndSubmit(targetNode, currentReply)
                        Log.d("GeeshAccessibility", "Reply submission result: $ok")
                    } else {
                        Log.w("GeeshAccessibility", "No EditText found after waiting 2.5s. Treating as alert/result dialog.")
                        val freshRoot = rootInActiveWindow ?: rootNode
                        val text = extractText(freshRoot).ifBlank { dialogText }
                        clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH"))
                        _ussdDialogFlow.tryEmit(text)
                    }

                    delay(800)
                    isProcessingDialog = false
                }
            } else {
                // No pending reply — this is the final confirmation or result dialog
                isProcessingDialog = true
                Log.d("GeeshAccessibility", "Final USSD dialog detected: $dialogText. Dismissing in 1s...")

                CoroutineScope(Dispatchers.Main).launch {
                    delay(800) // Give user/screen time to settle
                    val freshRoot = rootInActiveWindow ?: rootNode
                    val finalText = extractText(freshRoot).ifBlank { dialogText }

                    clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH", "KA SAAR", "HAA"))
                    _ussdDialogFlow.tryEmit(finalText)

                    delay(600)
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
        // 1. Try standard Android positive button IDs first
        val standardBtnIds = listOf("android:id/button1", "com.android.phone:id/button1")
        for (id in standardBtnIds) {
            val btns = node.findAccessibilityNodeInfosByViewId(id)
            for (btn in btns) {
                if (btn.isClickable) { btn.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
                if (btn.parent?.isClickable == true) { btn.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
            }
        }

        // 2. Try text labels
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

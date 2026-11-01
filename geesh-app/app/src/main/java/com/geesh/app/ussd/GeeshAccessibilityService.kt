package com.geesh.app.ussd

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.util.Collections

/**
 * Enhanced Accessibility Service that automates USSD dialog interactions.
 * Supports:
 *  - Both Direct Card mode (1 reply/PIN) and Bank Account mode (up to 7 sequential replies)
 *  - Works seamlessly while device is locked (Lock Screen / Keyguard active)
 *  - Strict session gating: NEVER interferes with other apps when no USSD is active
 *  - Ignores all non-telephony applications (TikTok, WhatsApp, etc.)
 *  - Captures the final dialog response accurately for success/failure analysis
 */
class GeeshAccessibilityService : AccessibilityService() {

    companion object {
        // Flow to receive the final dialog text emitted by USSD
        private val _ussdDialogFlow = MutableSharedFlow<String>(extraBufferCapacity = 5)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        // Queue of sequential replies for USSD dialogs
        private val replyQueue = Collections.synchronizedList(mutableListOf<String>())

        // Active USSD session flag. When FALSE, this service ignores ALL screen events completely.
        @Volatile
        var isUssdSessionActive = false
            private set

        // Guard against the same dialog firing multiple accessibility events
        @Volatile
        var isProcessingDialog = false

        var isServiceActive = false
            private set

        // Backward-compatible single reply accessor
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
         * Starts an active USSD session with the given sequential replies.
         */
        fun startSession(replies: List<String>) {
            synchronized(replyQueue) {
                replyQueue.clear()
                replyQueue.addAll(replies.filter { it.isNotBlank() })
            }
            isProcessingDialog = false
            isUssdSessionActive = true
            Log.d("GeeshAccessibility", "USSD Session STARTED with ${replyQueue.size} replies: $replies")
        }

        /**
         * Backward-compatible setter for replies (also starts session).
         */
        fun setReplies(replies: List<String>) {
            startSession(replies)
        }

        /**
         * Stops the USSD session and clears any remaining replies.
         */
        fun stopSession() {
            synchronized(replyQueue) {
                replyQueue.clear()
            }
            isProcessingDialog = false
            isUssdSessionActive = false
            Log.d("GeeshAccessibility", "USSD Session STOPPED")
        }

        fun clearReplies() {
            stopSession()
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
        }
        isServiceActive = true
        Log.d("GeeshAccessibility", "Accessibility service connected (Strict session mode active)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // ── 1. STRICT SESSION GUARD ──────────────────────────────────────────
        // If the app is not currently running an active USSD session, do NOT touch anything!
        // This completely prevents erratic app switching or hijacking TikTok / other apps.
        if (!isUssdSessionActive) {
            return
        }

        // ── 2. PACKAGE FILTER ────────────────────────────────────────────────
        // Block known third-party user apps so we never touch or focus them
        val pkg = event.packageName?.toString()?.lowercase() ?: ""
        if (pkg.contains("tiktok") ||
            pkg.contains("musically") ||
            pkg.contains("whatsapp") ||
            pkg.contains("facebook") ||
            pkg.contains("instagram") ||
            pkg.contains("chrome") ||
            pkg.contains("youtube") ||
            pkg.contains("launcher") ||
            pkg.contains("home")) {
            return
        }

        val className = event.className?.toString() ?: ""
        val isDialogEvent = className.contains("Dialog", ignoreCase = true) ||
                            className.contains("AlertDialog", ignoreCase = true) ||
                            className.contains("Ussd", ignoreCase = true) ||
                            className.contains("Phone", ignoreCase = true) ||
                            event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED

        if (isDialogEvent) {
            if (isProcessingDialog) return

            val rootNode = rootInActiveWindow ?: findUssdRootNode() ?: return
            val dialogText = extractText(rootNode)
            val lower = dialogText.lowercase()

            // Skip system loading/progress dialogs ("USSD code running...", "MMI code started", etc.)
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
                    // Poll for up to 10 seconds (every 250ms, 40 attempts) for the EditText to inflate
                    var targetNode: AccessibilityNodeInfo? = null
                    var attempts = 0
                    while (attempts < 40 && isUssdSessionActive) {
                        delay(250)
                        val freshRoot = rootInActiveWindow ?: findUssdRootNode()
                        if (freshRoot != null) {
                            val edit = freshRoot.findAccessibilityNodeInfosByViewId("android:id/input").firstOrNull()
                                ?: findEditText(freshRoot)
                            if (edit != null) {
                                targetNode = freshRoot
                                break
                            }
                        }
                        attempts++
                    }

                    if (targetNode != null) {
                        Log.d("GeeshAccessibility", "EditText ready after ${attempts * 250}ms. Submitting: $currentReply")
                        val ok = fillAndSubmit(targetNode, currentReply)
                        Log.d("GeeshAccessibility", "Reply submission result: $ok")
                    } else {
                        Log.w("GeeshAccessibility", "No EditText found after waiting 10s. Treating as alert/result dialog.")
                        val freshRoot = rootInActiveWindow ?: findUssdRootNode() ?: rootNode
                        val text = extractText(freshRoot).ifBlank { dialogText }
                        _ussdDialogFlow.tryEmit(text)
                        clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH"))
                    }

                    // Short delay to quickly accept the next incoming dialog
                    delay(200)
                    isProcessingDialog = false
                }
            } else {
                // No pending replies — this is the final confirmation or result dialog
                isProcessingDialog = true
                Log.d("GeeshAccessibility", "Final USSD dialog detected: $dialogText")

                CoroutineScope(Dispatchers.Main).launch {
                    val freshRoot = rootInActiveWindow ?: findUssdRootNode() ?: rootNode
                    val finalText = extractText(freshRoot).ifBlank { dialogText }

                    // Critical: Emit to flow FIRST so result text is captured before dialog closes
                    _ussdDialogFlow.tryEmit(finalText)
                    Log.d("GeeshAccessibility", "Emitted final USSD result: $finalText")

                    delay(300)
                    clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH", "KA SAAR", "HAA"))

                    delay(300)
                    isProcessingDialog = false
                }
            }
        }
    }

    /**
     * Searches across active interactive windows for a verified USSD dialog root node.
     * Only returns a node if it contains an actual input ID or recognized USSD/telecom terms.
     */
    private fun findUssdRootNode(): AccessibilityNodeInfo? {
        val windowList = try { windows } catch (_: Exception) { emptyList<AccessibilityWindowInfo>() }
        for (w in windowList) {
            val root = w.root ?: continue

            // 1. Check for standard Android USSD input view ID
            val editTexts = root.findAccessibilityNodeInfosByViewId("android:id/input")
            if (editTexts.isNotEmpty()) return root

            // 2. Or check for explicit telecom / USSD dialog keywords
            val text = extractText(root).lowercase()
            if (text.contains("zaad") || text.contains("shub") || text.contains("geli") ||
                text.contains("pin") || text.contains("lacag") || text.contains("hadhaag") ||
                text.contains("haraag") || text.contains("dhigatay") || text.contains("dirtay") ||
                text.contains("guul") || text.contains("sarif") || text.contains("telesom") ||
                text.contains("sahal") || text.contains("edahab") || text.contains("mmi") ||
                text.contains("ussd")) {
                return root
            }
        }
        return null
    }

    private fun extractText(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        if (node.text != null) sb.append(node.text).append("\n")
        for (i in 0 until node.childCount) sb.append(extractText(node.getChild(i)))
        return sb.toString()
    }

    /**
     * Enters [text] into the USSD reply dialog and presses Send.
     */
    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input")
        val target = if (editTexts.isNotEmpty()) editTexts[0] else findEditText(node)

        if (target == null) {
            Log.e("GeeshAccessibility", "No EditText found in USSD dialog — cannot enter reply")
            return false
        }

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(200)

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_reply", text))
        delay(150)

        target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        delay(200)

        val currentText = target.text?.toString() ?: ""
        if (currentText.isBlank()) {
            val bundle = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
            delay(200)
        }

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
        val standardBtnIds = listOf("android:id/button1", "com.android.phone:id/button1")
        for (id in standardBtnIds) {
            val btns = node.findAccessibilityNodeInfosByViewId(id)
            for (btn in btns) {
                if (btn.isClickable) { btn.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
                if (btn.parent?.isClickable == true) { btn.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK); return true }
            }
        }

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
        stopSession()
        isServiceActive = false
        super.onDestroy()
    }
}

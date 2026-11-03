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
 *  - 100% IMMUNITY: Never touches, inspects, clicks or steals focus from user apps (TikTok, WhatsApp, etc.)
 *  - Strictly restricted to telephony and telecom system dialogs
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

        fun setReplies(replies: List<String>) {
            startSession(replies)
        }

        /**
         * Returns true if all queued replies have been filled and submitted.
         */
        fun isAllRepliesConsumed(): Boolean {
            return synchronized(replyQueue) { replyQueue.isEmpty() }
        }

        fun getRemainingRepliesCount(): Int {
            return synchronized(replyQueue) { replyQueue.size }
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

        /**
         * Verifies whether a given package name belongs to a verified Phone / Telecom system component.
         * Explicitly rejects any social, media, browser, or user applications (e.g. TikTok, WhatsApp).
         */
        fun isTelephonyPackage(packageName: String?): Boolean {
            if (packageName.isNullOrBlank()) return false
            val lower = packageName.lowercase()

            // 1. Explicitly blacklist all non-telephony apps
            if (lower.contains("tiktok") ||
                lower.contains("trill") ||
                lower.contains("musically") ||
                lower.contains("whatsapp") ||
                lower.contains("facebook") ||
                lower.contains("instagram") ||
                lower.contains("youtube") ||
                lower.contains("chrome") ||
                lower.contains("browser") ||
                lower.contains("launcher") ||
                lower.contains("home") ||
                lower.contains("shube") ||
                lower.contains("geesh") ||
                lower.contains("telegram") ||
                lower.contains("snapchat")) {
                return false
            }

            // 2. Allow only core telephony, dialer, and system dialog components
            return lower.contains("phone") ||
                   lower.contains("dialer") ||
                   lower.contains("telecom") ||
                   lower.contains("telephony") ||
                   lower.contains("incall") ||
                   lower == "android"
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
        }
        isServiceActive = true
        Log.d("GeeshAccessibility", "Accessibility service connected (Strict telephony-only mode)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // ── 1. STRICT SESSION GUARD ──────────────────────────────────────────
        // When no USSD session is actively running, IGNORE EVERYTHING completely.
        if (!isUssdSessionActive) {
            return
        }

        // ── 2. PACKAGE WHITELIST GUARD ───────────────────────────────────────
        // Only process events originating from the phone / dialer / system dialogs.
        val pkg = event.packageName?.toString() ?: ""
        if (!isTelephonyPackage(pkg)) {
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

            val rootNode = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                ?: findUssdRootNode() ?: return

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
                isProcessingDialog = true
                val currentReply = synchronized(replyQueue) {
                    if (replyQueue.isNotEmpty()) replyQueue.removeAt(0) else null
                } ?: run {
                    isProcessingDialog = false
                    return
                }

                Log.d("GeeshAccessibility", "Expecting input dialog for reply: $currentReply (remaining: ${replyQueue.size})")

                CoroutineScope(Dispatchers.Main).launch {
                    var targetNode: AccessibilityNodeInfo? = null
                    var attempts = 0
                    while (attempts < 40 && isUssdSessionActive) {
                        delay(250)
                        val freshRoot = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                            ?: findUssdRootNode()

                        if (freshRoot != null && isTelephonyPackage(freshRoot.packageName?.toString())) {
                            val edit = freshRoot.findAccessibilityNodeInfosByViewId("android:id/input").firstOrNull()
                                ?: findEditText(freshRoot)
                            if (edit != null) {
                                targetNode = freshRoot
                                break
                            }
                        }
                        attempts++
                    }

                    if (targetNode != null && isTelephonyPackage(targetNode.packageName?.toString())) {
                        Log.d("GeeshAccessibility", "EditText ready. Submitting reply: $currentReply")
                        val ok = fillAndSubmit(targetNode, currentReply)
                        Log.d("GeeshAccessibility", "Reply submission result: $ok")
                    } else {
                        Log.w("GeeshAccessibility", "No EditText found in telephony window after waiting 10s")
                        val freshRoot = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                            ?: findUssdRootNode() ?: rootNode
                        val text = extractText(freshRoot).ifBlank { dialogText }
                        _ussdDialogFlow.tryEmit(text)
                        clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH"))
                    }

                    delay(200)
                    isProcessingDialog = false
                }
            } else {
                isProcessingDialog = true
                Log.d("GeeshAccessibility", "Final USSD dialog detected: $dialogText")

                CoroutineScope(Dispatchers.Main).launch {
                    val freshRoot = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                        ?: findUssdRootNode() ?: rootNode
                    val finalText = extractText(freshRoot).ifBlank { dialogText }

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
     * Searches across interactive windows STRICTLY for telephony windows.
     * Never inspects or returns windows belonging to user apps.
     */
    private fun findUssdRootNode(): AccessibilityNodeInfo? {
        val windowList = try { windows } catch (_: Exception) { emptyList<AccessibilityWindowInfo>() }
        for (w in windowList) {
            val root = w.root ?: continue
            val rootPkg = root.packageName?.toString() ?: ""

            // STRICT FILTER: If not a telephony package, SKIP completely!
            if (!isTelephonyPackage(rootPkg)) {
                continue
            }

            // 1. Check for standard Android USSD input view ID
            val editTexts = root.findAccessibilityNodeInfosByViewId("android:id/input")
            if (editTexts.isNotEmpty()) return root

            // 2. Check for explicit telecom / USSD keywords
            val text = extractText(root).lowercase()
            if (text.contains("zaad") || text.contains("shub") || text.contains("geli") ||
                text.contains("hadhaag") || text.contains("haraag") || text.contains("dhigatay") ||
                text.contains("dirtay") || text.contains("sarif") || text.contains("telesom") ||
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
     * Strictly verifies node belongs to a telephony package before doing any action.
     */
    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        val nodePkg = node.packageName?.toString() ?: ""
        if (!isTelephonyPackage(nodePkg)) {
            Log.w("GeeshAccessibility", "Blocked fillAndSubmit on non-telephony package: $nodePkg")
            return false
        }

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

package com.shube.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

/**
 * Enhanced USSD automation service for Somtel / Hormuud / Telesom transactions.
 * 
 * TELEPHONY ISOLATION:
 *  - Strict blacklist guarantees user apps (TikTok, WhatsApp, Facebook, Chrome, YouTube, etc.)
 *    are NEVER touched, inspected, or clicked.
 *  - When isUssdSessionActive is false, the service is 100% dormant.
 *
 * LOCK-SCREEN RESILIENCE (Infinix Hot 50i / Transsion XOS & Samsung OneUI):
 *  - Whitelist includes Transsion/Infinix dialer (com.sh.smart.caller, com.transsion.*)
 *    and lockscreen system hosts (com.android.systemui, keyguard).
 *  - Continuous Active Poller inspects window hierarchy directly every 250ms for up to 30s,
 *    bypassing lock-screen event throttling.
 *  - Robust multi-strategy text input: direct ACTION_SET_TEXT primary + focus/click + clipboard paste fallback.
 *  - Comprehensive button matching: standard button1 IDs + Somali/English labels + dialog positive button fallback.
 */
data class UssdDialogEvent(
    val text: String,
    val timestamp: Long = System.currentTimeMillis()
)

class UssdAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: UssdAccessibilityService? = null
            private set

        // Shared flow to emit parsed USSD dialog events back to the State Machine
        private val _ussdDialogFlow = MutableSharedFlow<UssdDialogEvent>(extraBufferCapacity = 10)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        // Command channel to tell this service what to reply (if applicable)
        @Volatile
        var nextReply: String? = null
            set(value) {
                field = value
                if (value != null && isUssdSessionActive) {
                    instance?.triggerActivePolling(value)
                }
            }

        // Flag indicating we are actively waiting for the final response dialog
        @Volatile
        var isWaitingForFinalResponse: Boolean = false

        // Guard against duplicate concurrent dialog processing
        @Volatile
        var isProcessingDialog = false

        var isServiceActive = false
            private set

        // ── TELEPHONY ISOLATION ────────────────────────────────────────────────
        // When false the service ignores ALL accessibility events completely.
        @Volatile
        var isUssdSessionActive = false
            private set

        fun startSession() {
            isUssdSessionActive = true
            isProcessingDialog = false
            isWaitingForFinalResponse = false
            Log.d("UssdAccessibility", "USSD session STARTED — telephony isolation & lockscreen poller active")
        }

        fun stopSession() {
            isUssdSessionActive = false
            isProcessingDialog = false
            isWaitingForFinalResponse = false
            nextReply = null
            Log.d("UssdAccessibility", "USSD session STOPPED — all events ignored until next session")
        }

        fun startWaitingForFinalResponse() {
            isWaitingForFinalResponse = true
            instance?.triggerActivePolling(null)
        }

        fun emitDialog(text: String) {
            _ussdDialogFlow.tryEmit(UssdDialogEvent(text = text))
        }

        // ── STRICT TELEPHONY & SYSTEM PACKAGE WHITELIST ────────────────────────
        fun isTelephonyPackage(pkg: String?): Boolean {
            if (pkg.isNullOrBlank()) return false
            val p = pkg.lowercase()

            // 1. Strict Blacklist: Never touch social, media, launchers, or user apps
            val blacklisted = listOf(
                "tiktok", "trill", "musically",
                "whatsapp", "facebook", "instagram",
                "youtube", "chrome", "browser",
                "launcher", "home", "shube", "geesh",
                "telegram", "snapchat", "twitter",
                "spotify", "netflix", "tinder"
            )
            if (blacklisted.any { p.contains(it) }) return false

            // 2. Allow telephony, dialers, system dialog hosts (covers Infinix, Samsung, MTK, AOSP)
            return p == "android" ||
                   p.contains("phone") ||
                   p.contains("dialer") ||
                   p.contains("telecom") ||
                   p.contains("telephony") ||
                   p.contains("incall") ||
                   p.contains("caller") ||          // Infinix Hot 50i / Transsion (com.sh.smart.caller)
                   p.contains("transsion") ||       // Transsion OS (Infinix, Tecno, Itel)
                   p.contains("contacts") ||        // MTK / AOSP contacts dialer
                   p.contains("stk") ||             // SIM Toolkit
                   p.contains("systemui") ||        // Android lockscreen container for dialogs
                   p.contains("keyguard")           // Lockscreen keyguard
        }

        fun isUssdContent(text: String): Boolean {
            val lower = text.lowercase()
            return lower.contains("somtel") ||
                   lower.contains("telesom") ||
                   lower.contains("zaad") ||
                   lower.contains("shube") ||
                   lower.contains("shub") ||
                   lower.contains("geli") ||
                   lower.contains("pin") ||
                   lower.contains("lacag") ||
                   lower.contains("hadhaag") ||
                   lower.contains("haraag") ||
                   lower.contains("dhigo") ||
                   lower.contains("dhigatay") ||
                   lower.contains("dirtay") ||
                   lower.contains("wareejisay") ||
                   lower.contains("number") ||
                   lower.contains("mmi") ||
                   lower.contains("ussd") ||
                   lower.contains("sahal") ||
                   lower.contains("edahab") ||
                   lower.contains("adeeg") ||
                   lower.contains("ku shub") ||
                   lower.contains("ma hubtaa") ||
                   lower.contains("fadlan")
        }

        fun isLoadingDialog(text: String): Boolean {
            val lower = text.lowercase()
            return (lower.contains("running") ||
                   lower.contains("mmi code started") ||
                   lower.contains("fadlan sug") ||
                   lower.contains("please wait") ||
                   lower.contains("loading")) &&
                   !lower.contains("geli") && !lower.contains("pin") && !lower.contains("1.")
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            notificationTimeout = 100
        }
        isServiceActive = true
        Log.d("UssdAccessibility", "Service connected — strict telephony-only & lock-screen resilient mode enabled")
    }

    /**
     * Active background poller that queries interactive windows directly every 250ms.
     * Bypasses Android lock-screen event drops on Infinix Hot 50i and Samsung Galaxy.
     */
    fun triggerActivePolling(expectedReply: String?) {
        if (!isUssdSessionActive) return
        Log.d("UssdAccessibility", "Starting active lock-screen poller (expectedReply='$expectedReply')")

        CoroutineScope(Dispatchers.Main).launch {
            var attempts = 0
            // Poll every 250ms for up to 30s (120 attempts)
            while (attempts < 120 && isUssdSessionActive) {
                delay(250)
                attempts++

                if (isProcessingDialog) continue

                val rootNode = findUssdRootNode() ?: continue
                val dialogText = extractTextFromNode(rootNode)

                if (dialogText.isBlank() || isLoadingDialog(dialogText)) continue

                if (expectedReply != null) {
                    if (nextReply != expectedReply) break // reply changed or already handled

                    val editTexts = rootNode.findAccessibilityNodeInfosByViewId("android:id/input")
                    val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(rootNode)

                    if (targetEdit != null) {
                        nextReply = null
                        isProcessingDialog = true

                        Log.d("UssdAccessibility", "Active Poller found EditText on lockscreen after ${attempts * 250}ms. Submitting: $expectedReply")
                        val success = fillAndSubmitDialog(rootNode, expectedReply)
                        Log.d("UssdAccessibility", "Active Poller submit result: $success")

                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))

                        delay(500)
                        isProcessingDialog = false
                        break
                    }
                } else if (isWaitingForFinalResponse) {
                    val editTexts = rootNode.findAccessibilityNodeInfosByViewId("android:id/input")
                    val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(rootNode)

                    // Final response dialog has no EditText or has outcome text
                    if (targetEdit == null || !expectedReplyRequired(dialogText)) {
                        isWaitingForFinalResponse = false
                        isProcessingDialog = true

                        Log.d("UssdAccessibility", "Active Poller found final response dialog after ${attempts * 250}ms: $dialogText")
                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))
                        clickPositiveButton(rootNode)

                        delay(500)
                        isProcessingDialog = false
                        break
                    }
                }
            }
        }
    }

    private fun expectedReplyRequired(text: String): Boolean {
        val lower = text.lowercase()
        return lower.contains("geli") || lower.contains("enter") || lower.contains("pin") || lower.contains("1.")
    }

    /**
     * Searches active and interactive windows for the USSD dialog node.
     * Works on both unlocked screens and locked keyguard screens (Infinix XOS & Samsung OneUI).
     */
    private fun findUssdRootNode(): AccessibilityNodeInfo? {
        try {
            // 1. Try rootInActiveWindow first
            val active = rootInActiveWindow
            if (active != null) {
                val pkg = active.packageName?.toString() ?: ""
                if (isTelephonyPackage(pkg)) {
                    val editTexts = active.findAccessibilityNodeInfosByViewId("android:id/input")
                    if (editTexts.isNotEmpty() || findEditTextFallback(active) != null) {
                        return active
                    }
                    val txt = extractTextFromNode(active).lowercase()
                    if (isUssdContent(txt)) {
                        return active
                    }
                }
            }

            // 2. Search all interactive windows
            val windowList = try { windows } catch (_: Exception) { null }
            if (windowList != null) {
                // Pass 1: Prioritize windows with android:id/input (the USSD reply field)
                for (w in windowList) {
                    val root = w.root ?: continue
                    val pkg = root.packageName?.toString() ?: ""
                    if (!isTelephonyPackage(pkg)) continue

                    val editTexts = root.findAccessibilityNodeInfosByViewId("android:id/input")
                    if (editTexts.isNotEmpty() || findEditTextFallback(root) != null) {
                        return root
                    }
                }

                // Pass 2: Windows containing USSD telecom keywords
                for (w in windowList) {
                    val root = w.root ?: continue
                    val pkg = root.packageName?.toString() ?: ""
                    if (!isTelephonyPackage(pkg)) continue

                    val text = extractTextFromNode(root).lowercase()
                    if (isUssdContent(text)) {
                        return root
                    }
                }
            }
        } catch (e: Exception) {
            Log.w("UssdAccessibility", "findUssdRootNode exception: ${e.message}")
        }
        return null
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // GATE 1: Session guard — ignore everything when no USSD is in progress
        if (!isUssdSessionActive) return

        // GATE 2: Package guard
        val eventPkg = event.packageName?.toString() ?: ""
        if (!isTelephonyPackage(eventPkg)) {
            return
        }

        val className = event.className?.toString() ?: ""
        val isDialogEvent = className.contains("Dialog", ignoreCase = true) ||
                            className.contains("AlertDialog", ignoreCase = true) ||
                            className.contains("Ussd", ignoreCase = true) ||
                            className.contains("Phone", ignoreCase = true) ||
                            event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                            event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED

        if (isDialogEvent) {
            if (isProcessingDialog) return

            val rootNode = findUssdRootNode() ?: return
            val dialogText = extractTextFromNode(rootNode)

            if (isLoadingDialog(dialogText)) {
                Log.d("UssdAccessibility", "Ignoring system loading dialog: $dialogText")
                return
            }

            if (dialogText.isBlank()) return

            Log.d("UssdAccessibility", "Intercepted USSD Dialog: $dialogText")

            // If we have a reply to send:
            if (nextReply != null) {
                val reply = nextReply!!
                val editTexts = rootNode.findAccessibilityNodeInfosByViewId("android:id/input")
                val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(rootNode)

                if (targetEdit != null) {
                    nextReply = null
                    isProcessingDialog = true

                    CoroutineScope(Dispatchers.Main).launch {
                        val success = fillAndSubmitDialog(rootNode, reply)
                        Log.d("UssdAccessibility", "Reply submit from event result: $success for '$reply'")

                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))
                        delay(500)
                        isProcessingDialog = false
                    }
                }
            } else if (isWaitingForFinalResponse) {
                val editTexts = rootNode.findAccessibilityNodeInfosByViewId("android:id/input")
                val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(rootNode)

                if (targetEdit == null || !expectedReplyRequired(dialogText)) {
                    isWaitingForFinalResponse = false
                    isProcessingDialog = true

                    CoroutineScope(Dispatchers.Main).launch {
                        clickPositiveButton(rootNode)
                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))
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

    /**
     * Fills the reply into the USSD dialog using lock-screen resilient actions:
     * Focus -> Direct ACTION_SET_TEXT (primary) -> Focus/Click Retry -> Clipboard PASTE fallback -> Button Click.
     */
    private suspend fun fillAndSubmitDialog(node: AccessibilityNodeInfo, text: String): Boolean {
        if (!isTelephonyPackage(node.packageName?.toString())) {
            Log.w("UssdAccessibility", "fillAndSubmitDialog: node package not allowed: ${node.packageName}")
            return false
        }

        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input")
        val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(node)

        if (targetEdit == null) {
            Log.e("UssdAccessibility", "No EditText found in USSD dialog")
            return false
        }

        // 1. Focus the field
        targetEdit.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        targetEdit.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(150)

        // 2. Direct ACTION_SET_TEXT (primary and most reliable on modern Android)
        val arguments = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        targetEdit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        delay(150)

        // Verify if text was set
        var currentText = targetEdit.text?.toString() ?: ""
        if (!currentText.contains(text)) {
            Log.w("UssdAccessibility", "ACTION_SET_TEXT did not populate (current='$currentText'). Retrying with click & focus...")

            targetEdit.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            delay(100)
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            delay(100)
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            delay(150)

            currentText = targetEdit.text?.toString() ?: ""
            if (!currentText.contains(text)) {
                // Fallback to Clipboard Paste
                try {
                    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_reply", text))
                    delay(100)
                    targetEdit.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                    delay(150)
                } catch (e: Exception) {
                    Log.w("UssdAccessibility", "Clipboard paste fallback error: ${e.message}")
                }
            }
        }

        Log.d("UssdAccessibility", "EditText content after input: '${targetEdit.text}'")

        // 3. Click Positive / Send button
        val sent = clickPositiveButton(node)
        Log.d("UssdAccessibility", "Positive button clicked: $sent for reply '$text'")
        return sent
    }

    private fun findEditTextFallback(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.className?.toString()?.contains("EditText") == true) return node
        for (i in 0 until node.childCount) {
            val res = findEditTextFallback(node.getChild(i))
            if (res != null) return res
        }
        return null
    }

    /**
     * Clicks the positive action button (Send, OK, Reply, Dir) in the dialog.
     * Evaluates standard IDs, view IDs ending with button1, Somali & English labels, and Button fallbacks.
     */
    private fun clickPositiveButton(node: AccessibilityNodeInfo): Boolean {
        // Priority 1: Check known positive button resource IDs
        val positiveButtonIds = listOf(
            "android:id/button1",
            "com.android.phone:id/button1",
            "com.sh.smart.caller:id/button1",
            "com.transsion.telephony:id/button1",
            "com.transsion.smartcaller:id/button1"
        )
        for (id in positiveButtonIds) {
            val buttons = node.findAccessibilityNodeInfosByViewId(id)
            for (btn in buttons) {
                if (btn.isClickable && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.parent?.isClickable == true && btn.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            }
        }

        // Priority 2: Match by text label
        val sendLabels = listOf(
            "SEND", "Send", "send",
            "OK", "Ok", "ok",
            "REPLY", "Reply", "reply",
            "DIR", "Dir", "dir",
            "DIRI", "Diri", "diri",
            "HAA", "Haa", "haa",
            "SUBMIT", "Submit",
            "CONFIRM", "Confirm",
            "HUBI", "Hubi",
            "GELI", "Geli"
        )
        for (label in sendLabels) {
            val buttons = node.findAccessibilityNodeInfosByText(label)
            for (btn in buttons) {
                if (btn.isClickable && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.parent?.isClickable == true && btn.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            }
        }

        // Priority 3: Fallback to any positive button that is not Cancel/Dismiss
        val fallback = findPositiveButtonFallback(node)
        if (fallback != null) {
            if (fallback.isClickable && fallback.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            if (fallback.parent?.isClickable == true && fallback.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        }

        return false
    }

    private fun findPositiveButtonFallback(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val cls = node.className?.toString() ?: ""
        val text = node.text?.toString()?.lowercase() ?: ""
        val viewId = node.viewIdResourceName?.lowercase() ?: ""

        if (cls.contains("Button", ignoreCase = true) || node.isClickable) {
            val isNegative = text.contains("cancel") || text.contains("maya") ||
                             text.contains("dismiss") || text.contains("xidh") ||
                             text.contains("ka saar") || viewId.contains("button2")
            if (!isNegative && (viewId.contains("button1") || node.isClickable)) {
                return node
            }
        }

        for (i in 0 until node.childCount) {
            val found = findPositiveButtonFallback(node.getChild(i))
            if (found != null) return found
        }
        return null
    }

    override fun onInterrupt() {
        Log.w("UssdAccessibility", "Service interrupted")
    }

    override fun onDestroy() {
        stopSession()
        if (instance == this) instance = null
        isServiceActive = false
        Log.d("UssdAccessibility", "Service unbound")
        super.onDestroy()
    }
}

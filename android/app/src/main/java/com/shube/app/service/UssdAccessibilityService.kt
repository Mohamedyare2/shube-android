package com.shube.app.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
 * Fallback USSD automation service for devices that do not fully support
 * multi-step interaction via TelephonyManager.sendUssdRequest().
 *
 * TELEPHONY ISOLATION: This service ONLY processes events from telephony-related
 * packages. All other apps (TikTok, WhatsApp, Facebook, etc.) are completely ignored,
 * preventing accidental UI interactions outside of USSD dialogs.
 *
 * LOCK-SCREEN RESILIENCE:
 * 1. Active direct poller starts immediately when nextReply is assigned — continuously
 *    checking interactive windows every 250ms without waiting for OS window events.
 * 2. Focuses EditText (ACTION_FOCUS & ACTION_ACCESSIBILITY_FOCUS) to activate the field.
 * 3. Uses ClipboardManager ACTION_PASTE with ACTION_SET_TEXT fallback, bypassing lockscreen restrictions.
 * 4. Prioritizes telephony windows with android:id/input view ID over background windows.
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
        // Setting nextReply immediately triggers active lock-screen polling.
        @Volatile
        var nextReply: String? = null
            set(value) {
                field = value
                if (value != null && isUssdSessionActive) {
                    instance?.triggerActivePolling(value)
                }
            }

        // Lock to prevent multiple accessibility events or poller collisions for the same dialog
        @Volatile
        var isProcessingDialog = false

        var isServiceActive = false
            private set

        // ── TELEPHONY ISOLATION ────────────────────────────────────────────────
        // When false the service ignores ALL accessibility events.
        // Set to true only while a USSD session is actively in progress.
        @Volatile
        var isUssdSessionActive = false
            private set

        /**
         * Call this immediately before dialing a USSD code.
         * Activates the accessibility service so it starts listening for USSD dialogs.
         */
        fun startSession() {
            isUssdSessionActive = true
            isProcessingDialog = false
            Log.d("UssdAccessibility", "USSD session STARTED — telephony isolation & lockscreen poller active")
        }

        /**
         * Call this after the USSD session ends (success, failure, or timeout).
         * Deactivates the accessibility service so it ignores all non-telephony events.
         */
        fun stopSession() {
            isUssdSessionActive = false
            isProcessingDialog = false
            nextReply = null
            Log.d("UssdAccessibility", "USSD session STOPPED — all events ignored until next session")
        }

        fun emitDialog(text: String) {
            _ussdDialogFlow.tryEmit(UssdDialogEvent(text = text))
        }

        // ── STRICT TELEPHONY PACKAGE WHITELIST ────────────────────────────────
        /**
         * Returns true ONLY for packages that are part of the telephony/dialer stack.
         * Everything else — TikTok, WhatsApp, YouTube, launchers, etc. — returns false.
         */
        fun isTelephonyPackage(pkg: String?): Boolean {
            if (pkg.isNullOrBlank()) return false
            val p = pkg.lowercase()

            // ── Explicit blacklist: social, media, launchers ─────────────────
            val blockSubstrings = listOf(
                "tiktok", "trill", "musically",
                "whatsapp", "facebook", "instagram",
                "youtube", "chrome", "browser",
                "launcher", "home", "shube", "geesh",
                "telegram", "snapchat", "twitter",
                "spotify", "netflix", "tinder"
            )
            if (blockSubstrings.any { p.contains(it) }) return false

            // ── Exact allow: bare "android" system package ─────────────────────
            if (p == "android") return true

            // ── Allow telephony stack ──────────────────────────────────────────
            return p.contains("phone") ||
                   p.contains("dialer") ||
                   p.contains("telecom") ||
                   p.contains("telephony") ||
                   p.contains("incall")
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
        }
        serviceInfo = info
        isServiceActive = true
        Log.d("UssdAccessibility", "Service connected — strict telephony-only & lock-screen resilient mode enabled")
    }

    /**
     * Active background poller that queries interactive windows directly every 250ms.
     * This bypasses Android lock-screen event drops when "USSD running" changes to the input dialog.
     */
    fun triggerActivePolling(expectedReply: String) {
        if (!isUssdSessionActive) return
        Log.d("UssdAccessibility", "Starting active lock-screen poller for reply: $expectedReply")

        CoroutineScope(Dispatchers.Main).launch {
            var attempts = 0
            // Poll every 250ms for up to 30s (120 attempts)
            while (attempts < 120 && isUssdSessionActive && nextReply == expectedReply) {
                delay(250)
                attempts++

                if (isProcessingDialog) continue

                val rootNode = (rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                    ?: findUssdRootNode()) ?: continue

                val dialogText = extractTextFromNode(rootNode)
                val lower = dialogText.lowercase()

                // Skip loading/progress dialogs ("running", "mmi", "wait", etc.)
                if (lower.contains("running") || lower.contains("mmi") || lower.contains("wait") || lower.contains("fadlan sug")) {
                    continue
                }

                if (dialogText.isBlank()) continue

                // Check for EditText
                val editTexts = rootNode.findAccessibilityNodeInfosByViewId("android:id/input")
                val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(rootNode)

                if (targetEdit != null) {
                    if (nextReply != expectedReply) break
                    isProcessingDialog = true
                    nextReply = null

                    Log.d("UssdAccessibility", "Active Poller found EditText after ${attempts * 250}ms. Submitting: $expectedReply")
                    val success = fillAndSubmitDialog(rootNode, expectedReply)
                    Log.d("UssdAccessibility", "Active Poller submit result: $success")

                    _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))

                    delay(500)
                    isProcessingDialog = false
                    break
                }
            }
        }
    }

    /**
     * Searches ALL active windows for a USSD dialog root node.
     * Prioritizes windows that contain the standard android:id/input view ID or USSD keywords.
     */
    private fun findUssdRootNode(): AccessibilityNodeInfo? {
        return try {
            val windowList = windows ?: return null

            // 1. First priority: search for telephony window containing the input field
            for (w in windowList) {
                val root = w.root ?: continue
                val rootPkg = root.packageName?.toString() ?: ""
                if (!isTelephonyPackage(rootPkg)) continue

                val editTexts = root.findAccessibilityNodeInfosByViewId("android:id/input")
                if (editTexts.isNotEmpty()) {
                    return root
                }
            }

            // 2. Second priority: search for telephony window containing USSD keywords
            for (w in windowList) {
                val root = w.root ?: continue
                val rootPkg = root.packageName?.toString() ?: ""
                if (!isTelephonyPackage(rootPkg)) continue

                val text = extractTextFromNode(root).lowercase()
                if (text.contains("somtel") || text.contains("shube") || text.contains("geli") ||
                    text.contains("pin") || text.contains("haragaaga") || text.contains("hadhaaga") ||
                    text.contains("dhigo") || text.contains("number") || text.contains("mmi") ||
                    text.contains("ussd")) {
                    return root
                }
            }

            // 3. Fallback: any telephony window with non-blank text
            for (w in windowList) {
                val root = w.root ?: continue
                val rootPkg = root.packageName?.toString() ?: ""
                if (!isTelephonyPackage(rootPkg)) continue

                val text = extractTextFromNode(root)
                if (text.isNotBlank()) {
                    return root
                }
            }
            null
        } catch (e: Exception) {
            Log.w("UssdAccessibility", "findUssdRootNode failed: ${e.message}")
            null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // ── GATE 1: Session guard — ignore everything when no USSD is in progress ──
        if (!isUssdSessionActive) return

        // ── GATE 2: Package guard ─────────────────────────────────────────────
        val eventPkg = event.packageName?.toString()
        val isTelephony = isTelephonyPackage(eventPkg)
        val isKeyguardOrSystem = eventPkg?.contains("systemui", ignoreCase = true) == true ||
                                 eventPkg?.contains("keyguard", ignoreCase = true) == true

        // If not telephony and not lockscreen container, ignore completely
        if (!isTelephony && !isKeyguardOrSystem) {
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
            if (isProcessingDialog) return // Ignore redundant events while we process

            // Use rootInActiveWindow; fall back to searching telephony windows when locked.
            val rootNode = (rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                ?: findUssdRootNode()) ?: return

            val dialogText = extractTextFromNode(rootNode)

            // Ignore system loading dialogs (e.g., "USSD code running...", "MMI code started")
            val lowerText = dialogText.lowercase()
            if (lowerText.contains("running") || lowerText.contains("mmi") || lowerText.contains("wait") || lowerText.contains("fadlan sug")) {
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
                        Log.d("UssdAccessibility", "Polling for EditText (up to 30s)...")
                        var targetNode: AccessibilityNodeInfo? = null
                        var attempts = 0
                        while (attempts < 120 && isUssdSessionActive) {
                            delay(250)
                            val freshNode = (rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                                ?: findUssdRootNode())
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
                            val freshNode = (rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                                ?: findUssdRootNode()) ?: rootNode
                            val success = fillAndSubmitDialog(freshNode, reply)
                            Log.w("UssdAccessibility", "Fallback submit reply success: $success after timeout")
                        }

                        // Emit to state machine AFTER we finish so it doesn't advance prematurely
                        _ussdDialogFlow.tryEmit(UssdDialogEvent(text = dialogText))

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

    /**
     * Fills the reply into the USSD dialog using lock-screen resilient actions:
     * Focus -> Clipboard PASTE -> SET_TEXT fallback -> Send button click.
     */
    private suspend fun fillAndSubmitDialog(node: AccessibilityNodeInfo, text: String): Boolean {
        // TELEPHONY ISOLATION: verify this node belongs to the telephony stack
        if (!isTelephonyPackage(node.packageName?.toString())) {
            Log.w("UssdAccessibility", "fillAndSubmitDialog: node package not telephony — skipping")
            return false
        }

        // Find EditText
        val editTexts = node.findAccessibilityNodeInfosByViewId("android:id/input") // Common ID
        val targetEdit = if (editTexts.isNotEmpty()) editTexts[0] else findEditTextFallback(node)

        if (targetEdit == null) {
            Log.e("UssdAccessibility", "No EditText found in USSD dialog — cannot enter reply")
            return false
        }

        // 1. Focus the EditText (essential on Lock Screen / Keyguard)
        targetEdit.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        targetEdit.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(200)

        // 2. Clipboard PASTE (bypasses Android lock screen SET_TEXT restrictions)
        try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_reply", text))
            delay(150)
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            delay(200)
        } catch (e: Exception) {
            Log.w("UssdAccessibility", "Clipboard paste failed, trying SET_TEXT fallback: ${e.message}")
        }

        // 3. Fallback to ACTION_SET_TEXT if paste did not populate the field
        val currentText = targetEdit.text?.toString() ?: ""
        if (currentText.isBlank()) {
            val arguments = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            targetEdit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            delay(200)
        }

        // 4. Find and click Send / OK button
        val sent = clickButton(node, listOf("SEND", "Send", "OK", "Ok", "REPLY", "Reply", "DIR", "Dir", "HAA", "Haa"))
        Log.d("UssdAccessibility", "Reply submit (lock-screen resilient) result: $sent for '$text'")
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
                if (button.parent?.isClickable == true) {
                    button.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
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
        stopSession()
        if (instance == this) instance = null
        isServiceActive = false
        Log.d("UssdAccessibility", "Service unbound")
        super.onDestroy()
    }
}

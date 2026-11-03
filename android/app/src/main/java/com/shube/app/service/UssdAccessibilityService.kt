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
import java.util.Collections

/**
 * Robust USSD automation service for Somtel / Hormuud / Telesom transactions.
 * Matches the proven, battle-tested architecture of Geesh App:
 *  - Sequential replyQueue loaded before dialing.
 *  - Works seamlessly while phone is locked (Lock Screen / Keyguard active).
 *  - Strict Telephony Isolation: NEVER touches user apps (TikTok, WhatsApp, etc.).
 *  - Event-driven ONLY via onAccessibilityEvent (typeWindowStateChanged).
 *  - NO active poller — Geesh App architecture proven to work on lock screen.
 *  - Clipboard PASTE first (works on lock screen), SET_TEXT as fallback only.
 *  - Emits final dialog text to ussdDialogFlow only after all replies have been submitted.
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

        // Flow to emit the final dialog text back to GatewayForegroundService
        private val _ussdDialogFlow = MutableSharedFlow<UssdDialogEvent>(extraBufferCapacity = 5)
        val ussdDialogFlow = _ussdDialogFlow.asSharedFlow()

        // Queue of sequential replies for USSD dialogs
        private val replyQueue = Collections.synchronizedList(mutableListOf<String>())

        // Active USSD session flag. When FALSE, this service ignores ALL screen events completely.
        @Volatile
        var isUssdSessionActive = false
            private set

        // Guard against duplicate concurrent dialog processing
        @Volatile
        var isProcessingDialog = false

        var isServiceActive = false
            private set

        /**
         * Starts an active USSD session with the given sequential replies.
         * NO active poller is started — event-driven only (Geesh App architecture).
         */
        fun startSession(replies: List<String> = emptyList()) {
            synchronized(replyQueue) {
                replyQueue.clear()
                replyQueue.addAll(replies.filter { it.isNotBlank() })
            }
            isProcessingDialog = false
            isUssdSessionActive = true
            Log.d("UssdAccessibility", "USSD Session STARTED with ${replyQueue.size} replies: $replies")
            // NOTE: No startActivePoller() — purely event-driven like Geesh App
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
            Log.d("UssdAccessibility", "USSD Session STOPPED")
        }

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

        fun startWaitingForFinalResponse() {
            // No-op for compatibility; session automatically handles final response when replyQueue is empty
        }

        /**
         * Verifies whether a package belongs to the telephony/dialer framework.
         * Explicitly rejects any social, media, browser, or user applications.
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
                lower.contains("snapchat") ||
                lower.contains("systemui") ||   // Ignore systemui so lockscreen notifications are not mistaken for USSD
                lower.contains("keyguard")) {
                return false
            }

            // 2. Allow telephony, dialer, telecom, and OS components
            return lower.contains("phone") ||
                   lower.contains("dialer") ||
                   lower.contains("telecom") ||
                   lower.contains("telephony") ||
                   lower.contains("incall") ||
                   lower.contains("caller") ||          // Infinix Hot 50i / Transsion standard dialer (com.sh.smart.caller)
                   lower.contains("transsion") ||       // Transsion OS telecom components
                   lower.contains("contacts") ||        // MTK / AOSP dialer
                   lower.contains("stk") ||             // SIM Toolkit
                   lower == "android"
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = AccessibilityServiceInfo().apply {
            // ONLY typeWindowStateChanged — no typeWindowContentChanged (avoids lock-screen clock false triggers)
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            notificationTimeout = 100
        }
        isServiceActive = true
        Log.d("UssdAccessibility", "Accessibility service connected (Event-driven, Clipboard-first, Geesh architecture)")
    }

    // NOTE: startActivePoller() has been REMOVED entirely.
    // Geesh App is proven to work on lock screen WITHOUT a poller.
    // The poller was draining replyQueue BEFORE the USSD dialog appeared,
    // causing the reply to be missing when the dialog finally showed up.

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || !isUssdSessionActive) return

        val pkg = event.packageName?.toString() ?: ""
        if (!isTelephonyPackage(pkg)) return

        // Only process TYPE_WINDOW_STATE_CHANGED (new dialog appeared)
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        if (isProcessingDialog) return

        val rootNode = (rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
            ?: findUssdRootNode()) ?: return

        val dialogText = extractText(rootNode)
        val lower = dialogText.lowercase()

        // Skip loading dialogs
        if (lower.contains("running") || lower.contains("mmi") || lower.contains("wait") || lower.contains("fadlan sug")) {
            Log.d("UssdAccessibility", "Skipping loading dialog: $dialogText")
            return
        }

        if (dialogText.isBlank()) return

        processDialog(rootNode, dialogText)
    }

    /**
     * Central dialog processor:
     * - If replyQueue has items: fills and submits next reply.
     * - If replyQueue is empty: treats dialog as the final result, clicks OK, and emits.
     */
    private fun processDialog(rootNode: AccessibilityNodeInfo, dialogText: String) {
        val hasRepliesLeft = synchronized(replyQueue) { replyQueue.isNotEmpty() }

        if (hasRepliesLeft) {
            isProcessingDialog = true
            val currentReply = synchronized(replyQueue) {
                if (replyQueue.isNotEmpty()) replyQueue.removeAt(0) else null
            } ?: run {
                isProcessingDialog = false
                return
            }

            Log.d("UssdAccessibility", "Expecting input dialog for reply: $currentReply (remaining: ${replyQueue.size})")

            CoroutineScope(Dispatchers.Main).launch {
                val initialEdit = rootNode.findAccessibilityNodeInfosByViewId("android:id/input").firstOrNull()
                    ?: findEditText(rootNode)
                var targetNode: AccessibilityNodeInfo? = if (initialEdit != null) rootNode else null

                if (targetNode == null) {
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
                }

                if (targetNode != null && isTelephonyPackage(targetNode.packageName?.toString())) {
                    Log.d("UssdAccessibility", "EditText ready. Submitting reply: $currentReply")
                    val ok = fillAndSubmit(targetNode, currentReply)
                    Log.d("UssdAccessibility", "Reply submission result: $ok")
                } else {
                    Log.w("UssdAccessibility", "No EditText found in telephony window after waiting 10s")
                    val freshRoot = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                        ?: findUssdRootNode() ?: rootNode
                    val text = extractText(freshRoot).ifBlank { dialogText }
                    _ussdDialogFlow.tryEmit(UssdDialogEvent(text = text))
                    clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH"))
                }

                // 200ms guard (same as Geesh App) — prevents same dialog from being processed twice
                delay(200)
                isProcessingDialog = false
            }
        } else {
            isProcessingDialog = true
            Log.d("UssdAccessibility", "Final USSD dialog detected: $dialogText")

            CoroutineScope(Dispatchers.Main).launch {
                val freshRoot = rootInActiveWindow?.takeIf { isTelephonyPackage(it.packageName?.toString()) }
                    ?: findUssdRootNode() ?: rootNode
                val finalText = extractText(freshRoot).ifBlank { dialogText }

                _ussdDialogFlow.tryEmit(UssdDialogEvent(text = finalText))
                Log.d("UssdAccessibility", "Emitted final USSD result: $finalText")

                delay(300)
                clickButton(freshRoot, listOf("OK", "DISMISS", "CANCEL", "DONE", "XIDH", "KA SAAR", "HAA"))

                delay(300)
                isProcessingDialog = false
            }
        }
    }

    /**
     * Searches interactive windows strictly for telephony/dialer windows.
     * Never inspects user apps or lockscreen notification shades.
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
            if (text.contains("somtel") || text.contains("telesom") || text.contains("zaad") ||
                text.contains("shub") || text.contains("geli") || text.contains("pin") ||
                text.contains("hadhaag") || text.contains("haraag") || text.contains("dhigatay") ||
                text.contains("dirtay") || text.contains("wareejisay") || text.contains("lacag") ||
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
     *
     * GEESH ARCHITECTURE — Clipboard PASTE FIRST (works on lock screen).
     * Android security blocks ACTION_SET_TEXT on locked devices but allows PASTE.
     * ACTION_SET_TEXT is only used as fallback if paste left the field empty.
     */
    private suspend fun fillAndSubmit(node: AccessibilityNodeInfo, text: String): Boolean {
        val nodePkg = node.packageName?.toString() ?: ""
        if (!isTelephonyPackage(nodePkg)) {
            Log.w("UssdAccessibility", "Blocked fillAndSubmit on non-telephony package: $nodePkg")
            return false
        }

        val target = node.findAccessibilityNodeInfosByViewId("android:id/input").firstOrNull()
            ?: node.findAccessibilityNodeInfosByViewId("com.sh.smart.caller:id/input").firstOrNull()
            ?: node.findAccessibilityNodeInfosByViewId("com.android.phone:id/input").firstOrNull()
            ?: findEditText(node)

        if (target == null) {
            Log.e("UssdAccessibility", "No EditText found in USSD dialog — cannot enter reply")
            return false
        }

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        delay(200)

        // PRIMARY: Clipboard PASTE — works even when phone is locked
        // Android allows clipboard paste on lock screen but blocks ACTION_SET_TEXT
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("ussd_reply", text))
        delay(150)
        target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        delay(200)

        // FALLBACK: ACTION_SET_TEXT only if clipboard paste left the field empty
        val currentText = target.text?.toString() ?: ""
        if (currentText.isBlank()) {
            Log.w("UssdAccessibility", "Clipboard paste left field empty — trying ACTION_SET_TEXT fallback")
            val bundle = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
            delay(200)
        } else {
            Log.d("UssdAccessibility", "Clipboard paste successful — field has: '$currentText'")
        }

        // Click Send / Positive button
        val sent = clickButton(node, listOf("SEND", "Send", "OK", "Ok", "REPLY", "Reply", "DIR", "Dir", "HAA", "Haa", "GELI", "Geli"))
        Log.d("UssdAccessibility", "Send button clicked: $sent for reply: $text")
        return sent
    }

    /**
     * Finds EditText using Geesh App's simpler check (className only, no isEditable requirement).
     * isEditable flag is sometimes false on locked devices even for real EditText fields.
     */
    private fun findEditText(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.className?.toString()?.contains("EditText", ignoreCase = true) == true) return node
        for (i in 0 until node.childCount) {
            val r = findEditText(node.getChild(i))
            if (r != null) return r
        }
        return null
    }

    private fun clickButton(node: AccessibilityNodeInfo, labels: List<String>): Boolean {
        val standardBtnIds = listOf(
            "android:id/button1",
            "com.android.phone:id/button1",
            "com.sh.smart.caller:id/button1",
            "com.transsion.telephony:id/button1",
            "com.transsion.smartcaller:id/button1"
        )
        for (id in standardBtnIds) {
            val btns = node.findAccessibilityNodeInfosByViewId(id)
            for (btn in btns) {
                if (btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.isClickable && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
            }
        }

        for (label in labels) {
            val buttons = node.findAccessibilityNodeInfosByText(label)
            for (btn in buttons) {
                if (btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.isClickable && btn.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                if (btn.parent?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
            }
        }
        return false
    }

    override fun onInterrupt() { Log.w("UssdAccessibility", "Service interrupted") }

    override fun onDestroy() {
        stopSession()
        if (instance == this) instance = null
        isServiceActive = false
        super.onDestroy()
    }
}

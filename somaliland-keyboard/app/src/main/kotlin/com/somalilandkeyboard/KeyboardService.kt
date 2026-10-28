package com.somalilandkeyboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.inputmethodservice.Keyboard
import android.inputmethodservice.KeyboardView
import android.net.Uri
import android.os.Build
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.*
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import com.somalilandkeyboard.data.FlagData
import com.somalilandkeyboard.data.FlagItem
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

@Suppress("DEPRECATION")
class KeyboardService : InputMethodService(), KeyboardView.OnKeyboardActionListener {

    private var keyboardView: KeyboardView? = null
    private var emojiPanel: LinearLayout? = null
    private var flagPanel: LinearLayout? = null
    private var mainContainer: LinearLayout? = null
    private var keyboard: Keyboard? = null
    private var isCaps = false
    private var activePanel: String = "keyboard" // "keyboard", "emoji", "flags"

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(R.layout.keyboard_view, null) as LinearLayout
        mainContainer = root

        keyboardView = root.findViewById(R.id.keyboardView)
        emojiPanel = root.findViewById(R.id.emojiPanel)
        flagPanel = root.findViewById(R.id.flagPanel)

        // Initialize keyboard
        keyboard = Keyboard(this, R.xml.keyboard)
        keyboardView?.keyboard = keyboard
        keyboardView?.setOnKeyboardActionListener(this)
        keyboardView?.isPreviewEnabled = false

        // Setup Toolbar buttons
        root.findViewById<ImageButton>(R.id.btnKeyboard)?.setOnClickListener { showPanel("keyboard") }
        root.findViewById<ImageButton>(R.id.btnEmoji)?.setOnClickListener { showPanel("emoji") }
        root.findViewById<ImageButton>(R.id.btnFlags)?.setOnClickListener { showPanel("flags") }
        root.findViewById<ImageView>(R.id.toolbarFlagBadge)?.setOnClickListener { showPanel("flags") }

        // Setup Panels
        setupEmojiPanel(root)
        setupFlagPanel(root)

        showPanel("keyboard")
        return root
    }

    private fun showPanel(panel: String) {
        activePanel = panel
        keyboardView?.visibility = if (panel == "keyboard") View.VISIBLE else View.GONE
        emojiPanel?.visibility = if (panel == "emoji") View.VISIBLE else View.GONE
        flagPanel?.visibility = if (panel == "flags") View.VISIBLE else View.GONE
    }

    override fun onKey(primaryCode: Int, keyCodes: IntArray?) {
        val ic = currentInputConnection ?: return
        when (primaryCode) {
            Keyboard.KEYCODE_DELETE -> {
                ic.deleteSurroundingText(1, 0)
            }
            Keyboard.KEYCODE_SHIFT -> {
                isCaps = !isCaps
                keyboard?.isShifted = isCaps
                keyboardView?.invalidateAllKeys()
            }
            10 -> { // Enter key
                val action = currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION)
                if (action != null && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                    ic.performEditorAction(action)
                } else {
                    ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
                    ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
                }
            }
            -3 -> showPanel("emoji")
            -2 -> showPanel("flags")
            57419 -> { // Move cursor left
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT))
                ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_LEFT))
            }
            else -> {
                val code = primaryCode.toChar()
                val text = if (isCaps) code.uppercaseChar().toString() else code.toString()
                ic.commitText(text, 1)
            }
        }
    }

    private fun commitText(text: String) {
        currentInputConnection?.commitText(text, 1)
    }

    private fun setupEmojiPanel(root: View) {
        val grid = root.findViewById<GridLayout>(R.id.emojiGrid) ?: return
        grid.removeAllViews()

        val emojis = listOf(
            "\uD83D\uDE00", "\uD83D\uDE03", "\uD83D\uDE04", "\uD83D\uDE01", "\uD83D\uDE06", "\uD83D\uDE05",
            "\uD83D\uDE02", "\uD83E\uDD23", "\uD83D\uDE0A", "\uD83D\uDE07", "\uD83D\uDE42", "\uD83D\uDE43",
            "\uD83D\uDE09", "\uD83D\uDE0C", "\uD83D\uDE0D", "\uD83E\uDD70", "\uD83D\uDE18", "\uD83D\uDE17",
            "\uD83D\uDE0B", "\uD83D\uDE1B", "\uD83D\uDE1C", "\uD83E\uDD2A", "\uD83D\uDE1D", "\uD83E\uDD11",
            "\uD83E\uDD17", "\uD83E\uDD2D", "\uD83E\uDD2B", "\uD83E\uDD14", "\uD83E\uDD10", "\uD83E\uDD28",
            "\uD83D\uDE10", "\uD83D\uDE11", "\uD83D\uDE36", "\uD83D\uDE0F", "\uD83D\uDE12", "\uD83D\uDE44",
            "\uD83D\uDE2C", "\uD83E\uDD25", "\uD83D\uDE0C", "\uD83D\uDE14", "\uD83D\uDE2A", "\uD83E\uDD24",
            "\uD83D\uDE34", "\uD83D\uDE37", "\uD83E\uDD12", "\uD83E\uDD15", "\uD83E\uDD22", "\uD83E\uDD2E",
            "\uD83E\uDD75", "\uD83E\uDD76", "\uD83E\uDD74", "\uD83D\uDE35", "\uD83E\uDD2F", "\uD83E\uDD20",
            "\uD83E\uDD73", "\uD83D\uDE0E", "\uD83E\uDD13", "\uD83E\uDDD0", "\uD83D\uDE15", "\uD83D\uDE1F",
            "\uD83D\uDE41", "\uD83D\uDE2E", "\uD83D\uDE2F", "\uD83D\uDE32", "\uD83D\uDE33", "\uD83E\uDD7A",
            "\uD83D\uDE26", "\uD83D\uDE27", "\uD83D\uDE28", "\uD83D\uDE30", "\uD83D\uDE25", "\uD83D\uDE22",
            "\uD83D\uDE2D", "\uD83D\uDE31", "\uD83D\uDE16", "\uD83D\uDE23", "\uD83D\uDE1E", "\uD83D\uDE13",
            "\uD83D\uDE29", "\uD83D\uDE2B", "\uD83E\uDD71", "\uD83D\uDE24", "\uD83D\uDE21", "\uD83D\uDE20",
            "\uD83D\uDC4D", "\uD83D\uDC4E", "\uD83D\uDC4F", "\uD83D\uDE4C", "\uD83D\uDC50", "\uD83E\uDD32",
            "\uD83E\uDD1D", "\uD83D\uDE4F", "\uD83D\uDCAA", "\u2764\uFE0F", "\uD83D\uDC9A", "\uD83E\uDD0D",
            "\uD83D\uDDA4", "\uD83D\uDCAF", "\uD83D\uDD25", "\u2728", "\uD83C\uDF89", "\u2B50",
            "\uD83D\uDC2A", "\uD83D\uDD4C", "\u262A\uFE0F", "\uD83D\uDCF1", "\uD83D\uDCB5", "\uD83D\uDE80"
        )

        val paddingPx = (8 * resources.displayMetrics.density).toInt()
        emojis.forEach { emoji ->
            val tv = TextView(this).apply {
                text = emoji
                textSize = 26f
                gravity = Gravity.CENTER
                setPadding(paddingPx, paddingPx, paddingPx, paddingPx)
                setOnClickListener { commitText(emoji) }
            }
            grid.addView(tv)
        }
    }

    private fun setupFlagPanel(root: View) {
        val searchField = root.findViewById<EditText>(R.id.flagSearch) ?: return
        val clearBtn = root.findViewById<ImageButton>(R.id.btnClearSearch)
        val grid = root.findViewById<GridLayout>(R.id.flagGrid) ?: return

        clearBtn?.setOnClickListener {
            searchField.text.clear()
        }

        fun populateFlags(query: String) {
            grid.removeAllViews()
            val list = FlagData.search(query)

            list.forEach { item ->
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    setPadding(10, 10, 10, 10)
                    setBackgroundColor(Color.parseColor("#1E293B"))
                    val params = GridLayout.LayoutParams().apply {
                        width = 0
                        height = GridLayout.LayoutParams.WRAP_CONTENT
                        columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                        setMargins(8, 8, 8, 8)
                    }
                    layoutParams = params
                }

                if (item.drawableResName.isNotEmpty()) {
                    // Somaliland — show the real waving flag image + tap to insert
                    val iv = ImageView(this).apply {
                        setImageResource(R.drawable.flag_somaliland)
                        layoutParams = LinearLayout.LayoutParams(110, 65).apply {
                            gravity = Gravity.CENTER_HORIZONTAL
                        }
                        scaleType = ImageView.ScaleType.FIT_CENTER
                    }

                    val nameLabel = TextView(this).apply {
                        text = item.name
                        textSize = 11f
                        setTextColor(Color.parseColor("#38BDF8"))
                        gravity = Gravity.CENTER
                        setPadding(0, 2, 0, 0)
                        maxLines = 1
                    }

                    val hintLabel = TextView(this).apply {
                        text = "Calanka Somaliland"
                        textSize = 9f
                        setTextColor(Color.parseColor("#94A3B8"))
                        gravity = Gravity.CENTER
                        setPadding(0, 1, 0, 2)
                    }

                    // Two buttons: [Dir Sawir] and [Koobiyi]
                    val actionRow = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        )
                    }

                    val btnSend = TextView(this).apply {
                        text = "Dir Sawir"
                        textSize = 9f
                        setTextColor(Color.WHITE)
                        setBackgroundColor(Color.parseColor("#2563EB"))
                        setPadding(6, 4, 6, 4)
                        gravity = Gravity.CENTER
                        val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                            setMargins(2, 2, 2, 2)
                        }
                        layoutParams = lp
                        setOnClickListener {
                            sendSomalilandFlagSticker()
                        }
                    }

                    val btnCopy = TextView(this).apply {
                        text = "Koobiyi"
                        textSize = 9f
                        setTextColor(Color.WHITE)
                        setBackgroundColor(Color.parseColor("#059669"))
                        setPadding(6, 4, 6, 4)
                        gravity = Gravity.CENTER
                        val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                            setMargins(2, 2, 2, 2)
                        }
                        layoutParams = lp
                        setOnClickListener {
                            copySomalilandFlagToClipboard()
                        }
                    }

                    actionRow.addView(btnSend)
                    actionRow.addView(btnCopy)

                    card.addView(iv)
                    card.addView(nameLabel)
                    card.addView(hintLabel)
                    card.addView(actionRow)

                    // Primary tap on the card itself: always insert something visible
                    card.setOnClickListener {
                        sendSomalilandFlagSticker()
                    }

                    card.setOnLongClickListener {
                        copySomalilandFlagToClipboard()
                        true
                    }

                } else if (item.emoji != null) {
                    val tvEmoji = TextView(this).apply {
                        text = item.emoji
                        textSize = 34f
                        gravity = Gravity.CENTER
                    }

                    val tvName = TextView(this).apply {
                        text = item.name
                        textSize = 10f
                        setTextColor(Color.parseColor("#E2E8F0"))
                        gravity = Gravity.CENTER
                        maxLines = 1
                    }

                    card.addView(tvEmoji)
                    card.addView(tvName)

                    card.setOnClickListener {
                        commitText(item.emoji)
                    }
                }

                grid.addView(card)
            }
        }

        populateFlags("")

        searchField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val q = s?.toString() ?: ""
                clearBtn?.visibility = if (q.isNotEmpty()) View.VISIBLE else View.GONE
                populateFlags(q)
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    /**
     * Inserts the Somaliland flag into the current text field.
     *
     * Strategy — guaranteed something ALWAYS appears:
     * 1. Try Android commitContent (inserts the real PNG waving flag image).
     *    This works in Telegram, WhatsApp, Signal, Google Messages.
     * 2. If commitContent fails → fall back to commitText so text is ALWAYS inserted.
     */
    private fun sendSomalilandFlagSticker() {
        val ic = currentInputConnection
        val editorInfo = currentInputEditorInfo

        if (ic == null) {
            Log.w("KeyboardService", "sendSomalilandFlagSticker: no InputConnection")
            return
        }

        // Step 1: Try rich commitContent (actual PNG image)
        var committed = false
        if (editorInfo != null) {
            try {
                val stickersDir = File(cacheDir, "stickers").apply { if (!exists()) mkdirs() }
                val stickerFile = File(stickersDir, "somaliland_flag.png")
                val bitmap = BitmapFactory.decodeResource(resources, R.drawable.flag_somaliland)
                if (bitmap != null) {
                    FileOutputStream(stickerFile).use { out ->
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    }
                    val contentUri = FileProvider.getUriForFile(
                        this, "com.somalilandkeyboard.fileprovider", stickerFile
                    )
                    try {
                        grantUriPermission(
                            editorInfo.packageName, contentUri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        )
                    } catch (e2: Exception) {
                        Log.w("KeyboardService", "grantUri failed: ${e2.message}")
                    }
                    val desc = ClipDescription("Somaliland Flag", arrayOf("image/png", "image/*"))
                    val info = InputContentInfoCompat(contentUri, desc, null)
                    val flags2 = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1)
                        InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION else 0
                    committed = InputConnectionCompat.commitContent(ic, editorInfo, info, flags2, null)
                    // Also copy to clipboard
                    try {
                        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newUri(contentResolver, "Somaliland Flag", contentUri))
                    } catch (e3: Exception) {
                        Log.w("KeyboardService", "clipboard: ${e3.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e("KeyboardService", "commitContent error: ${e.message}", e)
                committed = false
            }
        }

        // Step 2: ALWAYS insert visible text if image insertion did not succeed.
        // This guarantees something ALWAYS appears in the text field.
        if (!committed) {
            // Somaliland flag as text — visible in all apps
            // \uD83C\uDDF8\uD83C\uDDF1 = regional indicator S + L (not officially a flag but better than nothing)
            ic.commitText("\uD83C\uDDF8\uD83C\uDDF1", 1)
        }
    }

    /**
     * Copies the Somaliland flag image to clipboard.
     */
    private fun copySomalilandFlagToClipboard() {
        try {
            val stickersDir = File(cacheDir, "stickers").apply { if (!exists()) mkdirs() }
            val stickerFile = File(stickersDir, "somaliland_flag.png")
            val bitmap = BitmapFactory.decodeResource(resources, R.drawable.flag_somaliland)
            FileOutputStream(stickerFile).use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) }
            val contentUri = FileProvider.getUriForFile(this, "com.somalilandkeyboard.fileprovider", stickerFile)
            val editorInfo = currentInputEditorInfo
            if (editorInfo != null) {
                grantUriPermission(editorInfo.packageName, contentUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newUri(contentResolver, "Somaliland Flag", contentUri))
            Toast.makeText(this, "Calanka waa la koobiyeeyay! Riix Paste.", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e("KeyboardService", "copySomalilandFlagToClipboard error", e)
        }
    }

    override fun onPress(primaryCode: Int) {}
    override fun onRelease(primaryCode: Int) {}
    override fun onText(text: CharSequence?) { commitText(text.toString()) }
    override fun swipeLeft() {}
    override fun swipeRight() {}
    override fun swipeDown() {}
    override fun swipeUp() {}

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && activePanel != "keyboard") {
            showPanel("keyboard")
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}

package com.somalilandkeyboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.inputmethodservice.Keyboard
import android.inputmethodservice.KeyboardView
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.*
import androidx.core.content.ContextCompat
import com.somalilandkeyboard.data.FlagData
import com.somalilandkeyboard.data.FlagItem

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
            "😀", "😃", "😄", "😁", "😆", "😅",
            "😂", "🤣", "😊", "😇", "🙂", "🙃",
            "😉", "😌", "😍", "🥰", "😘", "😗",
            "😋", "😛", "😜", "🤪", "😝", "🤑",
            "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
            "😐", "😑", "😶", "😏", "😒", "🙄",
            "😬", "🤥", "😌", "😔", "😪", "🤤",
            "😴", "😷", "🤒", "🤕", "🤢", "🤮",
            "🥵", "🥶", "🥴", "😵", "🤯", "🤠",
            "🥳", "😎", "🤓", "🧐", "😕", "😟",
            "🙁", "😮", "😯", "😲", "😳", "🥺",
            "😦", "😧", "😨", "😰", "😥", "😢",
            "😭", "😱", "😖", "😣", "😞", "😓",
            "😩", "😫", "🥱", "😤", "😡", "😠",
            "👍", "👎", "👏", "🙌", "👐", "🤲",
            "🤝", "🙏", "💪", "❤️", "💚", "🤍",
            "🖤", "💯", "🔥", "✨", "🎉", "⭐",
            "🐪", "🕌", "☪️", "📱", "💵", "🚀"
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
                    setPadding(12, 12, 12, 12)
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
                    // Custom high-res flag (Somaliland)
                    val iv = ImageView(this).apply {
                        val resId = resources.getIdentifier(item.drawableResName, "drawable", packageName)
                        if (resId != 0) {
                            setImageDrawable(ContextCompat.getDrawable(this@KeyboardService, resId))
                        } else {
                            setImageResource(R.drawable.flag_somaliland)
                        }
                        layoutParams = LinearLayout.LayoutParams(110, 70).apply {
                            gravity = Gravity.CENTER_HORIZONTAL
                        }
                        scaleType = ImageView.ScaleType.FIT_CENTER
                    }

                    val nameLabel = TextView(this).apply {
                        text = item.name
                        textSize = 11f
                        setTextColor(Color.parseColor("#38BDF8"))
                        gravity = Gravity.CENTER
                        setPadding(0, 6, 0, 0)
                        maxLines = 1
                    }

                    val badge = TextView(this).apply {
                        text = "⭐ FEATURED"
                        textSize = 8f
                        setTextColor(Color.parseColor("#34D399"))
                        gravity = Gravity.CENTER
                    }

                    card.addView(iv)
                    card.addView(nameLabel)
                    card.addView(badge)

                    card.setOnClickListener {
                        handleSomalilandSelection()
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

    private fun handleSomalilandSelection() {
        // 1. Commit text representation
        commitText("🏳️ Somaliland")

        // 2. Put text and flag description on clipboard
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Somaliland Flag", "Jamhuuriyadda Somaliland 🇸🇱")
        cm.setPrimaryClip(clip)

        Toast.makeText(this, getString(R.string.somaliland_flag_copied), Toast.LENGTH_SHORT).show()
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

package com.somalilandkeyboard

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var btnEnable: Button
    private lateinit var btnSelect: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        btnEnable = findViewById(R.id.btnEnableKeyboard)
        btnSelect = findViewById(R.id.btnSelectKeyboard)

        btnEnable.setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }

        btnSelect.setOnClickListener {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }

        checkKeyboardStatus()
    }

    override fun onResume() {
        super.onResume()
        checkKeyboardStatus()
    }

    private fun checkKeyboardStatus() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        val enabledList = imm.enabledInputMethodList
        val isEnabled = enabledList.any { it.packageName == packageName }

        if (isEnabled) {
            statusText.text = "✅ Somaliland Keyboard waa shidanyahay (Enabled)!"
            statusText.setTextColor(Color.parseColor("#34D399"))
            btnSelect.isEnabled = true
            btnSelect.alpha = 1.0f
        } else {
            statusText.text = "⚠️ Somaliland Keyboard weli lama shidin. Fadlan raac Tallaabada 1."
            statusText.setTextColor(Color.parseColor("#FCD34D"))
            btnSelect.isEnabled = false
            btnSelect.alpha = 0.5f
        }
    }
}

package com.mumin.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import com.mumin.app.local.LocalPrefs
import com.mumin.app.ui.screens.LoginScreen
import com.mumin.app.ui.screens.MuminMainScreen
import com.mumin.app.ui.theme.MuminTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MuminTheme {
                val context = androidx.compose.ui.platform.LocalContext.current
                val prefs = remember { LocalPrefs(context) }
                var isLoggedIn by remember { mutableStateOf(prefs.isLoggedIn) }

                if (isLoggedIn) {
                    MuminMainScreen(onLogout = {
                        prefs.clear()
                        isLoggedIn = false
                    })
                } else {
                    LoginScreen(onLoginSuccess = {
                        isLoggedIn = true
                    })
                }
            }
        }
    }
}

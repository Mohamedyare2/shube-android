package com.geesh.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.geesh.app.ui.screens.GeeshMainScreen
import com.geesh.app.ui.theme.GeeshTheme
import androidx.compose.runtime.*
import com.geesh.app.ui.screens.LoginScreen
import com.geesh.app.local.LocalPrefs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GeeshTheme {
                val context = androidx.compose.ui.platform.LocalContext.current
                val prefs = remember { LocalPrefs(context) }
                var isLoggedIn by remember { mutableStateOf(prefs.accessToken != null) }

                if (isLoggedIn) {
                    GeeshMainScreen(onLogout = {
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

package com.geesh.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import com.geesh.app.local.LocalPrefs
import com.geesh.app.ui.screens.ActivationScreen
import com.geesh.app.ui.screens.GeeshMainScreen
import com.geesh.app.ui.screens.LoginScreen
import com.geesh.app.ui.theme.GeeshTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Allow app to show and turn screen on over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        enableEdgeToEdge()
        setContent {
            GeeshTheme {
                val context = androidx.compose.ui.platform.LocalContext.current
                val prefs = remember { LocalPrefs(context) }
                var isLoggedIn by remember { mutableStateOf(prefs.accessToken != null) }
                var isLicenseActive by remember { mutableStateOf(prefs.isLicenseActive()) }

                // Periodic check while app is open to auto-lock if time expires
                LaunchedEffect(Unit) {
                    while (true) {
                        kotlinx.coroutines.delay(10_000L)
                        isLicenseActive = prefs.isLicenseActive()
                    }
                }

                if (!isLoggedIn) {
                    LoginScreen(onLoginSuccess = {
                        isLoggedIn = true
                        isLicenseActive = prefs.isLicenseActive()
                    })
                } else if (!isLicenseActive) {
                    ActivationScreen(
                        onActivationSuccess = {
                            isLicenseActive = true
                        },
                        onLogout = {
                            prefs.clear()
                            isLoggedIn = false
                            isLicenseActive = false
                        }
                    )
                } else {
                    GeeshMainScreen(onLogout = {
                        prefs.clear()
                        isLoggedIn = false
                        isLicenseActive = false
                    })
                }
            }
        }
    }
}

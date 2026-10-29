package com.geesh.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.geesh.app.local.LocalPrefs
import com.geesh.app.ui.screens.AppLockScreen
import com.geesh.app.ui.screens.GeeshMainScreen
import com.geesh.app.ui.screens.LoginScreen
import com.geesh.app.ui.theme.GeeshTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GeeshTheme {
                val context = androidx.compose.ui.platform.LocalContext.current
                val prefs = remember { LocalPrefs(context) }
                var isLoggedIn by remember { mutableStateOf(prefs.accessToken != null) }

                val isLockConfigured = prefs.appLockEnabled && !prefs.appLockPin.isNullOrBlank()
                var isAppUnlocked by remember { mutableStateOf(!isLockConfigured) }

                val lifecycleOwner = LocalLifecycleOwner.current

                // Automatically re-lock app when minimized or phone screen turns off
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_STOP) {
                            if (prefs.appLockEnabled && !prefs.appLockPin.isNullOrBlank()) {
                                isAppUnlocked = false
                            }
                        }
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose {
                        lifecycleOwner.lifecycle.removeObserver(observer)
                    }
                }

                if (prefs.appLockEnabled && !prefs.appLockPin.isNullOrBlank() && !isAppUnlocked) {
                    AppLockScreen(
                        correctPin = prefs.appLockPin ?: "",
                        onUnlocked = { isAppUnlocked = true }
                    )
                } else {
                    if (isLoggedIn) {
                        GeeshMainScreen(onLogout = {
                            prefs.clear()
                            isLoggedIn = false
                            isAppUnlocked = true
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
}

package com.shube.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.shube.app.ui.screens.LoginScreen
import com.shube.app.ui.screens.SplashScreen
import com.shube.app.ui.screens.StatusScreen
import com.shube.app.ui.theme.ShubeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Allow activity to show and turn screen on over the lock screen
        // so USSD dialogs remain reachable even when the device is locked.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        setContent {
            ShubeTheme(darkTheme = true) {
                ShubeNavGraph()
            }
        }
    }
}

@Composable
fun ShubeNavGraph() {
    val navController = rememberNavController()

    NavHost(
        navController   = navController,
        startDestination = "splash",
        enterTransition  = { fadeIn(animationSpec = tween(350)) + slideInHorizontally(animationSpec = tween(350)) { it / 8 } },
        exitTransition   = { fadeOut(animationSpec = tween(250)) }
    ) {
        composable("splash") {
            SplashScreen(
                onNavigateToLogin = {
                    navController.navigate("login") { popUpTo("splash") { inclusive = true } }
                },
                onNavigateToDashboard = { deviceId ->
                    navController.navigate("status/$deviceId") { popUpTo("splash") { inclusive = true } }
                }
            )
        }

        composable("login") {
            LoginScreen(
                onLoginSuccess = { deviceId ->
                    navController.navigate("status/$deviceId") { popUpTo("login") { inclusive = true } }
                }
            )
        }

        composable("status/{deviceId}") { backStackEntry ->
            val deviceId = backStackEntry.arguments?.getString("deviceId") ?: ""
            StatusScreen(
                deviceId = deviceId,
                onUnpair = {
                    navController.navigate("login") { popUpTo(0) { inclusive = true } }
                }
            )
        }
    }
}

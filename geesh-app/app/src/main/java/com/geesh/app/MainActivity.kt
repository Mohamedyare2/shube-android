package com.geesh.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.geesh.app.ui.screens.GeeshMainScreen
import com.geesh.app.ui.theme.GeeshTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GeeshTheme {
                GeeshMainScreen()
            }
        }
    }
}

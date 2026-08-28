package com.shube.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import com.shube.app.ui.theme.ShubeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // This is a placeholder for the full Jetpack Compose Navigation graph.
        // The full app would include LoginScreen, DashboardScreen, SetupWizard, etc.
        
        setContent {
            ShubeTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Text(text = "SHUBE Operator App\nNavigation Graph Placeholder")
                }
            }
        }
    }
}

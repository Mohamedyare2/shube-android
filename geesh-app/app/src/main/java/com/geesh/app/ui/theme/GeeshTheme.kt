package com.geesh.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val GeeshDark = darkColorScheme(
    primary         = Color(0xFF7C3AED),
    secondary       = Color(0xFF10B981),
    background      = Color(0xFF0F0A1E),
    surface         = Color(0xFF1A1035),
    onPrimary       = Color.White,
    onBackground    = Color.White,
    onSurface       = Color.White,
)

@Composable
fun GeeshTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = GeeshDark,
        content     = content
    )
}

package com.mumin.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val MuminEmeraldPrimary = Color(0xFF10B981)
val MuminEmeraldDark    = Color(0xFF047857)
val MuminEmeraldLight   = Color(0xFF34D399)
val MuminGold           = Color(0xFFF59E0B)
val MuminDarkBg         = Color(0xFF062118)
val MuminCardBg         = Color(0xFF0C3829)
val MuminBorder         = Color(0xFF165B42)
val MuminTextPrimary    = Color(0xFFF0FDF4)
val MuminTextSecondary  = Color(0xFFA7F3D0)

private val DarkColorScheme = darkColorScheme(
    primary = MuminEmeraldPrimary,
    secondary = MuminGold,
    tertiary = MuminEmeraldLight,
    background = MuminDarkBg,
    surface = MuminCardBg,
    onPrimary = Color.White,
    onSecondary = Color.Black,
    onTertiary = Color.White,
    onBackground = MuminTextPrimary,
    onSurface = MuminTextPrimary
)

@Composable
fun MuminTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}

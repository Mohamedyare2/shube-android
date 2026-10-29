package com.geesh.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun AppLockScreen(
    correctPin: String,
    onUnlocked: () -> Unit
) {
    var enteredPin by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val targetLength = correctPin.length.coerceAtLeast(4)

    fun handleDigit(digit: String) {
        if (enteredPin.length < targetLength) {
            val newPin = enteredPin + digit
            enteredPin = newPin
            isError = false
            errorMessage = null

            if (newPin.length == targetLength) {
                if (newPin == correctPin) {
                    onUnlocked()
                } else {
                    isError = true
                    errorMessage = "PIN-ku waa khalad! Mar kale isku day."
                    scope.launch {
                        delay(600)
                        enteredPin = ""
                    }
                }
            }
        }
    }

    fun handleBackspace() {
        if (enteredPin.isNotEmpty()) {
            enteredPin = enteredPin.dropLast(1)
            isError = false
            errorMessage = null
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(DarkBgStart, DarkBgEnd))),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // ── Shield & Lock Icon ─────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(listOf(PrimaryCyan.copy(alpha = 0.35f), Color.Transparent))
                    )
                    .border(2.dp, PrimaryCyan.copy(alpha = 0.6f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(if (isError) "⚠️" else "🔒", fontSize = 36.sp)
            }

            Spacer(Modifier.height(18.dp))

            Text(
                "GEESH LA QUFLAY",
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White,
                letterSpacing = 2.sp
            )

            Text(
                "Geli PIN-ka sirta ah si aad u furto",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(Modifier.height(28.dp))

            // ── PIN Dot Indicators ─────────────────────────────────────────────
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (i in 0 until targetLength) {
                    val isFilled = i < enteredPin.length
                    val dotColor = when {
                        isError -> DangerRed
                        isFilled -> PrimaryCyan
                        else -> Color.White.copy(alpha = 0.15f)
                    }

                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(dotColor)
                            .border(1.5.dp, dotColor.copy(alpha = 0.8f), CircleShape)
                    )
                }
            }

            // Error feedback
            Box(modifier = Modifier.height(36.dp), contentAlignment = Alignment.Center) {
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = DangerRed,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // ── Numeric Keypad ─────────────────────────────────────────────────
            val keypad = listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
                listOf("", "0", "⌫")
            )

            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                keypad.forEach { row ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(22.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        row.forEach { key ->
                            if (key.isEmpty()) {
                                Spacer(Modifier.size(68.dp))
                            } else {
                                KeypadButton(
                                    text = key,
                                    isAction = key == "⌫",
                                    onClick = {
                                        if (key == "⌫") handleBackspace() else handleDigit(key)
                                    }
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                "🛡️ Qufulkani wuxuu ilaalinayaa taleefankaaga isagoo USSD-gu si toos ah u soconayo.",
                fontSize = 11.sp,
                color = Color.White.copy(alpha = 0.4f),
                lineHeight = 15.sp,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
    }
}

@Composable
private fun KeypadButton(
    text: String,
    isAction: Boolean = false,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(68.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        color = if (isAction) Color.White.copy(alpha = 0.06f) else CardSurface.copy(alpha = 0.8f),
        shape = CircleShape,
        border = CardDefaults.outlinedCardBorder().copy(
            brush = Brush.verticalGradient(
                listOf(CardBorder, Color.Transparent)
            )
        )
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text,
                fontSize = if (isAction) 20.sp else 24.sp,
                fontWeight = FontWeight.Bold,
                color = if (isAction) Color(0xFFCBD5E1) else Color.White
            )
        }
    }
}

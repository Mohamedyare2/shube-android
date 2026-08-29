package com.shube.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shube.app.local.DevicePreferences
import com.shube.app.worker.HeartbeatWorker
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToDashboard: (String) -> Unit
) {
    val context = LocalContext.current
    val prefs   = remember { DevicePreferences.getInstance(context) }

    val infiniteTransition = rememberInfiniteTransition(label = "splash")
    val gradientShift by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(5000, easing = LinearEasing), RepeatMode.Reverse),
        label = "grad"
    )

    var visible by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        delay(150)
        visible = true
        delay(1800)

        if (prefs.isPaired && prefs.deviceId != null) {
            // Already paired — resume heartbeat and go straight to dashboard
            HeartbeatWorker.schedule(context)
            onNavigateToDashboard(prefs.deviceId!!)
        } else {
            onNavigateToLogin()
        }
    }

    Box(
        modifier = Modifier.fillMaxSize().background(ShubeDark),
        contentAlignment = Alignment.Center
    ) {
        // Animated orbs
        Box(
            modifier = Modifier
                .size(450.dp)
                .offset(x = (-100).dp, y = (-150).dp + (gradientShift * 30).dp)
                .blur(160.dp)
                .background(
                    brush = Brush.radialGradient(colors = listOf(ShubeBlue.copy(alpha = 0.30f), Color.Transparent)),
                    shape = CircleShape
                )
        )
        Box(
            modifier = Modifier
                .size(350.dp)
                .offset(x = 120.dp, y = 100.dp + (gradientShift * (-20)).dp)
                .blur(130.dp)
                .background(
                    brush = Brush.radialGradient(colors = listOf(ShubePurple.copy(alpha = 0.22f), Color.Transparent)),
                    shape = CircleShape
                )
        )

        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(tween(600)) + scaleIn(initialScale = 0.82f, animationSpec = tween(600, easing = FastOutSlowInEasing))
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Logo
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .clip(RoundedCornerShape(28.dp))
                        .background(
                            brush = Brush.linearGradient(
                                colors = listOf(ShubeBlue, ShubePurple),
                                start = Offset(0f, 0f), end = Offset(300f, 300f)
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text("S", fontSize = 52.sp, fontWeight = FontWeight.Black, color = Color.White)
                }

                Text("SHUBE", fontSize = 36.sp, fontWeight = FontWeight.Black, color = Color.White, letterSpacing = 4.sp)
                Text("Smart Bundle Distribution", fontSize = 14.sp, color = Color(0xFF94A3B8), letterSpacing = 0.5.sp)

                Spacer(modifier = Modifier.height(32.dp))

                CircularProgressIndicator(modifier = Modifier.size(28.dp), color = ShubeBlue, strokeWidth = 2.5.dp, trackColor = ShubeBorder)

                Text(
                    if (prefs.isPaired) "Resuming session..." else "First-time setup",
                    fontSize = 12.sp, color = Color(0xFF64748B),
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

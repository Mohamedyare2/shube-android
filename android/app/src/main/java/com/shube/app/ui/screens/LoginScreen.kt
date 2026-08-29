package com.shube.app.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Wifi
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
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shube.app.local.DevicePreferences
import com.shube.app.network.ApiService
import kotlinx.coroutines.launch

// Brand Colors — shared across all screens
val ShubeBlue   = Color(0xFF3B82F6)
val ShubePurple = Color(0xFF8B5CF6)
val ShubeGreen  = Color(0xFF22C55E)
val ShubeDark   = Color(0xFF0F172A)
val ShubeCard   = Color(0xFF1E293B)
val ShubeBorder = Color(0xFF334155)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (deviceId: String) -> Unit = {}
) {
    val context = LocalContext.current
    val prefs   = remember { DevicePreferences.getInstance(context) }
    val api     = remember { ApiService.getInstance(context) }
    val scope   = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current

    var serverUrl   by remember { mutableStateOf(prefs.serverUrl) }
    var pairingCode by remember { mutableStateOf("") }
    var isLoading   by remember { mutableStateOf(false) }
    var error       by remember { mutableStateOf<String?>(null) }
    var showUrlEdit by remember { mutableStateOf(false) }

    // Animated gradient background
    val infiniteTransition = rememberInfiniteTransition(label = "bg")
    val gradientShift by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(6000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ), label = "gradient"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ShubeDark)
    ) {
        // Background glow orbs
        Box(
            modifier = Modifier
                .size(350.dp)
                .offset(x = (-80).dp + (gradientShift * 40).dp, y = (-80).dp)
                .blur(120.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(ShubeBlue.copy(alpha = 0.35f), Color.Transparent)
                    ),
                    shape = CircleShape
                )
        )
        Box(
            modifier = Modifier
                .size(300.dp)
                .align(Alignment.BottomEnd)
                .offset(x = 60.dp + (gradientShift * (-30)).dp, y = 60.dp)
                .blur(100.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(ShubePurple.copy(alpha = 0.30f), Color.Transparent)
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.height(60.dp))

            // Logo
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(ShubeBlue, ShubePurple),
                            start = Offset(0f, 0f), end = Offset(300f, 300f)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text("S", fontSize = 42.sp, fontWeight = FontWeight.Black, color = Color.White)
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text("SHUBE", fontSize = 34.sp, fontWeight = FontWeight.Black, color = Color.White, letterSpacing = 3.sp)
            Text("Operator Portal", fontSize = 14.sp, color = Color(0xFF94A3B8), letterSpacing = 1.sp, modifier = Modifier.padding(top = 4.dp))

            Spacer(modifier = Modifier.height(40.dp))

            // Main Card
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = ShubeCard,
                border = androidx.compose.foundation.BorderStroke(1.dp, ShubeBorder)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text("Connect This Device", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(
                        "Enter the 6-digit code from your Admin Dashboard to link this phone.",
                        fontSize = 13.sp, color = Color(0xFF94A3B8),
                        modifier = Modifier.padding(top = 6.dp, bottom = 22.dp),
                        lineHeight = 18.sp
                    )

                    // ── Server URL ──────────────────────────────────────────
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Server URL", fontSize = 12.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                        TextButton(
                            onClick = { showUrlEdit = !showUrlEdit },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(Icons.Rounded.Edit, contentDescription = null, tint = ShubeBlue, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(if (showUrlEdit) "Done" else "Edit", fontSize = 12.sp, color = ShubeBlue)
                        }
                    }

                    AnimatedVisibility(visible = showUrlEdit) {
                        OutlinedTextField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it; error = null },
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            label = { Text("Admin API URL") },
                            placeholder = { Text("http://192.168.1.x:5050") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { keyboardController?.hide(); showUrlEdit = false }),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ShubeBlue, unfocusedBorderColor = ShubeBorder,
                                focusedLabelColor = ShubeBlue, unfocusedLabelColor = Color(0xFF94A3B8),
                                cursorColor = ShubeBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White
                            ),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }

                    AnimatedVisibility(visible = !showUrlEdit) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF0F172A))
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Rounded.Wifi, contentDescription = null, tint = ShubeBlue, modifier = Modifier.size(16.dp))
                            Text(serverUrl.take(40), fontSize = 12.sp, color = Color(0xFF64748B))
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // ── Pairing Code ────────────────────────────────────────
                    OutlinedTextField(
                        value = pairingCode,
                        onValueChange = {
                            if (it.length <= 6 && it.all { c -> c.isDigit() }) {
                                pairingCode = it; error = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Pairing Code") },
                        placeholder = { Text("6-digit code") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { keyboardController?.hide() }),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ShubeBlue, unfocusedBorderColor = ShubeBorder,
                            focusedLabelColor = ShubeBlue, unfocusedLabelColor = Color(0xFF94A3B8),
                            cursorColor = ShubeBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp),
                        isError = error != null
                    )

                    AnimatedVisibility(visible = error != null) {
                        Text("⚠️ ${error ?: ""}", color = Color(0xFFEF4444), fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // ── Connect Button ──────────────────────────────────────
                    Button(
                        onClick = {
                            if (pairingCode.length != 6) { error = "Enter a valid 6-digit code"; return@Button }
                            if (serverUrl.isBlank()) { error = "Server URL is required"; return@Button }
                            keyboardController?.hide()
                            isLoading = true
                            error = null

                            scope.launch {
                                val cleanUrl = serverUrl.trimEnd('/')
                                prefs.serverUrl = cleanUrl
                                val result = api.pairDevice(pairingCode, cleanUrl)

                                if (result.success && result.deviceId != null) {
                                    prefs.deviceId   = result.deviceId
                                    prefs.operatorId = result.operatorId
                                    // Start heartbeat worker
                                    com.shube.app.worker.HeartbeatWorker.schedule(context)
                                    onLoginSuccess(result.deviceId)
                                } else {
                                    error = result.error ?: "Pairing failed. Check the code and try again."
                                }
                                isLoading = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ShubeBlue,
                            disabledContainerColor = ShubeBlue.copy(alpha = 0.5f)
                        ),
                        enabled = !isLoading && pairingCode.length == 6
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Color.White, strokeWidth = 2.5.dp)
                        } else {
                            Text("🔗  Connect Device", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                "📱  Open your Admin Dashboard → Devices\nto generate a pairing code.",
                color = Color(0xFF64748B), fontSize = 12.sp,
                textAlign = TextAlign.Center, lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}

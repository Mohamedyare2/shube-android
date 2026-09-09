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

    var serverUrl    by remember { mutableStateOf(prefs.serverUrl) }
    var username     by remember { mutableStateOf("") }
    var password     by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var pairingCode  by remember { mutableStateOf("") }
    var isLoading    by remember { mutableStateOf(false) }
    var error        by remember { mutableStateOf<String?>(null) }
    var showUrlEdit  by remember { mutableStateOf(false) }

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
                .padding(horizontal = 28.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            // ── Logo & Title ─────────────────────────────────────────
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(ShubeBlue, ShubePurple),
                            start = Offset(0f, 0f), end = Offset(100f, 100f)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text("📡", fontSize = 34.sp)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                "SHUBE GATEWAY",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 2.sp
            )

            Text(
                "Pair your device with the Admin Portal",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // ── Card ─────────────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = ShubeCard),
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        colors = listOf(ShubeBorder, ShubeBorder.copy(alpha = 0.3f))
                    )
                )
            ) {
                Column(modifier = Modifier.padding(22.dp)) {

                    // Server URL toggle row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "SERVER CONFIG",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF64748B),
                            letterSpacing = 1.sp
                        )
                        IconButton(
                            onClick = { showUrlEdit = !showUrlEdit },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(Icons.Rounded.Edit, contentDescription = null, tint = ShubeBlue, modifier = Modifier.size(14.dp))
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    AnimatedVisibility(visible = showUrlEdit) {
                        OutlinedTextField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Server URL") },
                            placeholder = { Text("https://admin.shube.so") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ShubeBlue, unfocusedBorderColor = ShubeBorder,
                                focusedLabelColor = ShubeBlue, unfocusedLabelColor = Color(0xFF94A3B8),
                                cursorColor = ShubeBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White
                            ),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // ── Username / Email ─────────────────────────────────────
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it; error = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Username or Email") },
                        placeholder = { Text("operator or name@example.com") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        leadingIcon = { Text("👤", fontSize = 16.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ShubeBlue, unfocusedBorderColor = ShubeBorder,
                            focusedLabelColor = ShubeBlue, unfocusedLabelColor = Color(0xFF94A3B8),
                            cursorColor = ShubeBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // ── Password ─────────────────────────────────────────────
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Password") },
                        placeholder = { Text("Website password") },
                        singleLine = true,
                        visualTransformation = if (showPassword) androidx.compose.ui.text.input.VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                        leadingIcon = { Text("🔒", fontSize = 16.sp) },
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Text(if (showPassword) "👁️" else "🙈", fontSize = 14.sp)
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ShubeBlue, unfocusedBorderColor = ShubeBorder,
                            focusedLabelColor = ShubeBlue, unfocusedLabelColor = Color(0xFF94A3B8),
                            cursorColor = ShubeBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // ── Pairing Code ────────────────────────────────────────
                    OutlinedTextField(
                        value = pairingCode,
                        onValueChange = {
                            if (it.length <= 6 && it.all { c -> c.isDigit() }) {
                                pairingCode = it; error = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Pairing Code (6-digit)") },
                        placeholder = { Text("Code-ka Website-ka") },
                        singleLine = true,
                        leadingIcon = { Text("🔢", fontSize = 16.sp) },
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
                            if (username.isBlank()) { error = "Fadlan gali Username ama Email-ka"; return@Button }
                            if (password.isBlank()) { error = "Fadlan gali Password-ka"; return@Button }
                            if (pairingCode.length != 6) { error = "Fadlan gali 6-da lambar ee Pairing Code-ka"; return@Button }
                            if (serverUrl.isBlank()) { error = "Server URL is required"; return@Button }
                            keyboardController?.hide()
                            isLoading = true
                            error = null

                            scope.launch {
                                val cleanUrl = serverUrl.trimEnd('/')
                                prefs.serverUrl = cleanUrl
                                val result = api.pairDevice(username, password, pairingCode, cleanUrl)

                                if (result.success && result.deviceId != null) {
                                    prefs.deviceId   = result.deviceId
                                    prefs.operatorId = result.operatorId
                                    // Save service key and init Supabase service client
                                    result.supabaseServiceKey?.let { key ->
                                        prefs.supabaseServiceKey = key
                                        com.shube.app.supabase.SupabaseService.initServiceClient(key)
                                    }
                                    // Start heartbeat worker
                                    com.shube.app.worker.HeartbeatWorker.schedule(context)
                                    onLoginSuccess(result.deviceId)
                                } else {
                                    error = result.error ?: "Isku-xirku ma guuleysan. Hubi xogtaada oo mar kale isku day."
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
                        enabled = !isLoading && username.isNotBlank() && password.isNotBlank() && pairingCode.length == 6
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Color.White, strokeWidth = 2.5.dp)
                        } else {
                            Text("🔗  Connect & Pair Device", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                "📱  1. Ku gal Username & Password-ka Website-ka\n2. Tag Dashboard → Devices oo riix 'Generate Code'\n3. Gali 6-da lambar si aad u xirto mobile-ka.",
                color = Color(0xFF94A3B8), fontSize = 12.sp,
                textAlign = TextAlign.Center, lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}

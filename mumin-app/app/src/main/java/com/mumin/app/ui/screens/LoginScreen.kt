package com.mumin.app.ui.screens

import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mumin.app.local.LocalPrefs
import com.mumin.app.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val coroutineScope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf(prefs.baseUrl) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showUrlEdit by remember { mutableStateOf(false) }

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
            .background(MuminDarkBg)
    ) {
        // Emerald background glows
        Box(
            modifier = Modifier
                .size(350.dp)
                .offset(x = (-80).dp + (gradientShift * 40).dp, y = (-80).dp)
                .blur(120.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(MuminEmeraldPrimary.copy(alpha = 0.35f), Color.Transparent)
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

            // Logo & Title
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(MuminEmeraldLight, MuminEmeraldDark),
                            start = Offset(0f, 0f), end = Offset(100f, 100f)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text("M", fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                "MU'MIN APP",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 2.sp
            )

            Text(
                "Automatic Same-Number Bundle Gateway",
                fontSize = 13.sp,
                color = MuminTextSecondary,
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MuminCardBg),
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        colors = listOf(MuminBorder, MuminBorder.copy(alpha = 0.3f))
                    )
                )
            ) {
                Column(modifier = Modifier.padding(22.dp)) {

                    AnimatedVisibility(visible = showUrlEdit) {
                        Column {
                            OutlinedTextField(
                                value = serverUrl,
                                onValueChange = { serverUrl = it; errorMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Server URL") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                                leadingIcon = { Text("🌍", fontSize = 16.sp) },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MuminEmeraldPrimary,
                                    unfocusedBorderColor = MuminBorder,
                                    focusedLabelColor = MuminEmeraldPrimary,
                                    unfocusedLabelColor = MuminTextSecondary.copy(alpha = 0.6f),
                                    cursorColor = MuminEmeraldPrimary,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                ),
                                shape = RoundedCornerShape(14.dp)
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                    }

                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it; errorMessage = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Username") },
                        placeholder = { Text("operator_name") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                        leadingIcon = { Text("👤", fontSize = 16.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MuminEmeraldPrimary,
                            unfocusedBorderColor = MuminBorder,
                            focusedLabelColor = MuminEmeraldPrimary,
                            unfocusedLabelColor = MuminTextSecondary.copy(alpha = 0.6f),
                            cursorColor = MuminEmeraldPrimary,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; errorMessage = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Password") },
                        placeholder = { Text("Your password") },
                        singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        leadingIcon = { Text("🔒", fontSize = 16.sp) },
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Text(if (showPassword) "👁️" else "🙈", fontSize = 14.sp)
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MuminEmeraldPrimary,
                            unfocusedBorderColor = MuminBorder,
                            focusedLabelColor = MuminEmeraldPrimary,
                            unfocusedLabelColor = MuminTextSecondary.copy(alpha = 0.6f),
                            cursorColor = MuminEmeraldPrimary,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    if (errorMessage != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFEF4444).copy(alpha = 0.15f)),
                            border = CardDefaults.outlinedCardBorder().copy(
                                brush = Brush.verticalGradient(
                                    listOf(Color(0xFFEF4444).copy(alpha = 0.5f), Color(0xFFEF4444).copy(alpha = 0.2f))
                                )
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = errorMessage!!,
                                color = Color(0xFFFCA5A5),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = {
                            if (username.isBlank() || password.isBlank()) {
                                errorMessage = "Fadlan geli magaca iyo sirta (username & password)"
                                return@Button
                            }
                            isLoading = true
                            errorMessage = null

                            val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

                            coroutineScope.launch {
                                try {
                                    val client = OkHttpClient()
                                    val json = "application/json; charset=utf-8".toMediaType()
                                    val body = JSONObject().apply {
                                        put("username", username.trim())
                                        put("password", password.trim())
                                        put("device_identifier", deviceId)
                                        put("device_name", android.os.Build.MODEL)
                                    }

                                    val req = Request.Builder()
                                        .url("${serverUrl.trimEnd('/')}/api/pair")
                                        .post(body.toString().toRequestBody(json))
                                        .build()

                                    val res = withContext(Dispatchers.IO) { client.newCall(req).execute() }
                                    val resBody = withContext(Dispatchers.IO) { res.body?.string() ?: "" }

                                    isLoading = false

                                    if (res.isSuccessful) {
                                        val data = JSONObject(resBody)
                                        prefs.baseUrl = serverUrl
                                        prefs.accessToken = data.optString("token", "logged_in")
                                        prefs.deviceId = data.optString("device_id", deviceId)
                                        prefs.operatorId = data.optString("operator_id", "")
                                        prefs.profileId = data.optString("profile_id", data.optString("operator_id", ""))
                                        prefs.username = username.trim()

                                        onLoginSuccess()
                                    } else {
                                        val errText = try { JSONObject(resBody).getString("error") } catch (e: Exception) { "Login failed: ${res.code}" }
                                        errorMessage = errText
                                    }
                                } catch (e: Exception) {
                                    isLoading = false
                                    errorMessage = e.message ?: "Connection error"
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MuminEmeraldPrimary,
                            disabledContainerColor = MuminEmeraldPrimary.copy(alpha = 0.5f)
                        ),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("GAL (LOGIN)", fontSize = 15.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    TextButton(
                        onClick = { showUrlEdit = !showUrlEdit },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (showUrlEdit) "Qari Server URL" else "Bedel Server-ka", color = MuminEmeraldLight)
                    }
                }
            }
        }
    }
}

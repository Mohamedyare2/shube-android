package com.geesh.app.ui.screens

import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geesh.app.local.LocalPrefs
import com.geesh.app.network.ApiClient
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val coroutineScope = rememberCoroutineScope()

    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf(prefs.baseUrl) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val bgGrad = Brush.verticalGradient(listOf(Color(0xFF0F0A1E), Color(0xFF1A1035)))

    Box(Modifier.fillMaxSize().background(bgGrad), contentAlignment = Alignment.Center) {
        Column(
            Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Geesh Login", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.height(8.dp))
            Text("Fadlan gal xogtaada si aad u isticmaasho app-ka", fontSize = 14.sp, color = Color.White.copy(alpha = 0.6f))
            
            Spacer(Modifier.height(32.dp))

            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.05f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.05f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.05f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.05f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.05f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.05f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            if (errorMessage != null) {
                Spacer(Modifier.height(16.dp))
                Text(errorMessage!!, color = Color(0xFFEF4444), fontSize = 14.sp)
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = {
                    if (username.isBlank() || password.isBlank()) {
                        errorMessage = "Fadlan buuxi dhammaan xogta"
                        return@Button
                    }
                    isLoading = true
                    errorMessage = null

                    val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

                    coroutineScope.launch {
                        val result = ApiClient.login(serverUrl, username, password, deviceId)
                        isLoading = false
                        result.fold(
                            onSuccess = { data ->
                                prefs.baseUrl = serverUrl
                                prefs.accessToken = data.getString("access_token")
                                prefs.username = data.getJSONObject("operator").getString("username")
                                
                                val operator = data.getJSONObject("operator")
                                if (operator.has("ussd_template") && !operator.isNull("ussd_template")) {
                                    prefs.ussdTemplate = operator.getString("ussd_template")
                                }
                                
                                onLoginSuccess()
                            },
                            onFailure = { err ->
                                errorMessage = err.message
                            }
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                } else {
                    Text("Gal (Login)", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

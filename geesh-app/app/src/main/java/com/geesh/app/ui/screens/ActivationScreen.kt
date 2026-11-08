package com.geesh.app.ui.screens

import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geesh.app.local.LocalPrefs
import com.geesh.app.network.ApiClient
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivationScreen(
    onActivationSuccess: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val scope = rememberCoroutineScope()

    var activationCode by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }

    val deviceId = remember {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "UNKNOWN_DEVICE"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(Color(0xFF0F172A), Color(0xFF020617))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            // Warning / Lock Icon
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(
                        brush = Brush.linearGradient(
                            colors = if (prefs.isDeviceRevoked) listOf(Color(0xFFEF4444), Color(0xFF991B1B))
                            else listOf(Color(0xFFF59E0B), Color(0xFFD97706))
                        ),
                        shape = RoundedCornerShape(24.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (prefs.isDeviceRevoked) "🚫" else "🔒",
                    fontSize = 40.sp
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = if (prefs.isDeviceRevoked) "QALABKAN WAA LA JOOJIYAY"
                else if (prefs.isClockTampered) "DIGNIIN: SAACADDA BAA LA BEDDELAY"
                else "RUKHSADDII WAY DHACDAY",
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = if (prefs.isDeviceRevoked) Color(0xFFEF4444) else Color(0xFFFBBF24),
                letterSpacing = 1.sp,
                textAlign = TextAlign.Center
            )

            Text(
                text = "Geesh App Offline License System",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Notice Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(16.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFF334155), Color(0xFF1E293B))
                    )
                )
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Sidee loo furaa app-ka?",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        fontSize = 15.sp,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    Text(
                        text = "1. Bixi lacagta adeegga bisha ama muddada aad rabto.\n" +
                                "2. Shid Internet-ka mobile-kaaga (hal mar oo keliya).\n" +
                                "3. Geli 8-da lambar ee uu Admin-ku kuu soo diray.\n" +
                                "4. Guji 'Xaqiiji & Fur'. Ka dib internet-ka waad damin kartaa.",
                        color = Color(0xFFCBD5E1),
                        fontSize = 13.sp,
                        lineHeight = 20.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Activation Input Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFF0EA5E9).copy(alpha = 0.5f), Color(0xFF334155))
                    )
                )
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Text(
                        text = "GELI 8-DA LAMBAR (ACTIVATION CODE)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8),
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = activationCode,
                        onValueChange = {
                            if (it.length <= 8) {
                                activationCode = it.filter { char -> char.isDigit() }
                                errorMessage = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Tusaale: 84920153", color = Color(0xFF64748B)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done
                        ),
                        leadingIcon = { Text("🔑", fontSize = 18.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF0EA5E9),
                            unfocusedBorderColor = Color(0xFF334155),
                            focusedLabelColor = Color(0xFF0EA5E9),
                            cursorColor = Color(0xFF0EA5E9),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp)
                    )

                    if (errorMessage != null) {
                        Spacer(modifier = Modifier.height(14.dp))
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFEF4444).copy(alpha = 0.15f)),
                            border = CardDefaults.outlinedCardBorder().copy(
                                brush = Brush.verticalGradient(listOf(Color(0xFFEF4444).copy(alpha = 0.6f), Color(0xFFEF4444).copy(alpha = 0.2f)))
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

                    if (successMessage != null) {
                        Spacer(modifier = Modifier.height(14.dp))
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF10B981).copy(alpha = 0.15f)),
                            border = CardDefaults.outlinedCardBorder().copy(
                                brush = Brush.verticalGradient(listOf(Color(0xFF10B981).copy(alpha = 0.6f), Color(0xFF10B981).copy(alpha = 0.2f)))
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = successMessage!!,
                                color = Color(0xFF6EE7B7),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            if (activationCode.length != 8) {
                                errorMessage = "Fadlan geli 8-da lambar oo buuxa"
                                return@Button
                            }
                            isLoading = true
                            errorMessage = null
                            successMessage = null

                            scope.launch {
                                val result = ApiClient.activateLicense(prefs.baseUrl, deviceId, activationCode)
                                isLoading = false
                                result.fold(
                                    onSuccess = { res ->
                                        val expStr = res.optString("subscription_expires_at", "")
                                        val expTimestamp = res.optLong("expires_timestamp", 0L)

                                        if (expTimestamp > 0L) {
                                            prefs.subscriptionExpiresAt = expTimestamp
                                        } else if (expStr.isNotBlank()) {
                                            try {
                                                val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                                                    timeZone = TimeZone.getTimeZone("UTC")
                                                }
                                                val parsed = sdf.parse(expStr)
                                                if (parsed != null) {
                                                    prefs.subscriptionExpiresAt = parsed.time
                                                }
                                            } catch (e: Exception) {
                                                prefs.subscriptionExpiresAt = System.currentTimeMillis() + (30L * 24 * 60 * 60 * 1000)
                                            }
                                        }

                                        prefs.lastRecordedTimestamp = System.currentTimeMillis()
                                        prefs.isClockTampered = false
                                        prefs.isDeviceRevoked = false
                                        successMessage = "Rukhsaddii si guul leh baa loo cusboonaysiiyay!"
                                        onActivationSuccess()
                                    },
                                    onFailure = { err ->
                                        errorMessage = err.message ?: "Failed to activate license"
                                    }
                                )
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0EA5E9),
                            disabledContainerColor = Color(0xFF0EA5E9).copy(alpha = 0.5f)
                        ),
                        enabled = !isLoading && activationCode.length == 8
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(22.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                "XAQIIJI & FUR (ACTIVATE)",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Check Status Button (in case admin restored or renewed remotely)
            OutlinedButton(
                onClick = {
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        val result = ApiClient.checkLicense(prefs.baseUrl, deviceId)
                        isLoading = false
                        result.fold(
                            onSuccess = { res ->
                                val expTimestamp = res.optLong("expires_timestamp", 0L)
                                val isRevoked = res.optBoolean("is_revoked", false)
                                prefs.isDeviceRevoked = isRevoked

                                if (!isRevoked && expTimestamp > System.currentTimeMillis()) {
                                    prefs.subscriptionExpiresAt = expTimestamp
                                    prefs.lastRecordedTimestamp = System.currentTimeMillis()
                                    prefs.isClockTampered = false
                                    onActivationSuccess()
                                } else if (isRevoked) {
                                    errorMessage = "Qalabkan waa la joojiyay (Revoked). La xiriir Admin-ka."
                                } else {
                                    errorMessage = "Rukhsaddu weli way dhacsan tahay. Fadlan geli 8-da lambar."
                                }
                            },
                            onFailure = { err ->
                                errorMessage = "Hubinta internet-ka way guul-darreysatay: ${err.message}"
                            }
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
            ) {
                Text("🔄 Hubi Xaaladda Qalabka (Refresh Status)")
            }

            Spacer(modifier = Modifier.height(12.dp))

            TextButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Ka bax Akoonka (Logout)", color = Color(0xFF94A3B8), fontSize = 13.sp)
            }
        }
    }
}

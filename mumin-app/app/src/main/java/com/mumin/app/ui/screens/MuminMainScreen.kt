package com.mumin.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mumin.app.local.LocalPrefs
import com.mumin.app.service.MuminForegroundService
import com.mumin.app.supabase.BundleRule
import com.mumin.app.supabase.SupabaseRepository
import com.mumin.app.ui.theme.*
import com.mumin.app.ussd.MuminAccessibilityService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun MuminMainScreen(onLogout: () -> Unit = {}) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val scope = rememberCoroutineScope()
    val username = prefs.username ?: "Operator"

    var accessibilityActive by remember { mutableStateOf(MuminAccessibilityService.isServiceActive) }
    var autoExecute by remember { mutableStateOf(prefs.autoExecute) }
    var ussdPin by remember { mutableStateOf(prefs.ussdPin ?: "") }

    // Manual test / single-execution fields
    var testSenderPhone by remember { mutableStateOf("") }
    var selectedBundle by remember { mutableStateOf<BundleRule?>(null) }
    var bundles by remember { mutableStateOf<List<BundleRule>>(emptyList()) }
    var loadingBundles by remember { mutableStateOf(false) }
    var executingTx by remember { mutableStateOf(false) }
    var executionMsg by remember { mutableStateOf<String?>(null) }

    // CRITICAL: In Mu'min App, recipient number is AUTOMATICALLY IDENTICAL to the payment sender!
    // No separate recipient input field exists.
    val lockedRecipientNumber = testSenderPhone.trim()

    // Poll accessibility state
    LaunchedEffect(Unit) {
        while (true) {
            accessibilityActive = MuminAccessibilityService.isServiceActive
            delay(3000)
        }
    }

    // Load bundles from Supabase
    LaunchedEffect(prefs.operatorId) {
        prefs.operatorId?.let { opId ->
            loadingBundles = true
            bundles = SupabaseRepository.getBundleRules(opId, prefs.profileId)
            loadingBundles = false
            if (bundles.isNotEmpty() && selectedBundle == null) {
                selectedBundle = bundles.first()
            }
        }
    }

    // Start background listener service
    LaunchedEffect(Unit) {
        val serviceIntent = Intent(context, MuminForegroundService::class.java).apply {
            action = MuminForegroundService.ACTION_START_SERVICE
        }
        context.startForegroundService(serviceIntent)
    }

    val bgGrad = Brush.verticalGradient(listOf(MuminDarkBg, Color(0xFF041A13)))

    Box(Modifier.fillMaxSize().background(bgGrad)) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(30.dp))

            // Mu'min Emerald Header
            Box(
                Modifier.size(76.dp).clip(CircleShape)
                    .background(Brush.radialGradient(listOf(MuminEmeraldPrimary, MuminEmeraldDark))),
                contentAlignment = Alignment.Center
            ) {
                Text("M", fontSize = 38.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
            Spacer(Modifier.height(10.dp))

            Text("Mu'min App", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Automated Same-Number Recipient Gateway", fontSize = 12.sp, color = MuminTextSecondary)
            Text("@$username", fontSize = 12.sp, color = MuminGold, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 2.dp))

            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.12f)),
                modifier = Modifier.height(32.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
            ) {
                Text("Bax (Logout)", fontSize = 12.sp, color = Color.White)
            }

            Spacer(Modifier.height(20.dp))

            // Accessibility Card
            AccessibilityStatusCard(accessibilityActive) {
                context.startActivity(
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                )
            }

            Spacer(Modifier.height(16.dp))

            // CORE FEATURE CARD: Sender == Recipient
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MuminCardBg,
                shape = RoundedCornerShape(16.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(listOf(MuminBorder, MuminBorder.copy(alpha = 0.4f)))
                )
            ) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("⚡ Diiwaangeli / Tijaabi Macmiil", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 15.sp)
                        Text("🔒 Auto-Locked", fontSize = 11.sp, color = MuminGold, fontWeight = FontWeight.Bold)
                    }

                    // Field 1: Payment sender phone number
                    OutlinedTextField(
                        value = testSenderPhone,
                        onValueChange = { testSenderPhone = it.replace(Regex("""\D"""), "").take(9) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Numberka Lacagta Soo Diray (Sender)", fontSize = 12.sp) },
                        placeholder = { Text("Tusaale: 634284015", fontSize = 12.sp) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        leadingIcon = { Text("💳", fontSize = 14.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MuminEmeraldPrimary,
                            unfocusedBorderColor = MuminBorder,
                            focusedLabelColor = MuminEmeraldPrimary,
                            unfocusedLabelColor = MuminTextSecondary.copy(alpha = 0.6f),
                            cursorColor = MuminEmeraldPrimary,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Field 2: AUTO-LOCKED RECIPIENT DISPLAY (NO INPUT FIELD!)
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFF04271D),
                        shape = RoundedCornerShape(12.dp),
                        border = CardDefaults.outlinedCardBorder().copy(
                            brush = Brush.verticalGradient(listOf(MuminEmeraldPrimary.copy(alpha = 0.6f), MuminEmeraldDark))
                        )
                    ) {
                        Row(
                            Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Numberka Lagu Shubayo Data-da (Recipient):", fontSize = 11.sp, color = MuminTextSecondary)
                                Text(
                                    if (lockedRecipientNumber.isNotBlank()) "🔒 +252 $lockedRecipientNumber" else "🔒 (La mid ah kan lacagta diray)",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (lockedRecipientNumber.isNotBlank()) Color.White else Color.White.copy(alpha = 0.4f),
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            Text("100% SAME", fontSize = 10.sp, color = MuminEmeraldLight, fontWeight = FontWeight.ExtraBold)
                        }
                    }

                    // Bundle selector
                    Text("Xidhmada Internetka (Select Bundle):", fontSize = 12.sp, color = MuminTextSecondary)
                    if (loadingBundles) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MuminEmeraldPrimary)
                    } else if (bundles.isEmpty()) {
                        Text("Wax xidhmooyin ah lama helin. Ku dar Admin Dashboard.", fontSize = 12.sp, color = Color(0xFFFCA5A5))
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            bundles.forEach { b ->
                                val isSelected = selectedBundle?.id == b.id
                                Surface(
                                    onClick = { selectedBundle = b },
                                    color = if (isSelected) MuminEmeraldDark else Color.White.copy(alpha = 0.05f),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        Modifier.padding(12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(b.bundleName, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 13.sp)
                                        Text("${b.amountSls.toInt()} SLS", color = MuminGold, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    }
                                }
                            }
                        }
                    }

                    // Execution button
                    Button(
                        onClick = {
                            if (lockedRecipientNumber.length !in 7..10) {
                                executionMsg = "Fadlan geli number sax ah (7-9 nambar)"
                                return@Button
                            }
                            if (selectedBundle == null) {
                                executionMsg = "Fadlan dooro xidhmo (bundle)"
                                return@Button
                            }

                            executingTx = true
                            executionMsg = null

                            val serviceIntent = Intent(context, MuminForegroundService::class.java).apply {
                                action = MuminForegroundService.ACTION_PROCESS_PAYMENT
                                putExtra("sender_number", lockedRecipientNumber)
                                putExtra("amount", selectedBundle!!.amountSls)
                                putExtra("tx_id", "MANUAL_${System.currentTimeMillis()}")
                                putExtra("sms_body", "Manual trigger for $lockedRecipientNumber")
                            }
                            context.startForegroundService(serviceIntent)

                            scope.launch {
                                delay(2000)
                                executingTx = false
                                executionMsg = "✅ USSD-ka waa la diray numberka $lockedRecipientNumber!"
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MuminEmeraldPrimary),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !executingTx
                    ) {
                        if (executingTx) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Text("🚀 DIRO DATA-DA (WAC USSD)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }

                    if (executionMsg != null) {
                        Text(executionMsg!!, fontSize = 12.sp, color = MuminTextSecondary)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Settings & PIN
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MuminCardBg,
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("⚙️ Habeynta USSD & PIN", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp)

                    OutlinedTextField(
                        value = ussdPin,
                        onValueChange = {
                            ussdPin = it
                            prefs.ussdPin = it.ifBlank { null }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("PIN-kaaga USSD (haddii loo baahdo)", fontSize = 12.sp) },
                        placeholder = { Text("Tusaale: 1234", fontSize = 12.sp) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MuminEmeraldPrimary,
                            unfocusedBorderColor = MuminBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Si toos ah u dir marka SMS soo dhaco (Auto):", fontSize = 12.sp, color = MuminTextSecondary)
                        Switch(
                            checked = autoExecute,
                            onCheckedChange = {
                                autoExecute = it
                                prefs.autoExecute = it
                            },
                            colors = SwitchDefaults.colors(checkedThumbColor = MuminEmeraldPrimary)
                        )
                    }
                }
            }

            Spacer(Modifier.height(30.dp))
        }
    }
}

@Composable
private fun AccessibilityStatusCard(isActive: Boolean, onEnable: () -> Unit) {
    val color = if (isActive) MuminEmeraldLight else Color(0xFFEF4444)
    Surface(
        modifier = Modifier.fillMaxWidth().border(1.dp, color, RoundedCornerShape(14.dp)),
        color = color.copy(alpha = 0.08f),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (isActive) "✅ Mu'min Accessibility waa Shidan" else "⚠️ Mu'min Accessibility waa Damantahay",
                    fontWeight = FontWeight.Bold,
                    color = color,
                    fontSize = 13.sp
                )
                Text(
                    if (isActive) "USSD dialog-yada si toos ah ayaa loo maamulayaa" else "Fur Settings si aad u shiddo Mu'min Accessibility",
                    fontSize = 11.sp,
                    color = Color.White.copy(alpha = 0.5f)
                )
            }
            if (!isActive) {
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = onEnable,
                    colors = ButtonDefaults.buttonColors(containerColor = MuminEmeraldPrimary),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("Shid", fontSize = 12.sp)
                }
            }
        }
    }
}

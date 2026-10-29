package com.geesh.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geesh.app.local.GeeshDatabase
import com.geesh.app.local.LocalPrefs
import com.geesh.app.local.ProcessedTransaction
import com.geesh.app.ussd.GeeshAccessibilityService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

// Sleek Brand Colors
val DarkBgStart   = Color(0xFF0A0F1D)
val DarkBgEnd     = Color(0xFF131127)
val CardSurface   = Color(0xFF161E31)
val CardBorder    = Color(0xFF25334E)
val PrimaryCyan   = Color(0xFF06B6D4)
val PrimaryBlue   = Color(0xFF3B82F6)
val AccentPurple  = Color(0xFF8B5CF6)
val SuccessGreen  = Color(0xFF10B981)
val WarningAmber  = Color(0xFFF59E0B)
val DangerRed     = Color(0xFFEF4444)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GeeshMainScreen(onLogout: () -> Unit = {}) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val scope = rememberCoroutineScope()
    val username = prefs.username ?: "Operator"

    // Active Mode: "CARD" or "BANK" (Mutual Exclusion)
    var selectedMode by remember { mutableStateOf(prefs.paymentMode) }

    // Card Mode State
    var ussdInput by remember { mutableStateOf(prefs.ussdTemplate ?: "") }
    var replyInput by remember { mutableStateOf(prefs.ussdReply ?: "") }
    var showReplyPin by remember { mutableStateOf(false) }

    // Bank Mode State
    var bankInitialPinInput by remember { mutableStateOf(prefs.bankInitialPin ?: "") }
    var bankPinInput by remember { mutableStateOf(prefs.bankPin ?: "") }
    var showInitialPin by remember { mutableStateOf(false) }
    var showBankPin by remember { mutableStateOf(false) }

    // Auto Check Balance & Sweep (*801#) State
    var autoCheckEnabled by remember { mutableStateOf(prefs.autoCheckBalanceEnabled) }
    var intervalMinutes by remember { mutableStateOf(prefs.checkBalanceIntervalMinutes) }
    var balancePinInput by remember { mutableStateOf(prefs.balanceCheckPin ?: "") }
    var showBalancePin by remember { mutableStateOf(false) }

    // App Lock Screen State
    var appLockEnabled by remember { mutableStateOf(prefs.appLockEnabled) }
    var appLockPinInput by remember { mutableStateOf(prefs.appLockPin ?: "") }
    var showAppLockPin by remember { mutableStateOf(false) }

    // Feedback message
    var saveMessage by remember { mutableStateOf<String?>(null) }

    // Accessibility Status
    var accessibilityActive by remember { mutableStateOf(GeeshAccessibilityService.isServiceActive) }

    // Recent Transactions
    var recentTx by remember { mutableStateOf<List<ProcessedTransaction>>(emptyList()) }

    // Periodically refresh accessibility & transactions
    LaunchedEffect(Unit) {
        while (true) {
            accessibilityActive = GeeshAccessibilityService.isServiceActive
            try {
                val db = GeeshDatabase.getInstance(context)
                recentTx = db.transactionDao().getRecent()
            } catch (_: Exception) {}
            delay(3000)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(DarkBgStart, DarkBgEnd)))
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(16.dp))

            // ── Top Header ─────────────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                Brush.linearGradient(listOf(PrimaryCyan, PrimaryBlue))
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("G", fontSize = 28.sp, fontWeight = FontWeight.Black, color = Color.White)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            "GEESH APP",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            letterSpacing = 1.sp
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (accessibilityActive) SuccessGreen else DangerRed)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "@$username",
                                fontSize = 12.sp,
                                color = PrimaryCyan,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                Button(
                    onClick = onLogout,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.08f)),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("Bax", fontSize = 12.sp, color = Color(0xFFCBD5E1), fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(20.dp))

            // ── Accessibility Status Alert ─────────────────────────────────────
            AccessibilityBanner(isActive = accessibilityActive) {
                context.startActivity(
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                )
            }

            Spacer(Modifier.height(22.dp))

            // ── Mode Selection Header ──────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "DOORO HABKA LACAG-DIRISTA",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8),
                    letterSpacing = 1.2.sp
                )
            }

            Spacer(Modifier.height(10.dp))

            // ── Mutual Exclusion Mode Cards (Turn on one, other turns off) ────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val isCardActive = selectedMode == "CARD"
                val isBankActive = selectedMode == "BANK"

                // ── Mode 1: CARD ──────────────────────────────────────────────
                ModeCard(
                    modifier = Modifier.weight(1f),
                    title = "Habka Card-ka",
                    subtitle = "USSD Caadi ah",
                    icon = "💳",
                    isActive = isCardActive,
                    activeColor = PrimaryBlue,
                    onSelect = {
                        selectedMode = "CARD"
                        prefs.paymentMode = "CARD"
                        saveMessage = "Habka Card-ka ayaa la shiday!"
                    }
                )

                // ── Mode 2: BANK ──────────────────────────────────────────────
                ModeCard(
                    modifier = Modifier.weight(1f),
                    title = "Habka Bank-ga",
                    subtitle = "*800# Account",
                    icon = "🏦",
                    isActive = isBankActive,
                    activeColor = AccentPurple,
                    onSelect = {
                        selectedMode = "BANK"
                        prefs.paymentMode = "BANK"
                        saveMessage = "Habka Bank-ga ayaa la shiday!"
                    }
                )
            }

            Spacer(Modifier.height(20.dp))

            // ── Dynamic Settings Form based on Active Mode ─────────────────────
            AnimatedContent(
                targetState = selectedMode,
                transitionSpec = {
                    fadeIn(animationSpec = tween(300)) togetherWith fadeOut(animationSpec = tween(200))
                },
                label = "mode_settings"
            ) { mode ->
                if (mode == "CARD") {
                    // ══════════════════════════════════════════════════════════
                    // CARD MODE CONFIGURATION
                    // ══════════════════════════════════════════════════════════
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = CardSurface,
                        shape = RoundedCornerShape(20.dp),
                        border = CardDefaults.outlinedCardBorder().copy(
                            brush = Brush.verticalGradient(
                                listOf(PrimaryBlue.copy(alpha = 0.5f), CardBorder)
                            )
                        )
                    ) {
                        Column(
                            Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("💳", fontSize = 18.sp)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Habaynta Card-ka (Direct USSD)",
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontSize = 15.sp
                                )
                            }

                            // USSD Template input
                            OutlinedTextField(
                                value = ussdInput,
                                onValueChange = { ussdInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("USSD Template Code", fontSize = 12.sp) },
                                placeholder = {
                                    Text(
                                        "*806*0634123456*{lacag}*2050#",
                                        fontSize = 11.sp,
                                        fontFamily = FontFamily.Monospace
                                    )
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Ascii,
                                    imeAction = ImeAction.Next
                                ),
                                colors = inputFieldColors(PrimaryBlue),
                                shape = RoundedCornerShape(14.dp)
                            )

                            // Card Reply / PIN (Masked with ****)
                            OutlinedTextField(
                                value = replyInput,
                                onValueChange = { replyInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Reply PIN (haddii loo baahan yahay)", fontSize = 12.sp) },
                                placeholder = { Text("****", fontSize = 12.sp) },
                                singleLine = true,
                                visualTransformation = if (showReplyPin) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done
                                ),
                                trailingIcon = {
                                    IconButton(onClick = { showReplyPin = !showReplyPin }) {
                                        Text(if (showReplyPin) "👁️" else "🙈", fontSize = 14.sp)
                                    }
                                },
                                colors = inputFieldColors(PrimaryBlue),
                                shape = RoundedCornerShape(14.dp)
                            )

                            // Save button
                            Button(
                                onClick = {
                                    prefs.paymentMode = "CARD"
                                    prefs.ussdTemplate = ussdInput.trim().ifBlank { null }
                                    prefs.ussdReply = replyInput.trim().ifBlank { null }
                                    saveMessage = "✅ Xogta Card-ka si guul leh baa loo keydiyay!"
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Text("Keydi Habka Card-ka", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }

                            Text(
                                "💡 Isticmaal {lacag} halka lacagta sarifka lagu badalayo.",
                                fontSize = 11.sp,
                                color = Color.White.copy(alpha = 0.5f)
                            )
                        }
                    }
                } else {
                    // ══════════════════════════════════════════════════════════
                    // BANK MODE CONFIGURATION (*800#)
                    // ══════════════════════════════════════════════════════════
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = CardSurface,
                        shape = RoundedCornerShape(20.dp),
                        border = CardDefaults.outlinedCardBorder().copy(
                            brush = Brush.verticalGradient(
                                listOf(AccentPurple.copy(alpha = 0.5f), CardBorder)
                            )
                        )
                    ) {
                        Column(
                            Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("🏦", fontSize = 18.sp)
                                Spacer(Modifier.width(8.dp))
                                Column {
                                    Text(
                                        "Habaynta Bank Account-ka (*800#)",
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White,
                                        fontSize = 15.sp
                                    )
                                    Text(
                                        "Ku shubo lacagaha toos Bank Account-kaaga",
                                        fontSize = 11.sp,
                                        color = Color(0xFFA78BFA)
                                    )
                                }
                            }

                            // ── Visual Flow Template Roadmap ─────────────────────────
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = Color(0xFF0F172A).copy(alpha = 0.6f),
                                shape = RoundedCornerShape(12.dp),
                                border = CardDefaults.outlinedCardBorder().copy(
                                    brush = Brush.horizontalGradient(
                                        listOf(AccentPurple.copy(alpha = 0.3f), PrimaryCyan.copy(alpha = 0.2f))
                                    )
                                )
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(
                                        "Silsiladda Tallaabooyinka USSD-ga (*800#):",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFE2E8F0)
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        StepPill(num = "Dial", text = "*800#", isAuto = true)
                                        StepPill(num = "1", text = "PIN Hore", isAuto = false)
                                        StepPill(num = "2", text = "5", isAuto = true)
                                        StepPill(num = "3", text = "2", isAuto = true)
                                        StepPill(num = "4", text = "{lacag}", isAuto = true)
                                        StepPill(num = "5", text = "1", isAuto = true)
                                        StepPill(num = "6", text = "Bank PIN", isAuto = false)
                                        StepPill(num = "7", text = "1", isAuto = true)
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        "ℹ️ Tallaabooyinka 5, 2, {lacag}, 1, iyo Reply 7 (1 - Xaqiijin) waa Template toos ah oo nidaamku dirayo.",
                                        fontSize = 10.sp,
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }

                            // ── PIN 1: PIN-ka Hore (Reply 1) Masked **** ──────────────
                            OutlinedTextField(
                                value = bankInitialPinInput,
                                onValueChange = { bankInitialPinInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("PIN-ka Hore (Reply 1 - Zaad/Telesom PIN)", fontSize = 12.sp) },
                                placeholder = { Text("****", fontSize = 12.sp) },
                                singleLine = true,
                                visualTransformation = if (showInitialPin) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Next
                                ),
                                leadingIcon = { Text("🔑", fontSize = 14.sp) },
                                trailingIcon = {
                                    IconButton(onClick = { showInitialPin = !showInitialPin }) {
                                        Text(if (showInitialPin) "👁️" else "🙈", fontSize = 14.sp)
                                    }
                                },
                                colors = inputFieldColors(AccentPurple),
                                shape = RoundedCornerShape(14.dp)
                            )

                            // ── PIN 2: Bank PIN (Reply 6 - 4, 6 ama kabadan) Masked **** ────────────────
                            OutlinedTextField(
                                value = bankPinInput,
                                onValueChange = { bankPinInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Bank Secret PIN (Reply 6 - 4, 6 ama kabadan)", fontSize = 12.sp) },
                                placeholder = { Text("PIN (4, 6 ama ka badan)", fontSize = 12.sp) },
                                singleLine = true,
                                visualTransformation = if (showBankPin) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done
                                ),
                                leadingIcon = { Text("🏦", fontSize = 14.sp) },
                                trailingIcon = {
                                    IconButton(onClick = { showBankPin = !showBankPin }) {
                                        Text(if (showBankPin) "👁️" else "🙈", fontSize = 14.sp)
                                    }
                                },
                                colors = inputFieldColors(AccentPurple),
                                shape = RoundedCornerShape(14.dp)
                            )

                            Text(
                                "💡 Bank PIN-ku wuxuu noqon karaa 4 god, 6 god ama ka badan. Reply 7 (oo ah 1) nidaamka ayaa si toos ah u diraya.",
                                fontSize = 11.sp,
                                color = Color.White.copy(alpha = 0.5f)
                            )

                            // Save Button
                            Button(
                                onClick = {
                                    prefs.paymentMode = "BANK"
                                    prefs.bankInitialPin = bankInitialPinInput.trim().ifBlank { null }
                                    prefs.bankPin = bankPinInput.trim().ifBlank { null }
                                    saveMessage = "✅ Xogta Bank-ga si guul leh baa loo keydiyay!"
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentPurple),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Text("Keydi Habka Bank-ga", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }

            // ── Save Message Feedback ──────────────────────────────────────────
            AnimatedVisibility(visible = saveMessage != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF10B981).copy(alpha = 0.15f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = saveMessage ?: "",
                        color = Color(0xFF6EE7B7),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            Spacer(Modifier.height(18.dp))

            // ══════════════════════════════════════════════════════════════════════
            // AUTO CHECK BALANCE & SWEEP (*801# FALLBACK)
            // ══════════════════════════════════════════════════════════════════════
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = CardSurface,
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        listOf(WarningAmber.copy(alpha = if (autoCheckEnabled) 0.5f else 0.2f), CardBorder)
                    )
                )
            ) {
                Column(
                    Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                            Text("🔍", fontSize = 20.sp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    "Eegidda Hadhaaga (*801#)",
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontSize = 15.sp
                                )
                                Text(
                                    "Haddii SMS 898 waayo, hadhaaga eeg oo dir",
                                    fontSize = 11.sp,
                                    color = Color.White.copy(alpha = 0.5f)
                                )
                            }
                        }

                        Switch(
                            checked = autoCheckEnabled,
                            onCheckedChange = {
                                autoCheckEnabled = it
                                prefs.autoCheckBalanceEnabled = it
                                saveMessage = if (it) "Eegidda Hadhaaga Tooska ah waa la shiday!" else "Eegidda Hadhaaga waa la damiyay!"
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = WarningAmber,
                                uncheckedThumbColor = Color(0xFF64748B),
                                uncheckedTrackColor = Color(0xFF1E293B)
                            )
                        )
                    }

                    AnimatedVisibility(visible = autoCheckEnabled) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            HorizontalDivider(color = CardBorder, thickness = 1.dp)

                            // Interval Selection
                            Text(
                                "DOORO WAQTIGA HADDII SMS LA WAAYO:",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF94A3B8),
                                letterSpacing = 1.sp
                            )

                            val intervals = listOf(5, 10, 15, 30, 45, 60)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                intervals.forEach { mins ->
                                    val isSelected = intervalMinutes == mins
                                    Surface(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable {
                                                intervalMinutes = mins
                                                prefs.checkBalanceIntervalMinutes = mins
                                            },
                                        color = if (isSelected) WarningAmber else Color.White.copy(alpha = 0.06f),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            text = if (mins == 60) "1h" else "${mins}m",
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            color = if (isSelected) Color.Black else Color.White,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                        )
                                    }
                                }
                            }

                            // PIN-ka *801# Input (Masked ****)
                            OutlinedTextField(
                                value = balancePinInput,
                                onValueChange = { balancePinInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("PIN-ka Eegidda Hadhaaga (*801#)", fontSize = 12.sp) },
                                placeholder = { Text("****", fontSize = 12.sp) },
                                singleLine = true,
                                visualTransformation = if (showBalancePin) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done
                                ),
                                leadingIcon = { Text("🔐", fontSize = 14.sp) },
                                trailingIcon = {
                                    IconButton(onClick = { showBalancePin = !showBalancePin }) {
                                        Text(if (showBalancePin) "👁️" else "🙈", fontSize = 14.sp)
                                    }
                                },
                                colors = inputFieldColors(WarningAmber),
                                shape = RoundedCornerShape(14.dp)
                            )

                            // Rules & Guidelines Info Box
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = Color(0xFF0F172A).copy(alpha = 0.6f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        "📌 USSD Code: *801# (Template toos ah)",
                                        fontSize = 11.sp,
                                        color = Color(0xFFE2E8F0),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        "💰 Lacagta ugu yar ee la dirayo: $0.12 (Haddii hadhaagu ka yar yahay $0.12 lama dirayo).",
                                        fontSize = 10.sp,
                                        color = Color(0xFFFDE68A)
                                    )
                                    Text(
                                        "🚀 Haddii lacag la helo, waxaa lagu dirayaa habka firfircoon (${if (selectedMode == "BANK") "Bank *800#" else "Card Direct"}).",
                                        fontSize = 10.sp,
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }

                            // Save Button for Auto Check Balance
                            Button(
                                onClick = {
                                    prefs.autoCheckBalanceEnabled = autoCheckEnabled
                                    prefs.checkBalanceIntervalMinutes = intervalMinutes
                                    prefs.balanceCheckPin = balancePinInput.trim().ifBlank { null }
                                    saveMessage = "✅ Xogta Eegidda Hadhaaga si guul leh baa loo keydiyay!"
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = WarningAmber),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Text("Keydi Eegidda Hadhaaga", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // ══════════════════════════════════════════════════════════════════════
            // APP LOCK SCREEN SECURITY (Protects Phone & App without blocking USSD)
            // ══════════════════════════════════════════════════════════════════════
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = CardSurface,
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = Brush.verticalGradient(
                        listOf(SuccessGreen.copy(alpha = if (appLockEnabled) 0.5f else 0.2f), CardBorder)
                    )
                )
            ) {
                Column(
                    Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                            Text("🛡️", fontSize = 20.sp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    "Amniga Qufulka App-ka",
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontSize = 15.sp
                                )
                                Text(
                                    "Quful shaashad ah oo ilaalinaya taleefanka",
                                    fontSize = 11.sp,
                                    color = Color.White.copy(alpha = 0.5f)
                                )
                            }
                        }

                        Switch(
                            checked = appLockEnabled,
                            onCheckedChange = {
                                appLockEnabled = it
                                prefs.appLockEnabled = it
                                saveMessage = if (it) "Qufulka App-ka waa la shiday!" else "Qufulka App-ka waa la damiyay!"
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = SuccessGreen,
                                uncheckedThumbColor = Color(0xFF64748B),
                                uncheckedTrackColor = Color(0xFF1E293B)
                            )
                        )
                    }

                    AnimatedVisibility(visible = appLockEnabled) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            HorizontalDivider(color = CardBorder, thickness = 1.dp)

                            // PIN Input Field (Masked ****)
                            OutlinedTextField(
                                value = appLockPinInput,
                                onValueChange = { appLockPinInput = it; saveMessage = null },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("PIN-ka Qufulka App-ka (4 ama 6 god)", fontSize = 12.sp) },
                                placeholder = { Text("****", fontSize = 12.sp) },
                                singleLine = true,
                                visualTransformation = if (showAppLockPin) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done
                                ),
                                leadingIcon = { Text("🔒", fontSize = 14.sp) },
                                trailingIcon = {
                                    IconButton(onClick = { showAppLockPin = !showAppLockPin }) {
                                        Text(if (showAppLockPin) "👁️" else "🙈", fontSize = 14.sp)
                                    }
                                },
                                colors = inputFieldColors(SuccessGreen),
                                shape = RoundedCornerShape(14.dp)
                            )

                            // Explanation Box
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = Color(0xFF0F172A).copy(alpha = 0.6f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        "💡 Sida uu u shaqaynayo:",
                                        fontSize = 11.sp,
                                        color = Color(0xFFE2E8F0),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        "Telefoonkaaga Android-ka waxaad ka dhigi kartaa 'None' ama 'Swipe' si USSD-gu u shaqeeyo, laakiin marka shaashadda la shido qofna ma geli karo mana arki karo app-ka ilaa uu galsho PIN-kan.",
                                        fontSize = 10.sp,
                                        color = Color(0xFFCBD5E1),
                                        lineHeight = 14.sp
                                    )
                                    Text(
                                        "USSD-gu iyo dirista lacaguhu waxay ku soconayaan si toos ah iyadoo qofna uusan waxba ka kharribi karin.",
                                        fontSize = 10.sp,
                                        color = Color(0xFF6EE7B7),
                                        lineHeight = 14.sp
                                    )
                                }
                            }

                            // Save Button
                            Button(
                                onClick = {
                                    if (appLockPinInput.trim().length < 4) {
                                        saveMessage = "⚠️ PIN-ku waa inuu ugu yaraan 4 god ka koobnaadaa!"
                                    } else {
                                        prefs.appLockEnabled = appLockEnabled
                                        prefs.appLockPin = appLockPinInput.trim()
                                        saveMessage = "✅ Qufulka App-ka si guul leh baa loo keydiyay!"
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Text("Keydi Qufulka App-ka", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // ── Live Transactions & Queue History ──────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "SAFKA & TAARIIXDA DIRISTA",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8),
                    letterSpacing = 1.2.sp
                )
                Text(
                    "FIFO (Sequential)",
                    fontSize = 11.sp,
                    color = PrimaryCyan,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(Modifier.height(10.dp))

            if (recentTx.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = CardSurface.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("⏳", fontSize = 28.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Weli wax lacag ah ma ayna soo dhicin",
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 13.sp
                        )
                        Text(
                            "Fariimaha 898 marka ay yimaadaan si toos ah ayaa loo dirayaa mid mid",
                            color = Color.White.copy(alpha = 0.35f),
                            fontSize = 11.sp
                        )
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    recentTx.forEach { tx ->
                        TxItemCard(tx)
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
        }
    }
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

@Composable
private fun ModeCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    icon: String,
    isActive: Boolean,
    activeColor: Color,
    onSelect: () -> Unit
) {
    val borderColor = if (isActive) activeColor else CardBorder
    val bgColor = if (isActive) activeColor.copy(alpha = 0.12f) else CardSurface.copy(alpha = 0.5f)

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onSelect)
            .border(
                width = if (isActive) 1.8.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(16.dp)
            ),
        color = bgColor,
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(icon, fontSize = 22.sp)
                // Active Switch Indicator
                Switch(
                    checked = isActive,
                    onCheckedChange = { if (it) onSelect() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = activeColor,
                        uncheckedThumbColor = Color(0xFF64748B),
                        uncheckedTrackColor = Color(0xFF1E293B)
                    ),
                    modifier = Modifier.size(width = 38.dp, height = 24.dp)
                )
            }

            Spacer(Modifier.height(10.dp))

            Text(
                title,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                fontSize = 13.sp
            )
            Text(
                subtitle,
                fontSize = 11.sp,
                color = Color.White.copy(alpha = 0.5f)
            )

            Spacer(Modifier.height(6.dp))

            // Status Pill
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isActive) activeColor.copy(alpha = 0.25f) else Color.White.copy(alpha = 0.05f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    if (isActive) "SHIDAN" else "DAMISAN",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (isActive) activeColor else Color.White.copy(alpha = 0.4f)
                )
            }
        }
    }
}

@Composable
private fun StepPill(num: String, text: String, isAuto: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(if (isAuto) PrimaryCyan.copy(alpha = 0.2f) else AccentPurple.copy(alpha = 0.35f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                num,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = if (isAuto) PrimaryCyan else Color(0xFFDDD6FE)
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            text,
            fontSize = 9.sp,
            color = Color(0xFFCBD5E1),
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun AccessibilityBanner(isActive: Boolean, onEnable: () -> Unit) {
    val color = if (isActive) SuccessGreen else DangerRed
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(14.dp)),
        color = color.copy(alpha = 0.08f),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Text(if (isActive) "🛡️" else "⚠️", fontSize = 20.sp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        if (isActive) "Accessibility Waa Shidantahay" else "Accessibility Waa Damantahay!",
                        fontWeight = FontWeight.Bold,
                        color = color,
                        fontSize = 13.sp
                    )
                    Text(
                        if (isActive) "App-ku si toos ah ayuu PIN-ka iyo USSD-ga u maamulayaa" else "Fur Settings oo shid Geesh si USSD-gu u shaqeeyo",
                        fontSize = 11.sp,
                        color = Color.White.copy(alpha = 0.5f)
                    )
                }
            }

            if (!isActive) {
                Button(
                    onClick = onEnable,
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("Shid Hadda", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun TxItemCard(tx: ProcessedTransaction) {
    val (color, icon, label) = when (tx.ussdResult) {
        "success" -> Triple(SuccessGreen, "✅", "Guul")
        "failed", "failed_accessibility", "failed_missing_pins" -> Triple(DangerRed, "❌", "Khalad")
        "timeout" -> Triple(WarningAmber, "⏱️", "Waqti dhaaf")
        else -> Triple(PrimaryCyan, "⏳", "Safka ku jira")
    }
    val sdf = SimpleDateFormat("dd MMM, HH:mm:ss", Locale.getDefault())

    Surface(
        color = CardSurface,
        shape = RoundedCornerShape(12.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(CardBorder, Color.Transparent))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(icon, fontSize = 20.sp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "\$${tx.amountDollar}",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        fontSize = 15.sp
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Tix: ${tx.tixraac.take(12)}",
                        fontSize = 11.sp,
                        color = Color.White.copy(alpha = 0.45f),
                        fontFamily = FontFamily.Monospace
                    )
                }
                Text(
                    sdf.format(Date(tx.processedAt)),
                    fontSize = 10.sp,
                    color = Color.White.copy(alpha = 0.35f)
                )
            }
            Surface(
                color = color.copy(alpha = 0.15f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = label,
                    fontSize = 11.sp,
                    color = color,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun inputFieldColors(accent: Color) = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = accent,
    unfocusedBorderColor = CardBorder,
    focusedLabelColor = accent,
    unfocusedLabelColor = Color(0xFF94A3B8),
    cursorColor = accent,
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White
)

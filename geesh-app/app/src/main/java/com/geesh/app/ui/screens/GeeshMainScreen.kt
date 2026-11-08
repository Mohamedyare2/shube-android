package com.geesh.app.ui.screens



import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import com.geesh.app.network.ApiClient
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

import com.geesh.app.service.GeeshForegroundService

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

    val deviceId = remember {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "UNKNOWN_DEVICE"
    }

    var remainingTimeText by remember { mutableStateOf(prefs.formatRemainingTime()) }
    var remainingMillis by remember { mutableStateOf(prefs.getRemainingTimeMillis()) }
    var expiryDateStr by remember { mutableStateOf(prefs.formatExpiryDate()) }
    var showRenewModal by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        while (true) {
            remainingTimeText = prefs.formatRemainingTime()
            remainingMillis = prefs.getRemainingTimeMillis()
            expiryDateStr = prefs.formatExpiryDate()
            delay(1000)
        }
    }



    // Active Mode: "CARD" or "BANK" (Mutual Exclusion)

    var selectedMode by remember { mutableStateOf(prefs.paymentMode) }



    // Card Mode State

    var ussdInput by remember { mutableStateOf(prefs.ussdTemplate ?: "") }

    var showTemplatePin by remember { mutableStateOf(false) }

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



    // Feedback message

    var saveMessage by remember { mutableStateOf<String?>(null) }



    // Accessibility Status

    var accessibilityActive by remember { mutableStateOf(GeeshAccessibilityService.isServiceActive) }



    // Financial Analytics & History State

    var selectedStatsPeriod by remember { mutableStateOf(StatsFilterPeriod.TODAY) }

    var allTx by remember { mutableStateOf<List<ProcessedTransaction>>(emptyList()) }

    var stats by remember { mutableStateOf(AppStats()) }

    var recentTx by remember { mutableStateOf<List<ProcessedTransaction>>(emptyList()) }



    // Periodically refresh accessibility & transactions

    LaunchedEffect(Unit) {

        while (true) {

            accessibilityActive = GeeshAccessibilityService.isServiceActive

            try {

                val db = GeeshDatabase.getInstance(context)

                val fullList = db.transactionDao().getAll()

                allTx = fullList

                stats = calculateStats(fullList)

                recentTx = fullList.take(50)

            } catch (e: Exception) {

                android.util.Log.e("GeeshMain", "Error loading stats", e)

            }

            delay(2000)

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



            // ── Subscription Status Alert & Live Countdown ──────────────────────
            SubscriptionStatusBanner(
                remainingText = remainingTimeText,
                remainingMillis = remainingMillis,
                expiryDateStr = expiryDateStr,
                deviceId = deviceId,
                onRenewClick = { showRenewModal = true },
                onCopyDeviceId = {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("Device ID", deviceId))
                    Toast.makeText(context, "Device ID: $deviceId waa la koobiyeeyay!", Toast.LENGTH_SHORT).show()
                }
            )

            Spacer(Modifier.height(18.dp))

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



                            // USSD Template input (Masks PIN e.g. *2050# with ••••)

                            OutlinedTextField(

                                value = ussdInput,

                                onValueChange = { ussdInput = it; saveMessage = null },

                                modifier = Modifier.fillMaxWidth(),

                                label = { Text("USSD Template Code", fontSize = 12.sp) },

                                placeholder = {

                                    Text(

                                        "*806*0634123456*{lacag}*••••#",

                                        fontSize = 11.sp,

                                        fontFamily = FontFamily.Monospace

                                    )

                                },

                                singleLine = true,

                                visualTransformation = UssdTemplatePinMaskTransformation(!showTemplatePin),

                                trailingIcon = {

                                    IconButton(onClick = { showTemplatePin = !showTemplatePin }) {

                                        Text(if (showTemplatePin) "👁️" else "🙈", fontSize = 14.sp)

                                    }

                                },

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
                                if (it) {
                                    val now = System.currentTimeMillis()
                                    prefs.lastSmsReceivedTimestamp = now
                                    prefs.lastBalanceCheckTimestamp = now
                                }

                                GeeshForegroundService.scheduleAlarm(context)

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
                                    if (autoCheckEnabled) {
                                        val now = System.currentTimeMillis()
                                        prefs.lastSmsReceivedTimestamp = now
                                        prefs.lastBalanceCheckTimestamp = now
                                    }

                                    prefs.checkBalanceIntervalMinutes = intervalMinutes

                                    prefs.balanceCheckPin = balancePinInput.trim().ifBlank { null }

                                    GeeshForegroundService.scheduleAlarm(context)

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



            // ── Analytics & Statistics Section (Maanta, Shalay, Usbuucan, Bishan, All) ──

            Surface(

                modifier = Modifier.fillMaxWidth(),

                color = CardSurface,

                shape = RoundedCornerShape(20.dp),

                border = CardDefaults.outlinedCardBorder().copy(

                    brush = Brush.verticalGradient(

                        listOf(PrimaryCyan.copy(alpha = 0.45f), CardBorder)

                    )

                )

            ) {

                Column(

                    Modifier.padding(18.dp),

                    verticalArrangement = Arrangement.spacedBy(14.dp)

                ) {

                    // Title

                    Row(

                        modifier = Modifier.fillMaxWidth(),

                        horizontalArrangement = Arrangement.SpaceBetween,

                        verticalAlignment = Alignment.CenterVertically

                    ) {

                        Row(verticalAlignment = Alignment.CenterVertically) {

                            Text("📊", fontSize = 18.sp)

                            Spacer(Modifier.width(8.dp))

                            Column {

                                Text(

                                    "Lacagaha La Diray",

                                    fontWeight = FontWeight.Bold,

                                    color = Color.White,

                                    fontSize = 15.sp

                                )

                                Text(

                                    "Warbixinta guud ee lacagaha baxay",

                                    fontSize = 11.sp,

                                    color = Color(0xFF94A3B8)

                                )

                            }

                        }

                    }



                    // 5 Period Selector Chips (Maanta, Shalay, Usbuucan, Bishan, All)

                    Row(

                        modifier = Modifier.fillMaxWidth(),

                        horizontalArrangement = Arrangement.spacedBy(5.dp)

                    ) {

                        StatsFilterPeriod.values().forEach { period ->

                            val isSelected = selectedStatsPeriod == period

                            Surface(

                                modifier = Modifier

                                    .weight(1f)

                                    .clip(RoundedCornerShape(10.dp))

                                    .clickable { selectedStatsPeriod = period },

                                color = if (isSelected) PrimaryCyan else CardSurface.copy(alpha = 0.8f),

                                shape = RoundedCornerShape(10.dp),

                                border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, CardBorder)

                            ) {

                                Column(

                                    modifier = Modifier.padding(vertical = 8.dp, horizontal = 2.dp),

                                    horizontalAlignment = Alignment.CenterHorizontally

                                ) {

                                    Text(

                                        period.label,

                                        fontSize = 10.5.sp,

                                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,

                                        color = if (isSelected) Color(0xFF0F172A) else Color(0xFFCBD5E1),

                                        maxLines = 1

                                    )

                                }

                            }

                        }

                    }



                    // Featured Banner for Selected Period

                    val currentSummary = when (selectedStatsPeriod) {

                        StatsFilterPeriod.TODAY -> stats.today

                        StatsFilterPeriod.YESTERDAY -> stats.yesterday

                        StatsFilterPeriod.THIS_WEEK -> stats.thisWeek

                        StatsFilterPeriod.THIS_MONTH -> stats.thisMonth

                        StatsFilterPeriod.ALL -> stats.all

                    }



                    Box(

                        modifier = Modifier

                            .fillMaxWidth()

                            .clip(RoundedCornerShape(16.dp))

                            .background(

                                Brush.horizontalGradient(

                                    listOf(

                                        Color(0xFF0F172A),

                                        Color(0xFF1E293B)

                                    )

                                )

                            )

                            .border(1.dp, PrimaryCyan.copy(alpha = 0.35f), RoundedCornerShape(16.dp))

                            .padding(16.dp)

                    ) {

                        Column {

                            Row(

                                modifier = Modifier.fillMaxWidth(),

                                horizontalArrangement = Arrangement.SpaceBetween,

                                verticalAlignment = Alignment.CenterVertically

                            ) {

                                Text(

                                    "${selectedStatsPeriod.icon} ${selectedStatsPeriod.label.uppercase()}",

                                    fontSize = 11.sp,

                                    fontWeight = FontWeight.Bold,

                                    color = PrimaryCyan,

                                    letterSpacing = 1.sp

                                )

                                Surface(

                                    color = SuccessGreen.copy(alpha = 0.15f),

                                    shape = RoundedCornerShape(20.dp)

                                ) {

                                    Text(

                                        "${currentSummary.count} xawaaladood",

                                        color = Color(0xFF6EE7B7),

                                        fontSize = 11.sp,

                                        fontWeight = FontWeight.SemiBold,

                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)

                                    )

                                }

                            }

                            Spacer(Modifier.height(8.dp))

                            Text(

                                String.format(Locale.US, "$%.2f", currentSummary.totalAmount),

                                fontSize = 32.sp,

                                fontWeight = FontWeight.ExtraBold,

                                color = Color.White

                            )

                            Text(

                                "Wadarta guud ee lacagta guulaystay ee la diray",

                                fontSize = 11.sp,

                                color = Color(0xFF94A3B8)

                            )

                        }

                    }



                    // 4 Mini Summary Cards for Quick Glance

                    Row(

                        modifier = Modifier.fillMaxWidth(),

                        horizontalArrangement = Arrangement.spacedBy(6.dp)

                    ) {

                        StatsMiniCard(

                            title = "Maanta",

                            amount = stats.today.totalAmount,

                            count = stats.today.count,

                            modifier = Modifier.weight(1f),

                            onClick = { selectedStatsPeriod = StatsFilterPeriod.TODAY }

                        )

                        StatsMiniCard(

                            title = "Shalay",

                            amount = stats.yesterday.totalAmount,

                            count = stats.yesterday.count,

                            modifier = Modifier.weight(1f),

                            onClick = { selectedStatsPeriod = StatsFilterPeriod.YESTERDAY }

                        )

                        StatsMiniCard(

                            title = "Bishan",

                            amount = stats.thisMonth.totalAmount,

                            count = stats.thisMonth.count,

                            modifier = Modifier.weight(1f),

                            onClick = { selectedStatsPeriod = StatsFilterPeriod.THIS_MONTH }

                        )

                        StatsMiniCard(

                            title = "All",

                            amount = stats.all.totalAmount,

                            count = stats.all.count,

                            modifier = Modifier.weight(1f),

                            onClick = { selectedStatsPeriod = StatsFilterPeriod.ALL }

                        )

                    }

                }

            }



            Spacer(Modifier.height(24.dp))



            // ── Live Transactions & Filtered Queue History ──────────────────────

            val filteredTx = remember(allTx, selectedStatsPeriod) {

                val cal = Calendar.getInstance()

                cal.set(Calendar.HOUR_OF_DAY, 0)

                cal.set(Calendar.MINUTE, 0)

                cal.set(Calendar.SECOND, 0)

                cal.set(Calendar.MILLISECOND, 0)

                val tStart = cal.timeInMillis



                cal.add(Calendar.DAY_OF_YEAR, -1)

                val yStart = cal.timeInMillis

                val yEnd = tStart



                cal.timeInMillis = tStart

                cal.firstDayOfWeek = Calendar.SATURDAY

                val dow = cal.get(Calendar.DAY_OF_WEEK)

                val dfSat = if (dow >= Calendar.SATURDAY) dow - Calendar.SATURDAY else dow + (7 - Calendar.SATURDAY)

                cal.add(Calendar.DAY_OF_YEAR, -dfSat)

                val wStart = cal.timeInMillis



                cal.timeInMillis = tStart

                cal.set(Calendar.DAY_OF_MONTH, 1)

                val mStart = cal.timeInMillis



                when (selectedStatsPeriod) {

                    StatsFilterPeriod.TODAY -> allTx.filter { it.processedAt >= tStart }

                    StatsFilterPeriod.YESTERDAY -> allTx.filter { it.processedAt in yStart until yEnd }

                    StatsFilterPeriod.THIS_WEEK -> allTx.filter { it.processedAt >= wStart }

                    StatsFilterPeriod.THIS_MONTH -> allTx.filter { it.processedAt >= mStart }

                    StatsFilterPeriod.ALL -> allTx

                }

            }



            Row(

                modifier = Modifier.fillMaxWidth(),

                verticalAlignment = Alignment.CenterVertically,

                horizontalArrangement = Arrangement.SpaceBetween

            ) {

                Text(

                    "SAFKA & TAARIIXDA (${selectedStatsPeriod.label.uppercase()})",

                    fontSize = 12.sp,

                    fontWeight = FontWeight.Bold,

                    color = Color(0xFF94A3B8),

                    letterSpacing = 1.2.sp

                )

                Text(

                    "${filteredTx.size} xawaaladood",

                    fontSize = 11.sp,

                    color = PrimaryCyan,

                    fontWeight = FontWeight.SemiBold

                )

            }



            Spacer(Modifier.height(10.dp))



            if (filteredTx.isEmpty()) {

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

                            "Wax lacag ah ma ayna soo dhicin muddadan (${selectedStatsPeriod.label})",

                            color = Color.White.copy(alpha = 0.6f),

                            fontSize = 13.sp

                        )

                        Text(

                            "Dooro 'All' si aad u aragto xawaaladihii hore oo dhan",

                            color = Color.White.copy(alpha = 0.35f),

                            fontSize = 11.sp

                        )

                    }

                }

            } else {

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {

                    filteredTx.take(50).forEach { tx ->

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





// ─── PIN Mask Transformation for USSD Template ─────────────────────────────

class UssdTemplatePinMaskTransformation(private val isMasked: Boolean) : VisualTransformation {

    override fun filter(text: androidx.compose.ui.text.AnnotatedString): androidx.compose.ui.text.input.TransformedText {

        if (!isMasked) {

            return androidx.compose.ui.text.input.TransformedText(text, androidx.compose.ui.text.input.OffsetMapping.Identity)

        }

        val raw = text.text

        if (raw.isEmpty()) {

            return androidx.compose.ui.text.input.TransformedText(text, androidx.compose.ui.text.input.OffsetMapping.Identity)

        }

        val lastStarIndex = raw.lastIndexOf('*')

        if (lastStarIndex != -1 && lastStarIndex < raw.length - 1) {

            val afterStar = raw.substring(lastStarIndex + 1)

            val hasHash = afterStar.endsWith("#")

            val pinCandidate = if (hasHash) afterStar.dropLast(1) else afterStar

            if (pinCandidate.isNotEmpty() && pinCandidate.all { it.isDigit() }) {

                val masked = "•".repeat(pinCandidate.length)

                val transformed = raw.substring(0, lastStarIndex + 1) + masked + (if (hasHash) "#" else "")

                return androidx.compose.ui.text.input.TransformedText(

                    androidx.compose.ui.text.AnnotatedString(transformed),

                    androidx.compose.ui.text.input.OffsetMapping.Identity

                )

            }

        }

        return androidx.compose.ui.text.input.TransformedText(text, androidx.compose.ui.text.input.OffsetMapping.Identity)

    }

}



// ─── Analytics / Stats Data Models ──────────────────────────────────────────

enum class StatsFilterPeriod(val label: String, val icon: String) {

    TODAY("Maanta", "📅"),

    YESTERDAY("Shalay", "⏪"),

    THIS_WEEK("Usbuucan", "📆"),

    THIS_MONTH("Bishan", "🗓️"),

    ALL("All", "🌐")

}



data class PeriodSummary(

    val totalAmount: Double = 0.0,

    val count: Int = 0

)



data class AppStats(

    val today: PeriodSummary = PeriodSummary(),

    val yesterday: PeriodSummary = PeriodSummary(),

    val thisWeek: PeriodSummary = PeriodSummary(),

    val thisMonth: PeriodSummary = PeriodSummary(),

    val all: PeriodSummary = PeriodSummary()

)



fun calculateStats(list: List<ProcessedTransaction>): AppStats {

    val cal = Calendar.getInstance()

    cal.set(Calendar.HOUR_OF_DAY, 0)

    cal.set(Calendar.MINUTE, 0)

    cal.set(Calendar.SECOND, 0)

    cal.set(Calendar.MILLISECOND, 0)

    val todayStart = cal.timeInMillis



    cal.add(Calendar.DAY_OF_YEAR, -1)

    val yesterdayStart = cal.timeInMillis

    val yesterdayEnd = todayStart



    cal.timeInMillis = todayStart

    cal.firstDayOfWeek = Calendar.SATURDAY

    val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK)

    val daysFromSat = if (dayOfWeek >= Calendar.SATURDAY) {

        dayOfWeek - Calendar.SATURDAY

    } else {

        dayOfWeek + (7 - Calendar.SATURDAY)

    }

    cal.add(Calendar.DAY_OF_YEAR, -daysFromSat)

    val weekStart = cal.timeInMillis



    cal.timeInMillis = todayStart

    cal.set(Calendar.DAY_OF_MONTH, 1)

    val monthStart = cal.timeInMillis



    var sumToday = 0.0; var cntToday = 0

    var sumYest = 0.0; var cntYest = 0

    var sumWeek = 0.0; var cntWeek = 0

    var sumMonth = 0.0; var cntMonth = 0

    var sumAll = 0.0; var cntAll = 0



    for (tx in list) {

        val res = tx.ussdResult.lowercase()

        val isSuccess = res == "success" ||
                        res.contains("guul") ||
                        res.contains("sent") ||
                        res.contains("la diray") ||
                        res.contains("dhigatay") ||
                        res.contains("dirtay") ||
                        res.contains("gudbiyay") ||
                        res.contains("wareejisay") ||
                        (!res.startsWith("failed") && !res.contains("timeout") && !res.contains("pending"))



        if (isSuccess) {

            val amt = tx.amountDollar

            val time = tx.processedAt



            sumAll += amt

            cntAll++



            if (time >= todayStart) {

                sumToday += amt

                cntToday++

            } else if (time in yesterdayStart until yesterdayEnd) {

                sumYest += amt

                cntYest++

            }



            if (time >= weekStart) {

                sumWeek += amt

                cntWeek++

            }



            if (time >= monthStart) {

                sumMonth += amt

                cntMonth++

            }

        }

    }



    return AppStats(

        today = PeriodSummary(sumToday, cntToday),

        yesterday = PeriodSummary(sumYest, cntYest),

        thisWeek = PeriodSummary(sumWeek, cntWeek),

        thisMonth = PeriodSummary(sumMonth, cntMonth),

        all = PeriodSummary(sumAll, cntAll)

    )

}



@Composable

private fun StatsMiniCard(

    title: String,

    amount: Double,

    count: Int,

    modifier: Modifier = Modifier,

    onClick: () -> Unit

) {

    Surface(

        modifier = modifier

            .clip(RoundedCornerShape(12.dp))

            .clickable(onClick = onClick),

        color = CardSurface.copy(alpha = 0.85f),

        shape = RoundedCornerShape(12.dp),

        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder)

    ) {

        Column(

            modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),

            horizontalAlignment = Alignment.CenterHorizontally

        ) {

            Text(title, fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)

            Spacer(Modifier.height(2.dp))

            Text(

                String.format(Locale.US, "$%.2f", amount),

                fontSize = 11.sp,

                color = Color.White,

                fontWeight = FontWeight.Bold,

                maxLines = 1

            )

            Text(

                "$count tx",

                fontSize = 8.5.sp,

                color = PrimaryCyan.copy(alpha = 0.8f)

            )

        }

    }

}



// ─── Subscription Status & Renewal Components ───────────────────────────────

@Composable
fun SubscriptionStatusBanner(
    remainingText: String,
    remainingMillis: Long,
    expiryDateStr: String,
    deviceId: String,
    onRenewClick: () -> Unit,
    onCopyDeviceId: () -> Unit
) {
    val isCritical = remainingMillis in 1L..(60 * 60 * 1000L) // Under 1 hour
    val isWarning = remainingMillis in (60 * 60 * 1000L)..(24 * 60 * 60 * 1000L) // Under 24 hours
    val isExpired = remainingMillis <= 0L

    val borderBrush = when {
        isCritical || isExpired -> Brush.linearGradient(listOf(Color(0xFFEF4444), Color(0xFFDC2626)))
        isWarning -> Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFD97706)))
        else -> Brush.linearGradient(listOf(Color(0xFF06B6D4), Color(0xFF3B82F6)))
    }

    val cardBg = when {
        isCritical || isExpired -> Color(0xFF2A0808)
        isWarning -> Color(0xFF2B1D06)
        else -> Color(0xFF0E1A2D)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = CardDefaults.outlinedCardBorder().copy(brush = borderBrush)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                when {
                                    isCritical || isExpired -> Color(0xFFEF4444).copy(alpha = 0.2f)
                                    isWarning -> Color(0xFFF59E0B).copy(alpha = 0.2f)
                                    else -> Color(0xFF06B6D4).copy(alpha = 0.2f)
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (isCritical || isExpired) "🚨" else if (isWarning) "⏳" else "🔑",
                            fontSize = 18.sp
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "RUKHSADDA GEESH",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            letterSpacing = 0.8.sp
                        )
                        Text(
                            text = "Dhacaysa: $expiryDateStr",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            when {
                                isExpired -> Color(0xFFEF4444)
                                isCritical -> Color(0xFFEF4444)
                                isWarning -> Color(0xFFF59E0B)
                                else -> Color(0xFF10B981)
                            }
                        )
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = when {
                            isExpired -> "DHACDAY"
                            isCritical -> "DEGDEG AH"
                            isWarning -> "GABAABSI"
                            else -> "SHAQAYNAYSA"
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        letterSpacing = 0.5.sp
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(alpha = 0.35f))
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Text(
                    text = "Waqtiga kuu hadhay:",
                    fontSize = 11.sp,
                    color = Color(0xFF94A3B8),
                    fontWeight = FontWeight.Medium
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = remainingText,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Black,
                    color = when {
                        isCritical || isExpired -> Color(0xFFF87171)
                        isWarning -> Color(0xFFFBBF24)
                        else -> Color(0xFF38BDF8)
                    },
                    letterSpacing = 0.5.sp
                )
            }

            if (isWarning || isCritical) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "⚠️ Digniin: Waqtigaagu wuu sii dhamaanayaa. Fadlan maamulka koodh cusub ka qaado si aanay shaqadu kuugu istaagin.",
                    fontSize = 11.sp,
                    color = if (isCritical) Color(0xFFFCA5A5) else Color(0xFFFDE68A),
                    lineHeight = 15.sp
                )
            }

            Spacer(Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onRenewClick,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = when {
                            isCritical || isExpired -> Color(0xFFEF4444)
                            isWarning -> Color(0xFFF59E0B)
                            else -> Color(0xFF0EA5E9)
                        }
                    ),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "🔑 Kordhi / Cusboonaysii",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                OutlinedButton(
                    onClick = onCopyDeviceId,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color(0xFF94A3B8)
                    ),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = Brush.linearGradient(listOf(Color(0xFF334155), Color(0xFF475569)))
                    ),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "📋 Copy Device ID",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFCBD5E1)
                    )
                }
            }
        }
    }
}

@Composable
fun RenewSubscriptionDialog(
    deviceId: String,
    onDismiss: () -> Unit,
    onRenewSuccess: (newExpiry: Long) -> Unit
) {
    val context = LocalContext.current
    val prefs = remember { LocalPrefs(context) }
    val scope = rememberCoroutineScope()

    var codeInput by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        containerColor = Color(0xFF0F172A),
        shape = RoundedCornerShape(20.dp),
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔑", fontSize = 22.sp)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Kordhi Rukhsadda",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    text = "Geli 8-da lambar ee uu Admin-ku kuu soo diray si aad waqti dheeraad ah ugu darsato inta ayna shaqadu kaa joogsan.",
                    fontSize = 12.sp,
                    color = Color(0xFF94A3B8),
                    lineHeight = 17.sp
                )

                Spacer(Modifier.height(12.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF1E293B))
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Device ID:", fontSize = 10.sp, color = Color(0xFF64748B))
                            Text(deviceId, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                        }
                        TextButton(
                            onClick = {
                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cm.setPrimaryClip(ClipData.newPlainText("Device ID", deviceId))
                                Toast.makeText(context, "Device ID waa la koobiyeeyay!", Toast.LENGTH_SHORT).show()
                            },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text("Copy", fontSize = 11.sp, color = Color(0xFF38BDF8))
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))

                OutlinedTextField(
                    value = codeInput,
                    onValueChange = { if (it.length <= 8 && it.all { c -> c.isDigit() }) codeInput = it },
                    label = { Text("8-da Lambar ee Rukhsadda", color = Color(0xFF94A3B8)) },
                    placeholder = { Text("12345678", color = Color(0xFF475569)) },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Done
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF0EA5E9),
                        unfocusedBorderColor = Color(0xFF334155),
                        focusedLabelColor = Color(0xFF0EA5E9),
                        cursorColor = Color(0xFF0EA5E9),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp)
                )

                if (errorMessage != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = errorMessage!!,
                        color = Color(0xFFEF4444),
                        fontSize = 12.sp
                    )
                }

                if (successMessage != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = successMessage!!,
                        color = Color(0xFF10B981),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(Modifier.height(8.dp))
                Text(
                    text = "🌐 Xusuusin: Telefoonku waa inuu Internet-ka ku xidhan yahay inta aad koodhka gelinayso.",
                    fontSize = 10.sp,
                    color = Color(0xFF64748B),
                    lineHeight = 14.sp
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (codeInput.length != 8) {
                        errorMessage = "Fadlan geli 8-da lambar oo buuxa"
                        return@Button
                    }
                    isLoading = true
                    errorMessage = null
                    successMessage = null

                    scope.launch {
                        val result = ApiClient.activateLicense(prefs.baseUrl, deviceId, codeInput)
                        isLoading = false
                        result.fold(
                            onSuccess = { res ->
                                val expStr = res.optString("subscription_expires_at", "")
                                val expTimestamp = res.optLong("expires_timestamp", 0L)

                                var newExp = 0L
                                if (expTimestamp > 0L) {
                                    newExp = expTimestamp
                                    prefs.subscriptionExpiresAt = expTimestamp
                                } else if (expStr.isNotBlank()) {
                                    try {
                                        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                                            timeZone = TimeZone.getTimeZone("UTC")
                                        }
                                        val parsed = sdf.parse(expStr)
                                        if (parsed != null) {
                                            newExp = parsed.time
                                            prefs.subscriptionExpiresAt = parsed.time
                                        }
                                    } catch (e: Exception) {
                                        newExp = System.currentTimeMillis() + (30L * 24 * 60 * 60 * 1000)
                                        prefs.subscriptionExpiresAt = newExp
                                    }
                                }

                                prefs.isClockTampered = false
                                prefs.isDeviceRevoked = false
                                prefs.lastRecordedTimestamp = System.currentTimeMillis()

                                successMessage = "✅ Rukhsadda si guul leh baa loo kordhiyay!"
                                Toast.makeText(context, "✅ Rukhsaddaadii waa la kordhiyay!", Toast.LENGTH_LONG).show()

                                delay(1200)
                                onRenewSuccess(newExp)
                                onDismiss()
                            },
                            onFailure = { err ->
                                errorMessage = err.message ?: "Koodhkaagu ma saxna ama internet-ka ayaa go'an."
                            }
                        )
                    }
                },
                enabled = !isLoading && codeInput.length == 8,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0EA5E9)),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(Modifier.width(6.dp))
                    Text("Hubinaya...", fontSize = 12.sp)
                } else {
                    Text("Kordhi Waqtiga", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            if (!isLoading) {
                TextButton(onClick = onDismiss) {
                    Text("Ka Noqo", color = Color(0xFF94A3B8), fontSize = 12.sp)
                }
            }
        }
    )
}

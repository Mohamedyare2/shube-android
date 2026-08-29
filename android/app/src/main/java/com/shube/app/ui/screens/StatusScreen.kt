package com.shube.app.ui.screens

import android.os.BatteryManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shube.app.local.DevicePreferences
import com.shube.app.network.ApiService
import com.shube.app.worker.HeartbeatWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ── Data ────────────────────────────────────────────────────────────────────

data class LiveStatus(
    val deviceName: String = "Worker Phone",
    val batteryLevel: Int = 0,
    val networkType: String = "Unknown",
    val isOnline: Boolean = false,
    val gatewayEnabled: Boolean = false
)

// ── Main Screen ──────────────────────────────────────────────────────────────

@Composable
fun StatusScreen(
    deviceId: String,
    onUnpair: () -> Unit = {}
) {
    val context = LocalContext.current
    val prefs   = remember { DevicePreferences.getInstance(context) }
    val api     = remember { ApiService.getInstance(context) }
    val scope   = rememberCoroutineScope()

    var status by remember {
        mutableStateOf(
            LiveStatus(
                deviceName    = prefs.deviceName,
                gatewayEnabled = true
            )
        )
    }
    var showUnpairDialog by remember { mutableStateOf(false) }

    // Read real hardware values and update display every 30 seconds
    fun refreshLocalStatus() {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val battery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val networkType = when {
            caps == null -> "Offline"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile"
            else -> "Unknown"
        }
        val isOnline = caps != null

        status = status.copy(
            batteryLevel = battery,
            networkType  = networkType,
            isOnline     = isOnline
        )
    }

    LaunchedEffect(deviceId) {
        refreshLocalStatus()
        // Also send an immediate heartbeat on screen open
        scope.launch { api.sendHeartbeat(deviceId) }
        // Refresh display every 30 seconds
        while (true) {
            delay(30_000)
            refreshLocalStatus()
            api.sendHeartbeat(deviceId)
        }
    }

    // Animations
    val infiniteTransition = rememberInfiniteTransition(label = "bg")
    val gradientShift by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(8000, easing = LinearEasing), RepeatMode.Reverse),
        label = "gradient"
    )
    val dotAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1200, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "dot"
    )

    Box(modifier = Modifier.fillMaxSize().background(ShubeDark)) {
        // Background glow
        Box(
            modifier = Modifier
                .size(420.dp)
                .offset(x = (-100).dp + (gradientShift * 50).dp, y = (-60).dp)
                .blur(150.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            (if (status.gatewayEnabled) ShubeGreen else ShubeBlue).copy(alpha = 0.18f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 52.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // ── Header ──────────────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("SHUBE", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color.White, letterSpacing = 2.sp)
                    Text("Operator Dashboard", fontSize = 12.sp, color = Color(0xFF94A3B8))
                }
                // Online / Offline badge
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background((if (status.isOnline) ShubeGreen else Color(0xFFEF4444)).copy(alpha = 0.15f))
                        .border(1.dp, (if (status.isOnline) ShubeGreen else Color(0xFFEF4444)).copy(alpha = 0.4f), RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier.size(7.dp).clip(CircleShape)
                            .background((if (status.isOnline) ShubeGreen else Color(0xFFEF4444)).copy(alpha = dotAlpha))
                    )
                    Text(
                        if (status.isOnline) "Online" else "Offline",
                        fontSize = 12.sp, fontWeight = FontWeight.Medium,
                        color = if (status.isOnline) ShubeGreen else Color(0xFFEF4444)
                    )
                }
            }

            // ── Hero Device Card ─────────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = ShubeCard,
                border = androidx.compose.foundation.BorderStroke(1.dp, ShubeBorder)
            ) {
                Box(
                    modifier = Modifier.fillMaxWidth().background(
                        brush = Brush.linearGradient(
                            colors = listOf(ShubeBlue.copy(alpha = 0.08f), ShubePurple.copy(alpha = 0.04f)),
                            start = Offset(0f, 0f), end = Offset(800f, 400f)
                        ),
                        shape = RoundedCornerShape(24.dp)
                    )
                ) {
                    Column(modifier = Modifier.padding(22.dp)) {
                        // Device name + Gateway toggle
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Column {
                                Text(status.deviceName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                Text("Reporting every 30s", fontSize = 11.sp, color = Color(0xFF94A3B8), modifier = Modifier.padding(top = 2.dp))
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Switch(
                                    checked = status.gatewayEnabled,
                                    onCheckedChange = {
                                        status = status.copy(gatewayEnabled = it)
                                        if (it) HeartbeatWorker.schedule(context)
                                        else HeartbeatWorker.cancel(context)
                                    },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = Color.White, checkedTrackColor = ShubeGreen,
                                        uncheckedThumbColor = Color(0xFF94A3B8), uncheckedTrackColor = ShubeBorder
                                    )
                                )
                                Text(
                                    if (status.gatewayEnabled) "Gateway ON" else "Gateway OFF",
                                    fontSize = 10.sp,
                                    color = if (status.gatewayEnabled) ShubeGreen else Color(0xFF94A3B8)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(22.dp))

                        // Battery & Network mini-cards
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StatMiniCard(
                                modifier = Modifier.weight(1f),
                                icon = Icons.Rounded.BatteryFull,
                                label = "Battery",
                                value = "${status.batteryLevel}%",
                                valueColor = when {
                                    status.batteryLevel < 20 -> Color(0xFFEF4444)
                                    status.batteryLevel < 50 -> Color(0xFFFBBF24)
                                    else -> ShubeGreen
                                },
                                accentColor = when {
                                    status.batteryLevel < 20 -> Color(0xFFEF4444)
                                    status.batteryLevel < 50 -> Color(0xFFFBBF24)
                                    else -> ShubeGreen
                                }
                            )
                            StatMiniCard(
                                modifier = Modifier.weight(1f),
                                icon = Icons.Rounded.SignalCellularAlt,
                                label = "Network",
                                value = status.networkType,
                                valueColor = ShubeBlue,
                                accentColor = ShubeBlue
                            )
                        }
                    }
                }
            }

            // ── Low Battery Warning ──────────────────────────────────────────
            AnimatedVisibility(visible = status.batteryLevel in 1..19) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF450A0A),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("🔋", fontSize = 22.sp)
                        Column {
                            Text("Low Battery Warning", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFFCA5A5))
                            Text("Charge this device soon to avoid interruptions.", fontSize = 12.sp, color = Color(0xFFEF4444).copy(alpha = 0.8f))
                        }
                    }
                }
            }

            // ── Status Info Card ─────────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = Color(0xFF0F2035),
                border = androidx.compose.foundation.BorderStroke(1.dp, ShubeBlue.copy(alpha = 0.3f))
            ) {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        modifier = Modifier.size(42.dp).clip(CircleShape).background(ShubeBlue.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.Info, contentDescription = null, tint = ShubeBlue, modifier = Modifier.size(20.dp))
                    }
                    Column {
                        Text(
                            if (status.gatewayEnabled) "Gateway is active" else "Gateway is paused",
                            fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Color.White
                        )
                        Text(
                            if (status.gatewayEnabled) "SMS payments are being auto-processed" else "Toggle the switch above to resume",
                            fontSize = 12.sp, color = Color(0xFF94A3B8), modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }

            // ── Unpair Button ────────────────────────────────────────────────
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = { showUnpairDialog = true },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF475569))
            ) {
                Icon(Icons.Rounded.LinkOff, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Unpair This Device", color = Color(0xFF94A3B8), fontSize = 14.sp)
            }
        }
    }

    // ── Unpair Confirmation Dialog ───────────────────────────────────────────
    if (showUnpairDialog) {
        AlertDialog(
            onDismissRequest = { showUnpairDialog = false },
            containerColor = ShubeCard,
            title = { Text("Unpair Device?", color = Color.White) },
            text = { Text("This will disconnect the device from your account. You will need a new pairing code to reconnect.", color = Color(0xFF94A3B8)) },
            confirmButton = {
                TextButton(onClick = {
                    prefs.clearPairing()
                    HeartbeatWorker.cancel(context)
                    showUnpairDialog = false
                    onUnpair()
                }) { Text("Unpair", color = Color(0xFFEF4444)) }
            },
            dismissButton = {
                TextButton(onClick = { showUnpairDialog = false }) { Text("Cancel", color = Color(0xFF94A3B8)) }
            }
        )
    }
}

// ── Reusable Components ──────────────────────────────────────────────────────

@Composable
fun StatMiniCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    value: String,
    valueColor: Color,
    accentColor: Color
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFF0F172A),
        border = androidx.compose.foundation.BorderStroke(1.dp, accentColor.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, contentDescription = null, tint = accentColor, modifier = Modifier.size(20.dp))
            Text(label, fontSize = 11.sp, color = Color(0xFF94A3B8))
            Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = valueColor)
        }
    }
}

package com.geesh.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geesh.app.local.GeeshDatabase
import com.geesh.app.local.ProcessedTransaction
import com.geesh.app.service.GeeshForegroundService
import com.geesh.app.ussd.GeeshAccessibilityService
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun GeeshMainScreen() {
    val context = LocalContext.current

    var accessibilityActive by remember { mutableStateOf(GeeshAccessibilityService.isServiceActive) }
    var recentTxns by remember { mutableStateOf<List<ProcessedTransaction>>(emptyList()) }

    // Refresh every 3 seconds
    LaunchedEffect(Unit) {
        while (true) {
            accessibilityActive = GeeshAccessibilityService.isServiceActive
            val db = GeeshDatabase.getInstance(context)
            recentTxns = db.transactionDao().getRecent()
            delay(3000)
        }
    }

    val purple = Color(0xFF7C3AED)
    val green  = Color(0xFF10B981)
    val bgGrad = Brush.verticalGradient(listOf(Color(0xFF0F0A1E), Color(0xFF1A1035)))

    Box(Modifier.fillMaxSize().background(bgGrad)) {
        Column(
            Modifier.fillMaxSize().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(36.dp))

            // Logo
            Box(
                Modifier.size(80.dp).clip(CircleShape)
                    .background(Brush.radialGradient(listOf(purple, Color(0xFF4C1D95)))),
                contentAlignment = Alignment.Center
            ) {
                Text("G", fontSize = 40.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
            Spacer(Modifier.height(10.dp))
            Text("Geesh App", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Lacag Sarifka Automatic • Offline", fontSize = 13.sp, color = Color.White.copy(alpha = 0.45f))

            Spacer(Modifier.height(24.dp))

            // Accessibility status card
            AccessibilityCard(accessibilityActive) {
                context.startActivity(
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                )
            }

            Spacer(Modifier.height(14.dp))

            // Start / Stop buttons
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.buttonColors(containerColor = green),
                    onClick  = {
                        context.startForegroundService(Intent(context, GeeshForegroundService::class.java).apply {
                            action = GeeshForegroundService.ACTION_START_SERVICE
                        })
                    }
                ) {
                    Icon(Icons.Default.PlayArrow, null)
                    Spacer(Modifier.width(4.dp))
                    Text("Bilow")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                    onClick  = {
                        context.startService(Intent(context, GeeshForegroundService::class.java).apply {
                            action = GeeshForegroundService.ACTION_STOP_SERVICE
                        })
                    }
                ) {
                    Icon(Icons.Default.Stop, null)
                    Spacer(Modifier.width(4.dp))
                    Text("Jooji")
                }
            }

            Spacer(Modifier.height(16.dp))

            // Info box
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color    = purple.copy(alpha = 0.1f),
                shape    = RoundedCornerShape(12.dp)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    InfoLine("📡", "Sender", "898")
                    InfoLine("📞", "USSD", "*806*0633920307*{lacag}*2050#")
                    InfoLine("🔐", "PIN", "3495")
                }
            }

            Spacer(Modifier.height(20.dp))

            // Recent transactions header
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Macaamiladii Dambe", fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.weight(1f))
                Surface(color = purple.copy(alpha = 0.25f), shape = RoundedCornerShape(8.dp)) {
                    Text(" ${recentTxns.size} ", color = purple, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }

            Spacer(Modifier.height(8.dp))

            if (recentTxns.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(vertical = 30.dp), contentAlignment = Alignment.Center) {
                    Text("Macaamiil ma jiraan weli", color = Color.White.copy(alpha = 0.3f), fontSize = 14.sp)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(recentTxns) { tx -> TxRow(tx) }
                }
            }
        }
    }
}

@Composable
private fun InfoLine(emoji: String, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(emoji, fontSize = 14.sp)
        Text("$label:", fontSize = 13.sp, color = Color.White.copy(alpha = 0.5f), modifier = Modifier.width(48.dp))
        Text(value, fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f), fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun AccessibilityCard(isActive: Boolean, onEnable: () -> Unit) {
    val color = if (isActive) Color(0xFF10B981) else Color(0xFFEF4444)
    Surface(
        modifier = Modifier.fillMaxWidth().border(1.dp, color, RoundedCornerShape(14.dp)),
        color    = color.copy(alpha = 0.07f),
        shape    = RoundedCornerShape(14.dp)
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (isActive) "✅ Accessibility waa Shidan" else "⚠️ Accessibility waa Damantahay",
                    fontWeight = FontWeight.Bold,
                    color      = color,
                    fontSize   = 14.sp
                )
                Text(
                    if (isActive) "PIN si toos ah ayuu ku gelin doonaa" else "Fur Settings oo shid Geesh Accessibility",
                    fontSize = 12.sp,
                    color    = Color.White.copy(alpha = 0.45f)
                )
            }
            if (!isActive) {
                Spacer(Modifier.width(12.dp))
                Button(
                    onClick = onEnable,
                    colors  = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                ) { Text("Shid", fontSize = 13.sp) }
            }
        }
    }
}

@Composable
private fun TxRow(tx: ProcessedTransaction) {
    val (color, icon) = when (tx.ussdResult) {
        "success"             -> Color(0xFF10B981) to "✅"
        "failed", "failed_accessibility" -> Color(0xFFEF4444) to "❌"
        "timeout"             -> Color(0xFFF59E0B) to "⏱️"
        else                  -> Color(0xFF94A3B8) to "⏳"
    }
    val sdf = SimpleDateFormat("dd MMM  HH:mm", Locale.getDefault())

    Surface(color = Color.White.copy(alpha = 0.05f), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(icon, fontSize = 20.sp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "\$${tx.amountDollar}  •  Tix: ${tx.tixraac.take(12)}",
                    fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp
                )
                Text(sdf.format(Date(tx.processedAt)), fontSize = 11.sp, color = Color.White.copy(alpha = 0.38f))
            }
            Text(tx.ussdResult, fontSize = 11.sp, color = color, fontWeight = FontWeight.SemiBold)
        }
    }
}


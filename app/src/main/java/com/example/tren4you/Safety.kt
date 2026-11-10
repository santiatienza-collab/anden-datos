package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Traffic
import androidx.compose.material.icons.filled.Train
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelGreen
import com.example.tren4you.ui.theme.LevelRed
import org.json.JSONObject

/** Señal de seguridad calculada por el servidor a partir de datos abiertos (no es un sistema de protección de trenes). */
data class SafetySignal(
    val id: String,
    val kind: String,
    val critical: Boolean,
    val title: String,
    val detail: String,
    val lat: Double?,
    val lon: Double?,
    val tripIds: List<String>,
)

data class SafetyData(val generatedAt: Long, val note: String, val compared: Int, val signals: List<SafetySignal>)

fun parseSafety(o: JSONObject): SafetyData {
    val arr = o.getJSONArray("signals")
    val signals = (0 until arr.length()).map {
        val x = arr.getJSONObject(it)
        val ids = x.optJSONArray("tripIds")
        SafetySignal(
            id = x.getString("id"), kind = x.optString("kind"), critical = x.optString("severity") == "critical",
            title = x.optString("title"), detail = x.optString("detail"),
            lat = if (x.has("lat") && !x.isNull("lat")) x.getDouble("lat") else null,
            lon = if (x.has("lon") && !x.isNull("lon")) x.getDouble("lon") else null,
            tripIds = if (ids == null) emptyList() else (0 until ids.length()).map { i -> ids.getString(i) },
        )
    }
    return SafetyData(
        o.optLong("generatedAt"), o.optString("note"),
        o.optJSONObject("stats")?.optInt("compared") ?: 0, signals,
    )
}

private fun kindIcon(kind: String): ImageVector = when (kind) {
    "accident" -> Icons.Filled.Report
    "signalling" -> Icons.Filled.Traffic
    "track" -> Icons.Filled.Construction
    "power" -> Icons.Filled.ElectricBolt
    "closing_in", "stopped_train" -> Icons.Filled.Train
    else -> Icons.Filled.Warning
}

/** Seguridad: situaciones de riesgo detectadas con datos abiertos. Al tocar una con trenes, se abre en el mapa. */
@Composable
fun SafetyPage(data: SafetyData?, loaded: Boolean, onPick: (SafetySignal) -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp)) {
            Text("Seguridad", color = AndenYellow, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text("Vigilancia con datos abiertos", color = Gray400, fontSize = 12.sp)
        }
        LazyColumn(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            val signals = data?.signals.orEmpty()
            if (!loaded || data == null) {
                item(key = "loading") { Text("Cargando…", color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(8.dp)) }
            } else if (signals.isEmpty()) {
                item(key = "none") {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray800).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = LevelGreen, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Sin señales de riesgo ahora", color = AndenWhite, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                            Text(
                                if (data.compared > 0) "Se han comparado ${data.compared} trenes con la actualización anterior."
                                else "Aún no hay una actualización anterior con la que comparar posiciones.",
                                color = Gray400, fontSize = 12.sp,
                            )
                        }
                    }
                }
            } else {
                items(signals.size, key = { "${signals[it].id}#$it" }) { i -> SignalCard(signals[i]) { onPick(signals[i]) } }
            }
            item(key = "note") {
                Text(
                    data?.note?.ifEmpty { null }
                        ?: "Este panel no sustituye a la señalización ni a los sistemas del operador.",
                    color = Gray400, fontSize = 11.sp, modifier = Modifier.padding(vertical = 14.dp, horizontal = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun SignalCard(s: SafetySignal, onClick: () -> Unit) {
    val color = if (s.critical) LevelRed else LevelAmber
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(14.dp)).background(Gray800)
            .clickable(enabled = s.lat != null, onClick = onClick).height(IntrinsicSize.Min),
    ) {
        Box(Modifier.width(5.dp).fillMaxHeight().background(color))
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(kindIcon(s.kind), null, tint = color, modifier = Modifier.size(26.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(s.title, color = AndenWhite, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(s.detail, color = Gray400, fontSize = 13.sp)
                Spacer(Modifier.height(6.dp))
                Text(if (s.critical) "CRÍTICO" else "ATENCIÓN", color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

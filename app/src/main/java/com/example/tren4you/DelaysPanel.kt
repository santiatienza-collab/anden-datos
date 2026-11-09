package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelRed

/** Gravedad de un retraso, de mayor a menor. */
private enum class Severity(val title: String, val hint: String, val color: Color, val dot: Color) {
    Cancelled("Cancelados", "Sin servicio", LevelRed, Color(0xFF9B1C16)),
    Severe("Graves", "15 min o más", LevelRed, LevelRed),
    Moderate("Moderados", "De 5 a 14 min", LevelAmber, LevelAmber),
}

private fun severityOf(t: Train): Severity? = when {
    t.cancelled -> Severity.Cancelled
    t.level == Level.Red -> Severity.Severe
    t.level == Level.Amber -> Severity.Moderate
    else -> null
}

/** Número de trenes con retraso o cancelados (para el contador de la pestaña). */
fun delayedCount(trains: List<Train>): Int = trains.count { severityOf(it) != null }

/**
 * Retrasos agrupados por gravedad (cancelados, graves, moderados) con cuatro botones de filtro del mismo
 * tamaño. La comunidad se elige con los selectores de arriba. Cada grupo va de mayor a menor retraso.
 */
@Composable
fun DelaysContent(trains: List<Train>, onPick: (Train) -> Unit) {
    var only by remember { mutableStateOf<Severity?>(null) } // null = todas las gravedades
    val groups = remember(trains) {
        trains.mapNotNull { t -> severityOf(t)?.let { it to t } }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, list) -> list.sortedByDescending { it.delayMin ?: 0 } }
    }
    val total = groups.values.sumOf { it.size }
    val shown = if (only == null) Severity.entries else listOf(only!!)
    val shownCount = shown.sumOf { groups[it]?.size ?: 0 }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SevSegment("Todos", total, Gray400, only == null, Modifier.weight(1f)) { only = null }
            for (s in Severity.entries) {
                SevSegment(s.title, groups[s]?.size ?: 0, s.dot, only == s, Modifier.weight(1f)) { only = if (only == s) null else s }
            }
        }
        Spacer(Modifier.height(4.dp))
        if (shownCount == 0) {
            Text(
                if (total == 0) "No hay retrasos en este momento." else "No hay trenes con esta gravedad.",
                color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp),
            )
        } else {
            LazyColumn(Modifier.weight(1f, fill = false).padding(horizontal = 14.dp)) {
                for (s in shown) {
                    val list = groups[s] ?: continue
                    item(key = "h-" + s.name) {
                        Row(Modifier.padding(top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${s.title} (${list.size})", color = s.color, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(8.dp))
                            Text(s.hint, color = Gray400, fontSize = 11.sp)
                        }
                    }
                    // Clave con el índice: dos trenes pueden compartir identificador y una clave repetida cierra la app.
                    itemsIndexed(list, key = { i, t -> "t-${s.name}-${t.id}#$i" }) { _, t -> DelayRow(t, s) { onPick(t) } }
                }
                item { Spacer(Modifier.size(8.dp)) }
            }
        }
    }
}

/** Botón de filtro: cuatro del mismo tamaño en fila, con el número arriba y la etiqueta con su color debajo. */
@Composable
private fun SevSegment(label: String, count: Int, dot: Color, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.height(58.dp).clip(RoundedCornerShape(14.dp))
            .background(if (on) AndenYellow else Gray900)
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("$count", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = if (on) Gray950 else AndenWhite)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
            Spacer(Modifier.width(4.dp))
            Text(
                label, fontSize = 10.sp, maxLines = 1, softWrap = false, fontWeight = FontWeight.Medium,
                color = if (on) Gray950 else Gray400,
            )
        }
    }
}

@Composable
private fun DelayRow(t: Train, s: Severity, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick).padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (s == Severity.Cancelled) "Cancel." else "+${t.delayMin ?: 0}′",
            color = s.color, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(54.dp),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                listOfNotNull(t.line, t.label).joinToString(" · "), color = AndenWhite, fontSize = 13.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val sub = t.route ?: t.stopName?.let { "Última parada: $it" }
            if (sub != null) Text(sub, color = Gray400, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

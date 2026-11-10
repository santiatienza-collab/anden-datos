package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material3.Icon
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
import com.example.tren4you.ui.theme.Gray600
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelGreen
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

/** Número de trenes con retraso o cancelados (para la insignia del menú). */
fun delayedCount(trains: List<Train>): Int = trains.count { severityOf(it) != null }

private fun serviceOf(t: Train): Service? = Service.from(t.service)

/**
 * Pantalla de retrasos: cifras clave, reparto por gravedad, comunidades más afectadas y la lista de trenes con su
 * retraso. Se filtra por comunidad (desplegable), por compañía/servicio (cuadrícula) y por gravedad (botones).
 */
@Composable
fun DelaysScreen(
    trains: List<Train>,
    dataTimeSec: Long?,
    now: Long,
    regions: List<Region>,
    region: Region?,
    onRegion: (Region?) -> Unit,
    onPick: (Train) -> Unit,
) {
    var service by remember { mutableStateOf<Service?>(null) } // null = todas las compañías
    var only by remember { mutableStateOf<Severity?>(null) } // null = todas las gravedades

    val regionNames = remember(regions) { regions.associate { it.id to it.name } }
    val inRegion = remember(trains, region) { if (region == null) trains else trains.filter { it.region == region.id } }
    val pool = remember(inRegion, service) { if (service == null) inRegion else inRegion.filter { serviceOf(it) == service } }
    // Trenes con retraso medido (los estimados por horario, como los de Mallorca, no cuentan).
    val measured = remember(pool) { pool.filter { it.level != Level.Gray || it.cancelled } }
    val groups = remember(pool) {
        pool.mapNotNull { t -> severityOf(t)?.let { it to t } }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, list) -> list.sortedByDescending { it.delayMin ?: 0 } }
    }
    val delayedTotal = groups.values.sumOf { it.size }
    val onTime = measured.count { it.level == Level.Green && !it.cancelled }
    val delayedNums = groups.filterKeys { it != Severity.Cancelled }.values.flatten().mapNotNull { it.delayMin }
    val avg = if (delayedNums.isEmpty()) 0 else delayedNums.average().toInt()
    val worst = groups.values.flatten().filter { !it.cancelled }.maxByOrNull { it.delayMin ?: 0 }
    val pct = if (measured.isEmpty()) 0 else delayedTotal * 100 / measured.size
    val shown = if (only == null) Severity.entries else listOf(only!!)
    val shownCount = shown.sumOf { groups[it]?.size ?: 0 }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Retrasos", color = AndenYellow, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(
                    dataTimeSec?.let { "Datos de ${ageLabel(now / 1000 - it).removePrefix("hace ")}" } ?: "Cargando…",
                    color = Gray400, fontSize = 12.sp,
                )
            }
            RegionDropdown(regions, region, onRegion)
        }

        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Compañía / servicio: cuadrícula 4 × 2 de botones iguales, con los retrasos de cada uno.
            item(key = "services") {
                val counts = remember(inRegion) { inRegion.groupBy { serviceOf(it) }.mapValues { (_, l) -> delayedCount(l) } }
                val cells: List<Pair<Service?, String>> = listOf(null to "Todas") + Service.entries.map { it to it.label }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (row in cells.chunked(4)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (cell in 0 until 4) {
                                val (s, label) = row.getOrNull(cell) ?: run { Spacer(Modifier.weight(1f)); continue }
                                val on = service == s
                                Column(
                                    Modifier.weight(1f).height(52.dp).clip(RoundedCornerShape(12.dp))
                                        .background(if (on) AndenYellow else Gray800)
                                        .clickable { service = s },
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(
                                        if (s == Service.Sfm) "—" else "${if (s == null) delayedCount(inRegion) else counts[s] ?: 0}", fontSize = 16.sp, fontWeight = FontWeight.Bold,
                                        color = if (on) Gray950 else AndenWhite,
                                    )
                                    Text(label, fontSize = 9.sp, maxLines = 1, softWrap = false, color = if (on) Gray950 else Gray400)
                                }
                            }
                        }
                    }
                    Text(
                        "Compañías con datos abiertos: Renfe, SFM (Mallorca), Euskotren, Metro Bilbao, FGC y TMB (próximos trenes).",
                        color = Gray600, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            // Mallorca: no hay retrasos en tiempo real, y se dice claramente
            if (inRegion.any { it.estimated } && (region?.id == "illes-balears" || service == Service.Sfm)) {
                item(key = "estimated-note") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray800).padding(14.dp)) {
                        Text("Mallorca: sin retrasos en tiempo real", color = AndenYellow, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "SFM y el Consorcio de Transportes no publican datos abiertos de retrasos. Se muestran los horarios " +
                                "oficiales y, en el mapa, la posición estimada de cada tren como un anillo blanco.",
                            color = Gray400, fontSize = 12.sp, lineHeight = 17.sp,
                        )
                    }
                }
            }

            // Cifras clave
            item(key = "kpis") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi("${measured.size}", "En circulación", AndenWhite, Modifier.weight(1f))
                    Kpi("$delayedTotal", "Con retraso", if (delayedTotal > 0) LevelAmber else LevelGreen, Modifier.weight(1f))
                    Kpi("$avg min", "Media", AndenWhite, Modifier.weight(1f))
                    Kpi("${worst?.delayMin ?: 0} min", "Máximo", if ((worst?.delayMin ?: 0) >= 15) LevelRed else AndenWhite, Modifier.weight(1f))
                }
            }

            // Reparto: puntuales / moderados / graves / cancelados
            item(key = "distribution") {
                val parts = listOf(
                    Triple("Puntuales", onTime, LevelGreen),
                    Triple("Moderados", groups[Severity.Moderate]?.size ?: 0, LevelAmber),
                    Triple("Graves", groups[Severity.Severe]?.size ?: 0, LevelRed),
                    Triple("Cancelados", groups[Severity.Cancelled]?.size ?: 0, Severity.Cancelled.dot),
                )
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray800).padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Estado de los trenes", color = AndenWhite, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        if (measured.isNotEmpty()) Text("$pct % con retraso", color = if (pct >= 40) LevelRed else Gray400, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(10.dp))
                    if (measured.isEmpty()) {
                        Text("Sin trenes con datos en tiempo real.", color = Gray400, fontSize = 12.sp)
                    } else {
                        Row(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(7.dp)).background(Gray900)) {
                            for ((_, n, c) in parts) if (n > 0) Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(c))
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            for ((label, n, c) in parts) {
                                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.size(8.dp).clip(CircleShape).background(c))
                                        Spacer(Modifier.width(5.dp))
                                        Text("$n", color = AndenWhite, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Text(label, color = Gray400, fontSize = 10.sp, maxLines = 1, softWrap = false)
                                }
                            }
                        }
                    }
                }
            }

            // Comunidades más afectadas (solo con "Toda España")
            if (region == null && delayedTotal > 0) {
                item(key = "by-region") {
                    val byRegion = remember(pool) {
                        pool.filter { severityOf(it) != null && it.region != null }.groupBy { it.region!! }
                            .map { (id, l) -> Triple(id, l.size, l.count { severityOf(it) == Severity.Severe || it.cancelled }) }
                            .sortedByDescending { it.second }.take(7)
                    }
                    val max = byRegion.maxOfOrNull { it.second }?.coerceAtLeast(1) ?: 1
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray800).padding(14.dp)) {
                        Text("Comunidades más afectadas", color = AndenWhite, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        for ((id, n, severe) in byRegion) {
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                    .clickable { regions.firstOrNull { it.id == id }?.let(onRegion) }.padding(vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(regionNames[id] ?: id, color = AndenWhite, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(138.dp))
                                Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(Gray900)) {
                                    Box(Modifier.fillMaxHeight().fillMaxWidth(n.toFloat() / max).clip(RoundedCornerShape(5.dp)).background(LevelAmber))
                                    if (severe > 0) Box(Modifier.fillMaxHeight().fillMaxWidth(severe.toFloat() / max).clip(RoundedCornerShape(5.dp)).background(LevelRed))
                                }
                                Text("$n", color = AndenWhite, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(34.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                            }
                        }
                        Text("Naranja: con retraso · Rojo: graves o cancelados · Toca una para filtrar", color = Gray600, fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }

            // Filtro de gravedad: cuatro botones iguales
            item(key = "severity") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SevSegment("Todos", delayedTotal, Gray400, only == null, Modifier.weight(1f)) { only = null }
                    for (s in Severity.entries) {
                        SevSegment(s.title, groups[s]?.size ?: 0, s.dot, only == s, Modifier.weight(1f)) { only = if (only == s) null else s }
                    }
                }
            }

            if (shownCount == 0) {
                item(key = "empty") {
                    Text(
                        if (delayedTotal == 0) "No hay retrasos con este filtro." else "No hay trenes con esta gravedad.",
                        color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp),
                    )
                }
            }
            for (s in shown) {
                val list = groups[s] ?: continue
                item(key = "h-" + s.name) {
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${s.title} (${list.size})", color = s.color, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Text(s.hint, color = Gray400, fontSize = 11.sp)
                    }
                }
                // Clave con el índice: dos trenes pueden compartir identificador y una clave repetida cierra la app.
                itemsIndexed(list, key = { i, t -> "t-${s.name}-${t.id}#$i" }) { _, t -> DelayCard(t, s, regionNames[t.region]) { onPick(t) } }
            }
            item(key = "end") { Spacer(Modifier.height(12.dp)) }
        }
    }
}

@Composable
private fun Kpi(value: String, caption: String, color: Color, modifier: Modifier) {
    Column(
        modifier.height(64.dp).clip(RoundedCornerShape(14.dp)).background(Gray800).padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(value, color = color, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
        Text(caption, color = Gray400, fontSize = 9.sp, maxLines = 1, softWrap = false)
    }
}

/** Botón de filtro de gravedad: cuatro del mismo tamaño, con el número arriba y la etiqueta con su color debajo. */
@Composable
private fun SevSegment(label: String, count: Int, dot: Color, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.height(58.dp).clip(RoundedCornerShape(14.dp)).background(if (on) AndenYellow else Gray800).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text("$count", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = if (on) Gray950 else AndenWhite)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
            Spacer(Modifier.width(4.dp))
            Text(label, fontSize = 10.sp, maxLines = 1, softWrap = false, fontWeight = FontWeight.Medium, color = if (on) Gray950 else Gray400)
        }
    }
}

/** Tarjeta de un tren con retraso: minutos en grande, tren y ruta, compañía, comunidad y barra de gravedad. */
@Composable
private fun DelayCard(t: Train, s: Severity, regionName: String?, onClick: () -> Unit) {
    val delay = t.delayMin ?: 0
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Gray800).clickable(onClick = onClick).padding(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            Modifier.width(62.dp).height(62.dp).clip(RoundedCornerShape(12.dp)).background(s.color.copy(alpha = 0.16f)),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            if (s == Severity.Cancelled) {
                Icon(Icons.Filled.Block, "Cancelado", tint = s.color, modifier = Modifier.size(24.dp))
                Text("Cancel.", color = s.color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            } else {
                Text("+$delay", color = s.color, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
                Text("min", color = s.color, fontSize = 10.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Service.from(t.service)?.let {
                    Text(
                        it.label, color = Gray950, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(AndenYellow).padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    listOfNotNull(t.line, t.label).joinToString(" · "), color = AndenWhite, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            t.route?.let { Text(it, color = AndenWhite, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp)) }
            val where = listOfNotNull(t.stopName?.let { "Última parada: $it" }, regionName).joinToString(" · ")
            if (where.isNotEmpty()) Text(where, color = Gray400, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            // Barra de gravedad: llena a los 90 minutos de retraso
            Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Gray900)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(if (s == Severity.Cancelled) 1f else (delay / 90f).coerceIn(0.04f, 1f)).background(s.color))
            }
        }
    }
}

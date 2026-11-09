package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.NotAccessible
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import java.text.Collator
import java.util.Locale

private const val OUTSIDE = "Fuera de España"

private sealed interface StationListRow {
    data class Header(val province: String, val total: Int, val withAlerts: Int, val open: Boolean) : StationListRow
    data class Item(val station: Station, val showProvince: Boolean) : StationListRow
}

/**
 * Todas las estaciones de la comunidad elegida, agrupadas por provincia. Dentro de cada provincia van primero
 * las que tienen avisos (accesibilidad limitada antes que el resto) y luego el resto por orden alfabético.
 * Cada provincia se pliega y despliega tocando su cabecera. Con una búsqueda, la lista es plana.
 */
@Composable
fun StationsContent(
    stations: List<Station>,
    regions: List<Region>,
    region: Region?,
    onRegion: (Region?) -> Unit,
    onPick: (Station) -> Unit,
) {
    var q by remember { mutableStateOf("") }
    // Estado de plegado por provincia; se reinicia al cambiar de comunidad.
    var onlyAlerts by remember { mutableStateOf(false) }
    val opened = remember(region?.id, onlyAlerts) { mutableStateMapOf<String, Boolean>() }
    val inRegion = remember(stations, region) { if (region == null) stations else stations.filter { it.region == region.id } }
    val pool = remember(inRegion, onlyAlerts) { if (onlyAlerts) inRegion.filter { it.alerts > 0 } else inRegion }
    val searching = q.trim().length >= 2
    val regionNames = remember(regions) { regions.associate { it.id to it.name } }
    val collator = remember { Collator.getInstance(Locale("es", "ES")) }

    val rows: List<StationListRow> = remember(pool, q, opened.toMap(), region?.id, onlyAlerts) {
        if (searching) {
            searchStations(pool, q).map { StationListRow.Item(it, showProvince = true) }
        } else {
            val byAlerts = compareBy<Station> { it.alerts == 0 }.thenBy { !it.accessibilityIssue }
            pool.groupBy { it.province ?: OUTSIDE }
                .toSortedMap { a, b -> if (a == OUTSIDE) 1 else if (b == OUTSIDE) -1 else collator.compare(a, b) }
                .flatMap { (province, list) ->
                    // Con una comunidad elegida las provincias salen desplegadas; con toda España, plegadas.
                    val open = opened[province] ?: (region != null || onlyAlerts)
                    val sorted = list.sortedWith(byAlerts.thenComparator { a, b -> collator.compare(a.name, b.name) })
                    buildList {
                        add(StationListRow.Header(province, list.size, list.count { it.alerts > 0 }, open))
                        if (open) sorted.forEach { add(StationListRow.Item(it, showProvince = false)) }
                    }
                }
        }
    }
    val withAlerts = inRegion.count { it.alerts > 0 }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            RegionDropdown(regions, region, onRegion, Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            // Filtro: solo estaciones con avisos activos
            Row(
                Modifier.clip(RoundedCornerShape(10.dp)).background(if (onlyAlerts) AndenYellow else Gray900)
                    .clickable { onlyAlerts = !onlyAlerts }.padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Warning, null, tint = if (onlyAlerts) Gray950 else AndenYellow, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Con avisos", color = if (onlyAlerts) Gray950 else AndenWhite, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, softWrap = false)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Gray900).padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, null, tint = AndenYellow, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            BasicTextField(
                value = q, onValueChange = { q = it }, singleLine = true,
                textStyle = TextStyle(color = AndenWhite, fontSize = 15.sp),
                cursorBrush = SolidColor(AndenYellow),
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    if (q.isEmpty()) Text("Buscar estación…", color = Gray400, fontSize = 15.sp)
                    inner()
                },
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            if (searching) "${rows.size} resultado${if (rows.size == 1) "" else "s"}"
            else if (onlyAlerts) "${pool.size} estaciones con avisos"
            else "${inRegion.size} estaciones · $withAlerts con avisos",
            color = Gray400, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 14.dp),
        )
        if (rows.isEmpty()) {
            Text(
                if (searching) "Sin resultados." else "No hay estaciones. Los datos aún se están cargando.",
                color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp),
            )
        } else LazyColumn(Modifier.weight(1f, fill = false).padding(horizontal = 14.dp)) {
            // Clave con el índice: una clave repetida cerraría la app.
            items(rows.size, key = { i ->
                when (val r = rows[i]) {
                    is StationListRow.Header -> "h-${r.province}"
                    is StationListRow.Item -> "s-${r.station.id}#$i"
                }
            }) { i ->
                when (val r = rows[i]) {
                    is StationListRow.Header -> ProvinceHeader(r) { opened[r.province] = !r.open }
                    is StationListRow.Item -> {
                        val subtitle = if (r.showProvince) {
                            listOfNotNull(r.station.province, if (region == null) regionNames[r.station.region] else null).joinToString(" · ")
                        } else null
                        StationRow(r.station, subtitle) { onPick(r.station) }
                    }
                }
            }
            item(key = "end") { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun ProvinceHeader(h: StationListRow.Header, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).background(Gray900).clickable(onClick = onToggle).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(h.province, color = AndenWhite, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (h.withAlerts > 0) {
            Icon(Icons.Filled.Warning, null, tint = AndenYellow, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(3.dp))
            Text("${h.withAlerts}", color = AndenYellow, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(10.dp))
        }
        Text("${h.total}", color = Gray400, fontSize = 12.sp)
        Spacer(Modifier.width(4.dp))
        Icon(if (h.open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, if (h.open) "Plegar" else "Desplegar", tint = Gray400, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun StationRow(s: Station, subtitle: String?, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(s.name, color = AndenWhite, fontSize = 14.sp)
            if (!subtitle.isNullOrEmpty()) Text(subtitle, color = Gray400, fontSize = 11.sp)
        }
        if (s.accessibilityIssue) Icon(Icons.Filled.NotAccessible, "Accesibilidad limitada", tint = AndenYellow, modifier = Modifier.size(20.dp))
        else if (s.alerts > 0) Icon(Icons.Filled.Warning, "Con avisos", tint = Gray400, modifier = Modifier.size(20.dp))
    }
}

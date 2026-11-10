package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.NotAccessible
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Subway
import androidx.compose.material.icons.filled.Train
import androidx.compose.material.icons.filled.UnfoldLess
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.example.tren4you.ui.theme.Gray600
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import java.text.Collator
import java.util.Locale

private const val OUTSIDE = "Fuera de España"
private const val OUTSIDE_ID = "_fuera"

/** Nodo del árbol de estaciones: comunidad (nivel 0) → provincia (nivel 1) → estación (nivel 2). */
private sealed interface Node {
    data class Community(val id: String, val name: String, val total: Int, val alerts: Int, val open: Boolean) : Node
    data class Province(val key: String, val name: String, val total: Int, val alerts: Int, val open: Boolean) : Node
    data class Leaf(val station: Station, val level: Int, val subtitle: String?) : Node
}

/**
 * Estaciones como árbol desplegable: comunidad autónoma → provincia → estación. Cada rama muestra cuántas estaciones
 * tiene y cuántas con avisos; dentro de cada provincia van primero las estaciones con avisos. Con una búsqueda, la lista es plana.
 * Al tocar una estación se abre su tablero en el mapa.
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
    var onlyAlerts by remember { mutableStateOf(false) }
    // 0 = por defecto, 1 = todo desplegado, -1 = todo plegado. Cambiar de modo, de comunidad o de filtro reinicia las ramas abiertas a mano.
    var mode by remember { mutableIntStateOf(0) }
    val opened = remember(region?.id, onlyAlerts, mode) { mutableStateMapOf<String, Boolean>() }
    val inRegion = remember(stations, region) { if (region == null) stations else stations.filter { it.region == region.id } }
    val pool = remember(inRegion, onlyAlerts) { if (onlyAlerts) inRegion.filter { it.alerts > 0 } else inRegion }
    val searching = q.trim().length >= 2
    val regionNames = remember(regions) { regions.associate { it.id to it.name } }
    val collator = remember { Collator.getInstance(Locale("es", "ES")) }

    val tree: List<Node> = remember(pool, q, opened.toMap(), region?.id, onlyAlerts, mode, regionNames) {
        if (searching) {
            searchStations(pool, q).map { s ->
                Node.Leaf(s, 0, listOfNotNull(s.province, if (region == null) regionNames[s.region] else null).joinToString(" · "))
            }
        } else {
            val byAlerts = compareBy<Station> { it.alerts == 0 }.thenBy { !it.accessibilityIssue }
            fun resolve(key: String, default: Boolean) = opened[key] ?: when (mode) { 1 -> true; -1 -> false; else -> default }
            val communities = pool.groupBy { it.region ?: OUTSIDE_ID }.entries
                .sortedWith { a, b ->
                    if (a.key == OUTSIDE_ID) 1 else if (b.key == OUTSIDE_ID) -1
                    else collator.compare(regionNames[a.key] ?: a.key, regionNames[b.key] ?: b.key)
                }
            communities.flatMap { (rid, inCommunity) ->
                val provinces = inCommunity.groupBy { it.province ?: OUTSIDE }
                    .toSortedMap { a, b -> if (a == OUTSIDE) 1 else if (b == OUTSIDE) -1 else collator.compare(a, b) }
                // Con una comunidad elegida (o el filtro de avisos) la rama sale desplegada; con toda España, plegada.
                val rOpen = resolve("r:$rid", region != null || onlyAlerts)
                buildList {
                    add(Node.Community(rid, regionNames[rid] ?: OUTSIDE, inCommunity.size, inCommunity.count { it.alerts > 0 }, rOpen))
                    if (rOpen) provinces.forEach { (prov, list) ->
                        val key = "p:$rid/$prov"
                        // Las provincias salen plegadas, salvo que sea la única de la comunidad o se filtre por avisos.
                        val pOpen = resolve(key, onlyAlerts || provinces.size == 1)
                        add(Node.Province(key, prov, list.size, list.count { it.alerts > 0 }, pOpen))
                        if (pOpen) list.sortedWith(byAlerts.thenComparator { a, b -> collator.compare(a.name, b.name) })
                            .forEach { add(Node.Leaf(it, 2, null)) }
                    }
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
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (searching) "${tree.size} resultado${if (tree.size == 1) "" else "s"}"
                else if (onlyAlerts) "${pool.size} estaciones con avisos"
                else "${inRegion.size} estaciones · $withAlerts con avisos",
                color = Gray400, fontSize = 11.sp, modifier = Modifier.weight(1f),
            )
            if (!searching) {
                TreeButton("Expandir", Icons.Filled.UnfoldMore) { mode = 1 }
                Spacer(Modifier.width(6.dp))
                TreeButton("Plegar", Icons.Filled.UnfoldLess) { mode = -1 }
            }
        }
        Spacer(Modifier.height(4.dp))
        if (tree.isEmpty()) {
            Text(
                if (searching) "Sin resultados." else "No hay estaciones. Los datos aún se están cargando.",
                color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp),
            )
        } else LazyColumn(Modifier.weight(1f, fill = false).padding(horizontal = 14.dp)) {
            // Anuncio nativo de prueba (AdMob) al principio de la lista, fuera de las búsquedas.
            if (!searching) item(key = "ad") { NativeAdCard(Modifier.padding(vertical = 6.dp)) }
            // Clave con el índice: una clave repetida cerraría la app.
            items(tree.size, key = { i ->
                when (val n = tree[i]) {
                    is Node.Community -> "c-${n.id}"
                    is Node.Province -> "p-${n.key}"
                    is Node.Leaf -> "s-${n.station.id}#$i"
                }
            }) { i ->
                when (val n = tree[i]) {
                    is Node.Community -> CommunityRow(n) { opened["r:${n.id}"] = !n.open }
                    is Node.Province -> ProvinceRow(n) { opened[n.key] = !n.open }
                    is Node.Leaf -> StationLeaf(n) { onPick(n.station) }
                }
            }
            item(key = "end") { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun TreeButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, label, tint = AndenYellow, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(3.dp))
        Text(label, color = AndenYellow, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Fila del árbol con líneas guía verticales a la izquierda (una por nivel de profundidad). */
@Composable
private fun TreeRow(level: Int, content: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        repeat(level) {
            Box(Modifier.padding(start = 9.dp, end = 9.dp).width(2.dp).fillMaxHeight().background(Gray800))
        }
        content()
    }
}

/** Número de estaciones con aviso (insignia amarilla) y total de la rama. */
@Composable
private fun Counts(alerts: Int, total: Int) {
    if (alerts > 0) {
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(AndenYellow.copy(alpha = 0.16f)).padding(horizontal = 7.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Warning, null, tint = AndenYellow, modifier = Modifier.size(13.dp))
            Spacer(Modifier.width(3.dp))
            Text("$alerts", color = AndenYellow, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
    }
    Text("$total", color = Gray400, fontSize = 12.sp)
}

@Composable
private fun CommunityRow(n: Node.Community, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(12.dp)).background(Gray900)
            .clickable(onClick = onToggle).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Place, null, tint = AndenYellow, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(n.name, color = AndenWhite, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Counts(n.alerts, n.total)
        Spacer(Modifier.width(4.dp))
        Icon(if (n.open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, if (n.open) "Plegar" else "Desplegar", tint = Gray400, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun ProvinceRow(n: Node.Province, onToggle: () -> Unit) {
    TreeRow(1) {
        Row(
            Modifier.weight(1f).padding(top = 4.dp).clip(RoundedCornerShape(10.dp)).clickable(onClick = onToggle).padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(n.name, color = AndenWhite, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Counts(n.alerts, n.total)
            Spacer(Modifier.width(4.dp))
            Icon(if (n.open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, if (n.open) "Plegar" else "Desplegar", tint = Gray400, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun StationLeaf(n: Node.Leaf, onClick: () -> Unit) {
    val s = n.station
    TreeRow(n.level) {
        Row(
            Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (s.id.startsWith("tmb-")) TmbMetroIcon(18.dp)
            else if (s.metro) Icon(Icons.Filled.Subway, "Metro", tint = AndenYellow, modifier = Modifier.size(16.dp))
            else Icon(Icons.Filled.Train, null, tint = Gray600, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(s.name, color = AndenWhite, fontSize = 14.sp)
                if (!n.subtitle.isNullOrEmpty()) Text(n.subtitle, color = Gray400, fontSize = 11.sp)
            }
            if (s.accessibilityIssue) Icon(Icons.Filled.NotAccessible, "Accesibilidad limitada", tint = AndenYellow, modifier = Modifier.size(20.dp))
            else if (s.alerts > 0) Icon(Icons.Filled.Warning, "Con avisos", tint = AndenYellow, modifier = Modifier.size(18.dp))
        }
    }
}

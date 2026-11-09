package com.example.tren4you

import androidx.compose.foundation.background
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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessible
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelRed

private data class CategoryFilter(val category: AlertCategory?, val label: String, val icon: ImageVector)

private val CATEGORIES = listOf(
    CategoryFilter(null, "Todos", Icons.Filled.Apps),
    CategoryFilter(AlertCategory.Accessibility, "Accesib.", Icons.Filled.Accessible),
    CategoryFilter(AlertCategory.Disruption, "Incid.", Icons.Filled.Warning),
    CategoryFilter(AlertCategory.Strike, "Huelgas", Icons.Filled.Campaign),
    CategoryFilter(AlertCategory.Works, "Obras", Icons.Filled.Construction),
    CategoryFilter(AlertCategory.Bus, "Autobús", Icons.Filled.DirectionsBus),
    CategoryFilter(AlertCategory.Other, "Otros", Icons.Filled.Info),
)

private fun severityRank(a: AlertItem) = when {
    a.stationInaccessible || a.severity == "critical" -> 0
    a.severity == "warning" -> 1
    else -> 2
}

private fun severityColor(a: AlertItem): Color = when {
    a.stationInaccessible || a.severity == "critical" -> LevelRed
    a.category == AlertCategory.Accessibility -> AndenYellow
    a.severity == "warning" -> LevelAmber
    else -> Gray400
}

/** Avisos de servicio de la comunidad elegida, filtrables por tipo (con iconos). */
@Composable
fun AlertsContent(
    alerts: List<AlertItem>,
    loaded: Boolean,
    regions: List<Region>,
    region: Region?,
    onRegion: (Region?) -> Unit,
) {
    var category by remember { mutableStateOf<AlertCategory?>(null) }
    val shown = remember(alerts, region, category) {
        alerts.filter { (region == null || region.id in it.regions) && (category == null || it.category == category) }
            // Primero los activos y, dentro de cada grupo, los más graves.
            .sortedWith(compareBy<AlertItem> { !it.active }.thenBy { severityRank(it) })
    }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            RegionDropdown(regions, region, onRegion, Modifier.weight(1f))
            Spacer(Modifier.width(10.dp))
            Text("${shown.size} aviso${if (shown.size == 1) "" else "s"}", color = Gray400, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        // Siete botones del mismo tamaño: icono arriba y etiqueta corta debajo.
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (c in CATEGORIES) {
                val on = category == c.category
                Column(
                    Modifier.weight(1f).height(52.dp).clip(RoundedCornerShape(12.dp))
                        .background(if (on) AndenYellow else Gray900)
                        .clickable { category = c.category },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(c.icon, c.label, tint = if (on) Gray950 else Gray400, modifier = Modifier.size(20.dp))
                    Text(
                        c.label, fontSize = 9.sp, maxLines = 1, softWrap = false, fontWeight = FontWeight.Medium,
                        color = if (on) Gray950 else Gray400,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        when {
            !loaded -> Text("Cargando avisos…", color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            shown.isEmpty() -> Text("No hay avisos con este filtro.", color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            else -> LazyColumn(
                Modifier.weight(1f, fill = false), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Clave con el índice: Renfe llega a repetir el id de un aviso, y una clave duplicada cierra la app.
                itemsIndexed(shown, key = { i, a -> "${a.id}#$i" }) { _, a -> AlertCard(a) }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
}

@Composable
private fun AlertCard(a: AlertItem) {
    val tint = severityColor(a)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray900).padding(12.dp), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(tint.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) { Icon(alertIcon(a.category, a.element, a.stationInaccessible), null, tint = tint, modifier = Modifier.size(22.dp)) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            if (!a.active && a.activeFrom != null) {
                val d = java.text.SimpleDateFormat("d MMM", java.util.Locale("es", "ES")).format(java.util.Date(a.activeFrom * 1000))
                Text("Desde el $d", color = AndenYellow, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(2.dp))
            }
            Text(a.text, color = AndenWhite, fontSize = 13.sp, lineHeight = 18.sp)
            val chips = a.lines + a.stationNames
            if (chips.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(chips.size) { i ->
                        Text(
                            chips[i], color = Gray400, fontSize = 11.sp,
                            modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Gray800).padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

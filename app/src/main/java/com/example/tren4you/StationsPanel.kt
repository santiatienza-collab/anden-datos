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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotAccessible
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray900

/**
 * Estaciones de la comunidad elegida: buscador y, sin búsqueda, las que tienen avisos
 * (las de accesibilidad limitada primero). Al tocar una se abre su tablero en el mapa.
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
    val inRegion = remember(stations, region) { if (region == null) stations else stations.filter { it.region == region.id } }
    val searching = q.trim().length >= 2
    val list = remember(inRegion, q) {
        if (searching) searchStations(inRegion, q)
        else inRegion.filter { it.alerts > 0 }.sortedWith(compareBy<Station> { !it.accessibilityIssue }.thenBy { it.name })
    }
    val regionNames = remember(regions) { regions.associate { it.id to it.name } }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            RegionDropdown(regions, region, onRegion, Modifier.weight(1f))
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
            if (searching) "${list.size} resultado${if (list.size == 1) "" else "s"}" else "Estaciones con avisos",
            color = Gray400, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 14.dp),
        )
        if (list.isEmpty()) {
            Text(
                if (searching) "Sin resultados." else "No hay estaciones con avisos. Usa el buscador para encontrar una.",
                color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(14.dp),
            )
        } else LazyColumn(Modifier.weight(1f, fill = false).padding(horizontal = 14.dp)) {
            itemsIndexed(list, key = { i, s -> "${s.id}#$i" }) { _, s ->
                Row(Modifier.fillMaxWidth().clickable { onPick(s) }.padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.name, color = AndenWhite, fontSize = 14.sp)
                        if (region == null) s.region?.let { Text(regionNames[it] ?: it, color = Gray400, fontSize = 11.sp) }
                    }
                    if (s.accessibilityIssue) Icon(Icons.Filled.NotAccessible, "Accesibilidad limitada", tint = AndenYellow, modifier = Modifier.size(20.dp))
                    else if (s.alerts > 0) Icon(Icons.Filled.Warning, "Con avisos", tint = Gray400, modifier = Modifier.size(20.dp))
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

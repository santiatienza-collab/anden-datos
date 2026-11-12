package com.anden.miapp

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anden.miapp.ui.theme.AndenYellow
import com.anden.miapp.ui.theme.Gray400

/** Cabecera común de las páginas: título, texto secundario y el desplegable de comunidad. */
@Composable
private fun PageHeader(title: String, subtitle: String) {
    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp)) {
        Text(title, color = AndenYellow, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(subtitle, color = Gray400, fontSize = 12.sp)
    }
}

/** Avisos de servicio: filtro de comunidad (desplegable) y de tipo (iconos). */
@Composable
fun AlertsPage(
    alerts: List<AlertItem>, loaded: Boolean, regions: List<Region>, region: Region?, onRegion: (Region?) -> Unit,
    critical: Map<String, SafetySignal> = emptyMap(), onLocate: (String) -> Unit = {},
) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        PageHeader("Avisos", region?.name ?: "Toda España")
        Box(Modifier.weight(1f)) { AlertsContent(alerts, loaded, regions, region, onRegion, critical, onLocate) }
    }
}

/** Estaciones: buscador y filtro de comunidad. Al tocar una se abre su tablero en el mapa. */
@Composable
fun StationsPage(stations: List<Station>, regions: List<Region>, region: Region?, onRegion: (Region?) -> Unit, onOpen: (Station) -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        PageHeader("Estaciones", region?.name ?: "Toda España")
        Box(Modifier.weight(1f)) { StationsContent(stations, regions, region, onRegion, onOpen) }
    }
}

package com.example.tren4you

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.example.tren4you.ui.theme.Gray900
import kotlinx.coroutines.delay

/**
 * Interfaz única: el mapa con todo (retrasos, avisos y estaciones en un panel) y, encima, Ajustes
 * cuando se pulsa el engranaje. Aquí se cargan los datos que comparten las pestañas.
 */
@Composable
fun MainScreen() {
    var regions by remember { mutableStateOf<List<Region>>(emptyList()) }
    var region by remember { mutableStateOf<Region?>(null) } // null = toda España
    var stations by remember { mutableStateOf<List<Station>>(emptyList()) }
    var alerts by remember { mutableStateOf<List<AlertItem>>(emptyList()) }
    var alertsLoaded by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }

    // Comunidades: se reintenta hasta que haya conexión.
    LaunchedEffect(Unit) {
        while (regions.isEmpty()) {
            runCatching { TrainsApi.regions() }.onSuccess { regions = it }
            if (regions.isEmpty()) delay(5_000)
        }
    }
    // Estaciones (con marcas de aviso) y avisos: se renuevan con cada instantánea de datos (~5 min).
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { TrainsApi.stations() }.onSuccess { stations = it }
            delay(120_000)
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { TrainsApi.alerts() }.onSuccess { alerts = it; alertsLoaded = true }
            delay(120_000)
        }
    }

    BackHandler(enabled = showSettings) { showSettings = false }

    Box(Modifier.fillMaxSize().background(Gray900)) {
        MapScreen(
            regions = regions, region = region, onRegion = { region = it },
            stations = stations, alerts = alerts, alertsLoaded = alertsLoaded,
            onSettings = { showSettings = true },
        )
        if (showSettings) {
            // Capa opaca que además impide que los toques lleguen al mapa de debajo.
            Box(
                Modifier.fillMaxSize().background(Gray900)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
            ) { SettingsScreen(onBack = { showSettings = false }) }
        }
    }
}

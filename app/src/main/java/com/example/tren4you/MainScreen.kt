package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Train
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelRed
import kotlinx.coroutines.delay

enum class Section(val label: String, val icon: ImageVector) {
    Map("Mapa", Icons.Filled.Map),
    Delays("Retrasos", Icons.Filled.Schedule),
    Alerts("Avisos", Icons.Filled.Notifications),
    Stations("Estaciones", Icons.Filled.Train),
    Settings("Ajustes", Icons.Filled.Settings),
}

/**
 * Menú inferior con cinco secciones. La comunidad elegida, los trenes, las estaciones y los avisos se comparten
 * entre secciones. El mapa permanece siempre montado (conserva cámara y estado) y las demás secciones se
 * dibujan encima.
 */
@Composable
fun MainScreen() {
    var section by rememberSaveable { mutableStateOf(Section.Map) }
    var regions by remember { mutableStateOf<List<Region>>(emptyList()) }
    var region by remember { mutableStateOf<Region?>(null) } // null = toda España
    var trains by remember { mutableStateOf<List<Train>>(emptyList()) }
    var dataTimeSec by remember { mutableStateOf<Long?>(null) }
    var trainsError by remember { mutableStateOf<String?>(null) }
    var stations by remember { mutableStateOf<List<Station>>(emptyList()) }
    var alerts by remember { mutableStateOf<List<AlertItem>>(emptyList()) }
    var alertsLoaded by remember { mutableStateOf(false) }
    var pendingStation by remember { mutableStateOf<Station?>(null) }
    var pendingTrain by remember { mutableStateOf<Train?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    // Comunidades: se reintenta hasta que haya conexión.
    LaunchedEffect(Unit) {
        while (regions.isEmpty()) {
            runCatching { TrainsApi.regions() }.onSuccess { regions = it }
            if (regions.isEmpty()) delay(5_000)
        }
    }
    // Los datos se publican cada ~5 min en origen; pedirlos con más frecuencia no aporta nada.
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { TrainsApi.trains() }
                .onSuccess { trains = it.trains; dataTimeSec = it.generatedAt; trainsError = null }
                .onFailure { trainsError = it.message ?: "sin conexión" }
            delay(60_000)
        }
    }
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
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1_000) } }

    val inRegion = remember(trains, region) { if (region == null) trains else trains.filter { it.region == region?.id } }
    val delayedBadge = remember(inRegion) { delayedCount(inRegion) }
    val alertBadge = remember(alerts, region) {
        alerts.count { it.active && it.severity != "info" && (region == null || region?.id in it.regions) }
    }

    Scaffold(
        containerColor = Gray900,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            NavigationBar(containerColor = Gray800) {
                for (s in Section.entries) {
                    val badge = when (s) { Section.Delays -> delayedBadge; Section.Alerts -> alertBadge; else -> 0 }
                    NavigationBarItem(
                        selected = section == s,
                        onClick = { section = s },
                        icon = {
                            if (badge > 0) {
                                BadgedBox(badge = { Badge(containerColor = LevelRed, contentColor = AndenWhite) { Text("$badge", fontSize = 10.sp) } }) {
                                    Icon(s.icon, s.label)
                                }
                            } else Icon(s.icon, s.label)
                        },
                        label = { Text(s.label, fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Gray950, selectedTextColor = AndenYellow, indicatorColor = AndenYellow,
                            unselectedIconColor = Gray400, unselectedTextColor = Gray400,
                        ),
                    )
                }
            }
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(bottom = pad.calculateBottomPadding())) {
            MapScreen(
                regions = regions, region = region, onRegion = { region = it },
                stations = stations, trains = trains, dataTimeSec = dataTimeSec, error = trainsError,
                pendingStation = pendingStation, pendingTrain = pendingTrain,
                onPendingHandled = { pendingStation = null; pendingTrain = null },
            )
            if (section != Section.Map) {
                // Capa opaca que además impide que los toques lleguen al mapa de debajo.
                Box(
                    Modifier.fillMaxSize().background(Gray900)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
                ) {
                    when (section) {
                        Section.Delays -> DelaysScreen(
                            trains, dataTimeSec, now, regions, region, onRegion = { region = it },
                            onPick = { pendingTrain = it; section = Section.Map },
                        )
                        Section.Alerts -> AlertsPage(alerts, alertsLoaded, regions, region, onRegion = { region = it })
                        Section.Stations -> StationsPage(
                            stations, regions, region, onRegion = { region = it },
                            onOpen = { pendingStation = it; section = Section.Map },
                        )
                        Section.Settings -> SettingsScreen()
                        Section.Map -> {}
                    }
                }
            }
        }
    }
}

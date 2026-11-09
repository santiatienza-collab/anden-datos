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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Train
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
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
import com.example.tren4you.ui.theme.Gray600
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950

enum class PanelTab(val label: String, val icon: ImageVector) {
    Delays("Retrasos", Icons.Filled.Schedule),
    Alerts("Avisos", Icons.Filled.Notifications),
    Stations("Estaciones", Icons.Filled.Train),
}

/**
 * Panel inferior único con toda la información: tres pestañas (Retrasos, Avisos, Estaciones) que se
 * despliegan sobre el mapa. Tocar la pestaña activa lo pliega. Reemplaza al menú de navegación.
 */
@Composable
fun InfoPanel(
    tab: PanelTab,
    onTab: (PanelTab) -> Unit,
    open: Boolean,
    onOpen: (Boolean) -> Unit,
    trains: List<Train>,
    alerts: List<AlertItem>,
    alertsLoaded: Boolean,
    stations: List<Station>,
    regions: List<Region>,
    region: Region?,
    onRegion: (Region?) -> Unit,
    onPickTrain: (Train) -> Unit,
    onPickStation: (Station) -> Unit,
) {
    val alertCount = alerts.count { it.active && it.severity != "info" && (region == null || region.id in it.regions) }
    val counts = mapOf(PanelTab.Delays to delayedCount(trains), PanelTab.Alerts to alertCount, PanelTab.Stations to null)

    Surface(shape = RoundedCornerShape(20.dp), color = Gray800.copy(alpha = 0.97f)) {
        Column(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 10.dp)) {
            // Asa: también pliega y despliega.
            Box(Modifier.fillMaxWidth().clickable { onOpen(!open) }.padding(bottom = 8.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.width(38.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Gray600))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (t in PanelTab.entries) {
                    val on = open && tab == t
                    Row(
                        Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(14.dp))
                            .background(if (on) AndenYellow else Gray900)
                            .clickable { if (on) onOpen(false) else { onTab(t); onOpen(true) } },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(t.icon, t.label, tint = if (on) Gray950 else AndenYellow, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            t.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, softWrap = false,
                            color = if (on) Gray950 else AndenWhite,
                        )
                        counts[t]?.let {
                            Spacer(Modifier.width(5.dp))
                            Text("$it", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (on) Gray950 else Gray400)
                        }
                    }
                }
            }
            if (open) {
                Spacer(Modifier.height(10.dp))
                // Altura acotada: el contenido de cada pestaña se desplaza dentro.
                Box(Modifier.heightIn(max = 400.dp)) {
                    when (tab) {
                        PanelTab.Delays -> Column {
                            Row(Modifier.padding(horizontal = 14.dp).padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                RegionDropdown(regions, region, onRegion, Modifier.weight(1f))
                            }
                            DelaysContent(trains, onPickTrain)
                        }
                        PanelTab.Alerts -> AlertsContent(alerts, alertsLoaded, regions, region, onRegion)
                        PanelTab.Stations -> StationsContent(stations, regions, region, onRegion, onPickStation)
                    }
                }
            }
        }
    }
}

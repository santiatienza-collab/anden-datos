package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelGreen
import com.example.tren4you.ui.theme.LevelRed
import kotlinx.coroutines.delay

private fun sourceLabel(id: String) = when (id) {
    "renfe-gtfs-cercanias" -> "Horarios · Cercanías"
    "renfe-gtfs-ld" -> "Horarios · Larga distancia"
    "renfe-rt-cercanias-trips" -> "Retrasos · Cercanías"
    "renfe-rt-ld-trips" -> "Retrasos · Larga distancia"
    "renfe-rt-cercanias-vehicles" -> "Posiciones · Cercanías"
    "renfe-rt-ld-vehicles" -> "Posiciones · Larga distancia"
    "renfe-alerts" -> "Avisos de Renfe"
    "ctm-mallorca" -> "Horarios · Mallorca (SFM)"
    else -> id
}

@Composable
fun SettingsScreen() {
    var sources by remember { mutableStateOf<List<SourceStatus>?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { TrainsApi.sources() }.onSuccess { sources = it; failed = false }.onFailure { failed = true }
            delay(15_000)
        }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Ajustes", color = AndenYellow, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        Section("Estado de los datos") {
            Text(
                "Los datos se actualizan cada pocos minutos desde GitHub; la antigüedad que ves es la de la última actualización.",
                color = Gray400, fontSize = 12.sp, lineHeight = 17.sp,
            )
            Spacer(Modifier.height(10.dp))
            val list = sources
            when {
                list == null && failed -> Text("Sin conexión con los datos.", color = LevelAmber, fontSize = 13.sp)
                list == null -> Text("Comprobando…", color = Gray400, fontSize = 13.sp)
                else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    for (s in list) {
                        val stale = (s.ageSec ?: 0) > 600
                        val color = when { !s.ok -> LevelRed; stale -> LevelAmber; else -> LevelGreen }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(9.dp).clip(CircleShape).background(color))
                            Spacer(Modifier.width(10.dp))
                            Text(sourceLabel(s.id), color = AndenWhite, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Text(
                                when { !s.ok -> "error"; s.ageSec != null -> ageLabel(s.ageSec) + if (stale) " · antiguo" else ""; else -> "cargado" },
                                color = if (color == LevelGreen) Gray400 else color, fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }

        Section("Acerca de") {
            Text("Andén · versión ${BuildConfig.VERSION_NAME}", color = AndenWhite, fontSize = 14.sp)
            Spacer(Modifier.height(8.dp))
            Text(
                "Datos de trenes: Renfe y Consorci de Transports de Mallorca (licencia CC BY 4.0). En Mallorca no hay tiempo real: las posiciones se estiman según el horario. La gravedad de los avisos se estima a partir de su texto. " +
                    "Los datos son orientativos: para decisiones de viaje consulta los canales oficiales del operador.",
                color = Gray400, fontSize = 12.sp, lineHeight = 17.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Mapa: © OpenStreetMap contributors, OpenMapTiles y OpenFreeMap. Comunidades autónomas: Natural Earth.",
                color = Gray400, fontSize = 12.sp, lineHeight = 17.sp,
            )
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Text(title.uppercase(), color = Gray400, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
    Spacer(Modifier.height(8.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Gray800).padding(14.dp)) { content() }
    Spacer(Modifier.height(18.dp))
}

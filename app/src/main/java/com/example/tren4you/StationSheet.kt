package com.example.tren4you

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessible
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Elevator
import androidx.compose.material.icons.filled.Escalator
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.NotAccessible
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
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
import com.example.tren4you.ui.theme.LevelRed

/** Icono de un aviso de estación: accesibilidad por elemento; el resto por categoría. */
fun alertIcon(a: StationAlert): ImageVector = alertIcon(a.category, a.element, a.stationInaccessible)

fun alertIcon(category: AlertCategory, element: AccessElement?, stationInaccessible: Boolean): ImageVector = when (category) {
    AlertCategory.Accessibility -> when {
        element == AccessElement.Elevator -> Icons.Filled.Elevator
        element == AccessElement.Escalator -> Icons.Filled.Escalator
        stationInaccessible || element == AccessElement.Station -> Icons.Filled.NotAccessible
        else -> Icons.Filled.Accessible
    }
    AlertCategory.Strike -> Icons.Filled.Campaign
    AlertCategory.Works -> Icons.Filled.Construction
    AlertCategory.Bus -> Icons.Filled.DirectionsBus
    AlertCategory.Disruption -> Icons.Filled.Warning
    AlertCategory.Other -> Icons.Filled.Info
}

@Composable
fun StationSheet(
    board: StationBoard?,
    stationName: String,
    station: Station? = null,
    arrivals: Boolean,
    nowSec: Long,
    error: String?,
    onToggle: (Boolean) -> Unit,
    onClose: () -> Unit,
) {
    Surface(shape = RoundedCornerShape(20.dp), color = Gray800, border = BorderStroke(1.dp, Gray600)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 460.dp).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (station != null && station.metro) { MetroGlyph(station, 24.dp); Spacer(Modifier.width(8.dp)) }
                Text(stationName, color = AndenWhite, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.Close, "Cerrar", tint = Gray400,
                    modifier = Modifier.clip(CircleShape).clickable(onClick = onClose).padding(4.dp).size(22.dp))
            }

            if (board != null && board.accessibility.any) AccessibilityStrip(board.accessibility)

            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Tab("Salidas", !arrivals) { onToggle(false) }
                Tab("Llegadas", arrivals) { onToggle(true) }
            }
            Spacer(Modifier.height(8.dp))

            when {
                board == null && error != null -> Note("No se pudo cargar la estación ($error)", LevelRed)
                board == null -> Note("Cargando…", Gray400)
                else -> {
                    // Los tableros son una instantánea de hace unos minutos: se ocultan los trenes que ya han pasado.
                    val rows = (if (arrivals) board.arrivals else board.departures).filter { it.expectedEpoch == 0L || it.expectedEpoch >= nowSec - 90 }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (board.alerts.isNotEmpty()) {
                            // Claves con el índice: un id repetido en la lista cerraría la app.
                            itemsIndexed(board.alerts, key = { i, a -> "${a.id}#$i" }) { _, a -> AlertRow(a) }
                            item { Spacer(Modifier.height(6.dp)) }
                        }
                        if (!board.scheduleReady) item { Note("Cargando horarios, la lista puede estar incompleta…", Gray400) }
                        if (rows.isEmpty() && board.scheduleReady) item { Note("Sin trenes en las próximas horas", Gray400) }
                        itemsIndexed(rows, key = { i, r -> "${r.tripId}#$i" }) { _, r -> RowItem(r, arrivals) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Note(text: String, color: Color) =
    Text(text, color = color, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp))

@Composable
private fun Tab(label: String, on: Boolean, onClick: () -> Unit) {
    Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (on) Gray950 else AndenWhite,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) AndenYellow else Gray900)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 6.dp))
}

/** Resumen de accesibilidad con iconos y contadores. */
@Composable
private fun AccessibilityStrip(a: AccessibilitySummary) {
    Row(
        Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Gray900).padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        if (a.stationInaccessible) Chip(Icons.Filled.NotAccessible, "Estación inaccesible", LevelRed)
        if (a.elevatorsOut > 0) Chip(Icons.Filled.Elevator, "${a.elevatorsOut} ascensor${if (a.elevatorsOut > 1) "es" else ""} fuera de servicio", AndenYellow)
        if (a.escalatorsOut > 0) Chip(Icons.Filled.Escalator, "${a.escalatorsOut} escalera${if (a.escalatorsOut > 1) "s" else ""}", AndenYellow)
        if (a.otherOut > 0 && !a.stationInaccessible) Chip(Icons.Filled.Accessible, "Acceso limitado", AndenYellow)
    }
}

@Composable
private fun Chip(icon: ImageVector, text: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(5.dp))
        Text(text, color = AndenWhite, fontSize = 12.sp)
    }
}

@Composable
private fun AlertRow(a: StationAlert) {
    val tint = when {
        a.category == AlertCategory.Accessibility && a.stationInaccessible -> LevelRed
        a.category == AlertCategory.Accessibility -> AndenYellow
        else -> Gray400
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
        Icon(alertIcon(a), null, tint = tint, modifier = Modifier.size(20.dp).padding(top = 1.dp))
        Spacer(Modifier.width(10.dp))
        Text(a.text.replace(Regex("\\s+"), " "), color = AndenWhite, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

@Composable
private fun RowItem(r: BoardRow, arrivals: Boolean) {
    val late = r.status == BoardStatus.Delayed && r.scheduledTime != r.expectedTime
    val gone = r.status == BoardStatus.Cancelled
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (r.status == BoardStatus.Scheduled) Gray600 else r.level.color()))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.width(56.dp)) {
            Text(
                if (gone) r.scheduledTime else r.expectedTime,
                color = if (gone) Gray400 else AndenWhite, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                textDecoration = if (gone) TextDecoration.LineThrough else null,
            )
            if (late) Text(r.scheduledTime, color = Gray400, fontSize = 11.sp, textDecoration = TextDecoration.LineThrough)
        }
        r.line?.let {
            Text(it, color = Gray950, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(AndenYellow).padding(horizontal = 6.dp, vertical = 2.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(
            (if (arrivals) "de " else "") + (r.otherEnd ?: "—"),
            color = AndenWhite, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        when (r.status) {
            BoardStatus.Cancelled -> Icon(Icons.Filled.Block, "Cancelado", tint = LevelRed, modifier = Modifier.size(18.dp))
            BoardStatus.Skipped -> Text("Sin parada", color = LevelRed, fontSize = 11.sp)
            BoardStatus.Delayed -> Text("+${r.delayMin} min", color = r.level.color(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            BoardStatus.OnTime -> Text("A tiempo", color = r.level.color(), fontSize = 11.sp)
            BoardStatus.Scheduled -> Text("Horario", color = Gray400, fontSize = 11.sp)
        }
    }
}

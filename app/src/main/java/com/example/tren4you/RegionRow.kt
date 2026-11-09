package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray950

/**
 * Selector de comunidad autónoma: una fila desplazable de chips, con "España" al principio.
 * Elegir la comunidad activa de nuevo (o "España") vuelve a toda España.
 */
@Composable
fun RegionRow(regions: List<Region>, selected: Region?, onPick: (Region?) -> Unit) {
    if (regions.isEmpty()) return
    val state = rememberLazyListState()
    // Lleva la comunidad elegida (p. ej. al tocarla en el mapa) a la vista.
    LaunchedEffect(selected?.id, regions) {
        val i = selected?.let { s -> regions.indexOfFirst { it.id == s.id } } ?: -1
        state.animateScrollToItem(if (i >= 0) i + 1 else 0)
    }
    LazyRow(state = state, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        item(key = "all") { Chip("España", selected == null) { onPick(null) } }
        items(regions, key = { it.id }) { r ->
            val on = selected?.id == r.id
            Chip(r.name, on) { onPick(if (on) null else r) }
        }
    }
}

@Composable
private fun Chip(label: String, on: Boolean, onClick: () -> Unit) {
    Text(
        label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        color = if (on) Gray950 else AndenWhite,
        modifier = Modifier.clip(RoundedCornerShape(50))
            .background(if (on) AndenYellow else Gray800.copy(alpha = 0.95f))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

package com.example.tren4you

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900

/** Desplegable de comunidad autónoma ("Toda España" + las 19). Comparte el filtro con el resto de la app. */
@Composable
fun RegionDropdown(regions: List<Region>, selected: Region?, onPick: (Region?) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            Modifier.clip(RoundedCornerShape(10.dp)).background(Gray900).clickable(enabled = regions.isNotEmpty()) { open = true }
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Place, null, tint = AndenYellow, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                selected?.name ?: "Toda España", color = AndenWhite, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            )
            Icon(Icons.Filled.ArrowDropDown, "Elegir comunidad", tint = Gray400)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Gray800) {
            @Composable
            fun item(label: String, on: Boolean, pick: () -> Unit) = DropdownMenuItem(
                text = { Text(label, color = if (on) AndenYellow else AndenWhite, fontSize = 14.sp) },
                trailingIcon = { if (on) Icon(Icons.Filled.Check, null, tint = AndenYellow, modifier = Modifier.size(18.dp)) },
                onClick = { open = false; pick() },
            )
            item("Toda España", selected == null) { onPick(null) }
            for (r in regions) item(r.name, selected?.id == r.id) { onPick(r) }
        }
    }
}

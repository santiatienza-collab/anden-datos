package com.example.tren4you

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subway
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Símbolo del metro de Barcelona: rombo rojo con una «M» blanca (dibujo propio, no el fichero oficial de TMB). */
@Composable
fun TmbMetroIcon(size: Dp = 18.dp) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val w = this.size.width
            val p = Path().apply {
                moveTo(w / 2, 0f); lineTo(w, w / 2); lineTo(w / 2, w); lineTo(0f, w / 2); close()
            }
            drawPath(p, Color(0xFFDA291C))
        }
        Text(
            "M", color = Color.White, fontWeight = FontWeight.ExtraBold,
            // Sin relleno extra de la fuente y centrada en la línea: queda en el centro geométrico del rombo.
            style = TextStyle(
                fontSize = (size.value * 0.52f).sp, lineHeight = (size.value * 0.52f).sp,
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
            ),
        )
    }
}

/** Icono de metro de una estación: el de TMB en Barcelona, el genérico en otros metros; nada si no es de metro. */
@Composable
fun MetroGlyph(station: Station, size: Dp = 18.dp) {
    if (station.id.startsWith("tmb-")) TmbMetroIcon(size)
    else if (station.metro) Icon(Icons.Filled.Subway, "Metro", tint = com.example.tren4you.ui.theme.AndenYellow, modifier = Modifier.size(size))
}

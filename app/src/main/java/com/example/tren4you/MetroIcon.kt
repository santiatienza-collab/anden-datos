package com.example.tren4you

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
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
        Text("M", color = Color.White, fontSize = (size.value * 0.5f).sp, fontWeight = FontWeight.ExtraBold)
    }
}

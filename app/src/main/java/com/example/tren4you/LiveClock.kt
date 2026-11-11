package com.example.tren4you

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.tren4you.ui.theme.AndenYellow

/** Reloj pequeño en amarillo cuya aguja gira despacio: da sensación de información "en vivo". */
@Composable
fun LiveClock(size: Dp = 13.dp, color: Color = AndenYellow) {
    val t = rememberInfiniteTransition(label = "reloj")
    val angle by t.animateFloat(0f, 360f, infiniteRepeatable(tween(8_000, easing = LinearEasing), RepeatMode.Restart), label = "aguja")
    Canvas(Modifier.size(size)) {
        val w = 1.4.dp.toPx()
        val c = Offset(this.size.width / 2, this.size.height / 2)
        val r = this.size.width / 2 - w / 2
        drawCircle(color, radius = r, center = c, style = Stroke(width = w))
        // Aguja corta fija (hacia las 3) y aguja larga que gira
        drawLine(color, c, Offset(c.x + r * 0.45f, c.y), strokeWidth = w, cap = StrokeCap.Round)
        rotate(degrees = angle, pivot = c) {
            drawLine(color, c, Offset(c.x, c.y - r * 0.72f), strokeWidth = w, cap = StrokeCap.Round)
        }
    }
}

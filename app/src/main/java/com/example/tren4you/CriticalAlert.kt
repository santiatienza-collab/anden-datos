package com.example.tren4you

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelRed

/** Valor que oscila entre [lo] y [hi] sin parar: base del parpadeo de neón. */
@Composable
fun pulse(lo: Float = 0.25f, hi: Float = 1f, millis: Int = 650): Float {
    val t = rememberInfiniteTransition(label = "neon")
    val v by t.animateFloat(lo, hi, infiniteRepeatable(tween(millis, easing = LinearEasing), RepeatMode.Reverse), label = "neon")
    return v
}

/** Halo rojo de neón que parpadea detrás del elemento (el icono de la pestaña Seguridad). */
@Composable
fun Modifier.neonGlow(): Modifier {
    val a = pulse()
    return drawBehind {
        val r = size.maxDimension * 1.15f
        drawCircle(Brush.radialGradient(listOf(LevelRed.copy(alpha = a), LevelRed.copy(alpha = a * 0.35f), Color.Transparent), radius = r))
    }
}

/**
 * Bocadillo llamativo con borde de neón: aparece en cualquier pestaña mientras haya una alerta crítica sin revisar.
 * Al tocarlo se abre Seguridad; la X lo descarta (la alerta sigue en la pestaña).
 */
@Composable
fun CriticalBanner(signal: SafetySignal, count: Int, onOpen: () -> Unit, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val a = pulse(0.35f, 1f, 600)
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier.fillMaxWidth()
            // Resplandor exterior
            .drawBehind {
                drawRoundRect(LevelRed.copy(alpha = a * 0.5f), cornerRadius = CornerRadius(16.dp.toPx()), style = Stroke(width = 9.dp.toPx()))
            }
            .clip(shape).background(Gray950)
            .border(BorderStroke(2.dp, LevelRed.copy(alpha = a)), shape)
            .clickable(onClick = onOpen)
            .padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Warning, null, tint = LevelRed.copy(alpha = a), modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                if (count > 1) "ALERTA CRÍTICA · $count activas" else "ALERTA CRÍTICA",
                color = LevelRed, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp,
            )
            Text(signal.title, color = AndenWhite, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(signal.detail, color = Gray400, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(if (count > 1) "Toca para verlas en el mapa" else if (signal.hasPlace) "Toca para ver el tramo en el mapa" else "Toca para ver en Seguridad", color = LevelRed, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 3.dp))
        }
        Icon(
            Icons.Filled.Close, "Descartar", tint = Gray400,
            modifier = Modifier.clip(RoundedCornerShape(20.dp)).clickable(onClick = onDismiss).padding(8.dp).size(22.dp),
        )
    }
}

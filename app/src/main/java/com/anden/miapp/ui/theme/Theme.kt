package com.anden.miapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val AndenColors = darkColorScheme(
    primary = AndenYellow,
    onPrimary = Gray950,
    secondary = AndenYellow,
    background = Gray900,
    onBackground = AndenWhite,
    surface = Gray800,
    onSurface = AndenWhite,
    surfaceVariant = Gray800,
    onSurfaceVariant = Gray400,
    outline = Gray600,
)

/** Tema único oscuro: la identidad de Andén no cambia con el tema del sistema. */
@Composable
fun Tren4youTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AndenColors, typography = Typography, content = content)
}

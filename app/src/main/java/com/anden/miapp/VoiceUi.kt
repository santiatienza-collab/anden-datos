package com.anden.miapp

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anden.miapp.ui.theme.AndenWhite
import com.anden.miapp.ui.theme.AndenYellow
import com.anden.miapp.ui.theme.Gray400
import com.anden.miapp.ui.theme.Gray800
import com.anden.miapp.ui.theme.Gray950

/** Botón grande de micrófono para pedir una estación por voz (visible solo con el control por voz activado). */
@Composable
fun MicButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.size(56.dp).clip(CircleShape).background(AndenYellow).clickable(onClick = onClick)
            .semantics { contentDescription = "Pedir una estación por voz. Pulsa y di el nombre de la estación."; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Filled.Mic, null, tint = Gray950, modifier = Modifier.size(30.dp)) }
}

private val TUTORIAL_STEPS = listOf(
    "Andén te lee en voz alta las incidencias de una estación: ascensores y escaleras averiados, retrasos, obras y mantenimiento, huelgas y autobuses sustitutorios.",
    "Para activarlo, ve a Ajustes, sección Accesibilidad por voz, y enciende Control por voz e Información por audio. También puedes pulsar Activar ahora.",
    "Con el control por voz activado aparece un botón grande de micrófono en el lado derecho de la pantalla. Púlsalo y di el nombre de la estación, por ejemplo: Atocha, o Sants.",
    "La aplicación abre la estación y te lee la información. En la ficha de la estación, el botón Escuchar la repite.",
    "Puedes volver a ver este tutorial cuando quieras desde Ajustes.",
)

/** Tutorial breve de la accesibilidad por voz: se muestra al empezar y se puede leer en voz alta. */
@Composable
fun VoiceTutorialDialog(onClose: (enable: Boolean) -> Unit) {
    val context = LocalContext.current
    val full = "Tutorial de accesibilidad por voz. " + TUTORIAL_STEPS.joinToString(" ")
    AlertDialog(
        onDismissRequest = { Speaker.stop(); onClose(false) },
        containerColor = Gray800,
        title = { Text("Voz para personas invidentes", color = AndenYellow, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                TUTORIAL_STEPS.forEachIndexed { i, t ->
                    Text("${i + 1}. $t", color = AndenWhite, fontSize = 15.sp, lineHeight = 21.sp)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "Escuchar este tutorial", color = AndenYellow, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Gray950)
                        .clickable { Speaker.speak(context, full) }.padding(14.dp),
                )
                Text("El reconocimiento de voz lo hace el servicio de voz de tu móvil (Google); Andén no graba ni guarda tu voz.", color = Gray400, fontSize = 12.sp, lineHeight = 17.sp)
            }
        },
        confirmButton = {
            Text(
                "Activar ahora", color = Gray950, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(AndenYellow)
                    .clickable { Speaker.stop(); onClose(true) }.padding(horizontal = 18.dp, vertical = 12.dp),
            )
        },
        dismissButton = {
            Text(
                "Ahora no", color = AndenWhite, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable { Speaker.stop(); onClose(false) }.padding(horizontal = 18.dp, vertical = 12.dp),
            )
        },
    )
}

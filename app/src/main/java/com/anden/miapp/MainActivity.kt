package com.anden.miapp

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.anden.miapp.ui.theme.Tren4youTheme

class MainActivity : ComponentActivity() {
    /** Sección que debe abrirse al llegar desde una notificación (p. ej. "Safety"). */
    private var startSection by mutableStateOf<String?>(null)

    /** Alerta concreta a mostrar en el mapa al llegar desde una notificación. */
    private var startSignal by mutableStateOf<String?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Reconocimiento de voz del sistema: devuelve hasta 5 transcripciones de lo que ha dicho el usuario. */
    private val speech = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == RESULT_OK) {
            val list = r.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)
            if (!list.isNullOrEmpty()) VoiceControl.deliver(list)
        }
    }

    /** Pide el permiso de notificaciones (Android 13+) si falta. */
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !SafetyNotifier.hasPermission(this)) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private lateinit var interstitial: InterstitialManager

    /** Pausa natural de la navegación (cambio de pestaña): si ya hay 20 min de uso, puede salir el intersticial. */
    fun onNaturalBreak() = interstitial.maybeShow()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = SystemBarStyle.dark(Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = dark, navigationBarStyle = dark)
        startSection = intent?.getStringExtra(SafetyNotifier.EXTRA_SECTION)
        startSignal = intent?.getStringExtra(SafetyNotifier.EXTRA_SIGNAL)
        VoiceControl.launcher = {
            try { speech.launch(VoiceControl.intent()) }
            catch (e: android.content.ActivityNotFoundException) {
                android.widget.Toast.makeText(this, "Este móvil no tiene un servicio de reconocimiento de voz disponible. Necesita la app de Google con la búsqueda por voz activada.", android.widget.Toast.LENGTH_LONG).show()
            }
        }
        SafetyNotifier.ensureChannel(this)
        SafetyNotifier.schedule(this)
        SafetyNotifier.syncTopic(this) // push (FCM): suscripción al tema de alertas críticas
        if (SafetyNotifier.enabled(this) && !getSharedPreferences("anden", MODE_PRIVATE).getBoolean("asked_notif", false)) {
            getSharedPreferences("anden", MODE_PRIVATE).edit().putBoolean("asked_notif", true).apply()
            requestNotificationPermission()
        }
        interstitial = InterstitialManager(this)
        // Consentimiento de anuncios (UMP): los anuncios solo se piden cuando está permitido
        Consent.start(this) { interstitial.load() }
        setContent { Tren4youTheme { MainScreen(startSection, startSignal) { startSection = null; startSignal = null } } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        startSection = intent.getStringExtra(SafetyNotifier.EXTRA_SECTION)
        startSignal = intent.getStringExtra(SafetyNotifier.EXTRA_SIGNAL)
    }

    override fun onDestroy() {
        super.onDestroy()
        VoiceControl.launcher = null
        Speaker.stop()
    }

    override fun onStart() {
        super.onStart()
        interstitial.onForeground()
    }

    override fun onStop() {
        super.onStop()
        interstitial.onBackground()
    }
}

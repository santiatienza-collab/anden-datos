package com.example.tren4you

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
import com.example.tren4you.ui.theme.Tren4youTheme

class MainActivity : ComponentActivity() {
    /** Sección que debe abrirse al llegar desde una notificación (p. ej. "Safety"). */
    private var startSection by mutableStateOf<String?>(null)

    /** Alerta concreta a mostrar en el mapa al llegar desde una notificación. */
    private var startSignal by mutableStateOf<String?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Pide el permiso de notificaciones (Android 13+) si falta. */
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !SafetyNotifier.hasPermission(this)) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private lateinit var appOpen: AppOpenAdManager
    private var wasInBackground = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = SystemBarStyle.dark(Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = dark, navigationBarStyle = dark)
        initAds(this)
        startSection = intent?.getStringExtra(SafetyNotifier.EXTRA_SECTION)
        startSignal = intent?.getStringExtra(SafetyNotifier.EXTRA_SIGNAL)
        SafetyNotifier.ensureChannel(this)
        SafetyNotifier.schedule(this)
        SafetyNotifier.syncTopic(this) // push (FCM): suscripción al tema de alertas críticas
        if (SafetyNotifier.enabled(this) && !getSharedPreferences("anden", MODE_PRIVATE).getBoolean("asked_notif", false)) {
            getSharedPreferences("anden", MODE_PRIVATE).edit().putBoolean("asked_notif", true).apply()
            requestNotificationPermission()
        }
        appOpen = AppOpenAdManager(this).also { it.load() }
        setContent { Tren4youTheme { MainScreen(startSection, startSignal) { startSection = null; startSignal = null } } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        startSection = intent.getStringExtra(SafetyNotifier.EXTRA_SECTION)
        startSignal = intent.getStringExtra(SafetyNotifier.EXTRA_SIGNAL)
    }

    override fun onStop() {
        super.onStop()
        wasInBackground = true
        appOpen.load() // deja uno listo para cuando el usuario vuelva
    }

    // Al volver a la app desde segundo plano: anuncio de carga, una sola vez por ejecución.
    // Se hace en onResume, no en onStart: Google rechaza mostrarlo hasta que la app está realmente en primer plano.
    override fun onResume() {
        super.onResume()
        if (wasInBackground) {
            wasInBackground = false
            // Un instante después: el SDK solo lo permite cuando la actividad ya está en primer plano.
            window.decorView.postDelayed({ if (lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) appOpen.showIfReady() }, 500)
        }
    }
}

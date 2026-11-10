package com.example.tren4you

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.tren4you.ui.theme.Tren4youTheme

class MainActivity : ComponentActivity() {
    private lateinit var appOpen: AppOpenAdManager
    private var wasInBackground = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = SystemBarStyle.dark(Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = dark, navigationBarStyle = dark)
        initAds(this)
        appOpen = AppOpenAdManager(this).also { it.load() }
        setContent { Tren4youTheme { MainScreen() } }
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

package com.anden.miapp

import android.app.Activity
import android.util.Log
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Consentimiento de anuncios con la Plataforma de mensajes de usuario (UMP) de Google, el sistema certificado que Google exige
 * en el Espacio Económico Europeo, Reino Unido y Suiza. Los anuncios NO se inicializan ni se piden hasta que el consentimiento
 * lo permite (canRequestAds). El formulario (texto y botones) se configura en AdMob → Privacidad y mensajes.
 */
object Consent {
    private const val TAG = "AndenConsent"
    private val adsStarted = AtomicBoolean(false)

    /**
     * Pide la información de consentimiento, muestra el formulario si hace falta y, cuando se pueden pedir anuncios,
     * inicializa AdMob (una sola vez) y avisa con [onAdsReady]. Si ya se había aceptado en una sesión anterior, no espera a la red.
     */
    fun start(activity: Activity, onAdsReady: () -> Unit) {
        val info = UserMessagingPlatform.getConsentInformation(activity)
        fun startAds() {
            if (!info.canRequestAds() || !adsStarted.compareAndSet(false, true)) return
            MobileAds.initialize(activity.applicationContext) {}
            Ads.ready = true
            onAdsReady()
        }
        // Consentimiento ya obtenido en una sesión anterior: los anuncios pueden empezar ya
        startAds()
        info.requestConsentInfoUpdate(
            activity, ConsentRequestParameters.Builder().build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { error ->
                    if (error != null) Log.w(TAG, "formulario: ${error.errorCode} ${error.message}")
                    startAds()
                }
            },
            { error -> Log.w(TAG, "información de consentimiento: ${error.errorCode} ${error.message}"); startAds() },
        )
    }

    /** true si el usuario tiene que poder cambiar su decisión (obligatorio en el EEE): se muestra el botón en Ajustes. */
    fun privacyOptionsRequired(activity: Activity): Boolean =
        UserMessagingPlatform.getConsentInformation(activity).privacyOptionsRequirementStatus ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

    fun showPrivacyOptions(activity: Activity) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { error ->
            if (error != null) Log.w(TAG, "opciones de privacidad: ${error.errorCode} ${error.message}")
        }
    }
}

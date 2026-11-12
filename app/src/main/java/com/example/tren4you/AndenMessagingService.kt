package com.example.tren4you

import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Recibe las notificaciones push (FCM) de alertas críticas. Son mensajes de datos: llegan aunque la app esté cerrada
 * (salvo si el usuario ha forzado su detención) y la notificación la construye la app con su canal y su acción.
 * Comparten el registro anti-repeticiones con la comprobación periódica y la de la app abierta, así que una misma
 * alerta no se notifica dos veces aunque llegue por varias vías.
 */
class AndenMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val id = d["id"] ?: return
        SafetyNotifier.notifyCritical(
            applicationContext,
            listOf(
                SafetySignal(
                    id = id, kind = d["kind"].orEmpty(), level = d["level"] ?: "critical",
                    title = d["title"] ?: "Alerta crítica", detail = d["detail"].orEmpty(),
                    lat = d["lat"]?.toDoubleOrNull(), lon = d["lon"]?.toDoubleOrNull(), tripIds = emptyList(),
                ),
            ),
        )
    }

    // El token no se guarda: se envía a un tema, no a dispositivos concretos.
    override fun onNewToken(token: String) = SafetyNotifier.syncTopic(applicationContext)

    companion object {
        const val TOPIC = "critical_alerts"

        /** Suscribe o desuscribe la app del tema de alertas críticas. */
        fun setSubscribed(on: Boolean) {
            val fm = runCatching { FirebaseMessaging.getInstance() }.getOrNull() ?: return
            if (on) fm.subscribeToTopic(TOPIC) else fm.unsubscribeFromTopic(TOPIC)
        }
    }
}

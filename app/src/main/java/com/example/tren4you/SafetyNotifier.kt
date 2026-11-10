package com.example.tren4you

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Notificaciones de las señales CRÍTICAS de seguridad. Dos vías:
 *  - con la app abierta, se comprueban cada 30 s junto con el resto de datos;
 *  - con la app cerrada, una tarea periódica de Android (mínimo cada 15 min) las consulta en segundo plano.
 * No es un push en tiempo real: llega con el retraso de la actualización de datos más el de la tarea periódica.
 */
object SafetyNotifier {
    const val CHANNEL = "seguridad_critica"
    const val EXTRA_SECTION = "section"
    private const val PREFS = "anden"
    private const val KEY_ENABLED = "notify_critical"
    private const val KEY_SEEN = "notified_signals"

    /** No se repite la notificación de la misma señal antes de esto. */
    private const val REPEAT_MS = 6 * 3_600_000L

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun enabled(c: Context) = prefs(c).getBoolean(KEY_ENABLED, true)
    fun setEnabled(c: Context, on: Boolean) = prefs(c).edit().putBoolean(KEY_ENABLED, on).apply()

    fun hasPermission(c: Context) =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val ch = NotificationChannel(CHANNEL, "Seguridad: alertas críticas", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Avisos de accidente, fallo de señalización o riesgo de alcance entre trenes (datos abiertos, orientativos)."
        }
        c.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    /** Notifica las señales críticas que no se hayan notificado ya en las últimas horas. */
    fun notifyCritical(c: Context, signals: List<SafetySignal>) {
        if (!enabled(c) || !hasPermission(c)) return
        val critical = signals.filter { it.level == "critical" }
        if (critical.isEmpty()) return
        ensureChannel(c)
        val now = System.currentTimeMillis()
        val seen = prefs(c).getStringSet(KEY_SEEN, emptySet()).orEmpty()
            .mapNotNull { e -> e.substringAfterLast('|').toLongOrNull()?.let { t -> e.substringBeforeLast('|') to t } }
            .filter { now - it.second < REPEAT_MS }.toMap().toMutableMap()
        for (s in critical) {
            if (seen.containsKey(s.id)) continue
            seen[s.id] = now
            val open = PendingIntent.getActivity(
                c, s.id.hashCode(),
                Intent(c, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(EXTRA_SECTION, "Safety"),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_safety)
                .setContentTitle("⚠ ${s.title}")
                .setContentText(s.detail)
                .setStyle(NotificationCompat.BigTextStyle().bigText(s.detail + "\n\nDatos abiertos, orientativos: sigue siempre las indicaciones del operador."))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(open)
                .build()
            runCatching { NotificationManagerCompat.from(c).notify(s.id.hashCode(), n) }.onFailure { android.util.Log.w("AndenNotif", "no se pudo notificar: ${it.message}") }
        }
        prefs(c).edit().putStringSet(KEY_SEEN, seen.map { "${it.key}|${it.value}" }.toSet()).apply()
    }

    /** Programa (o mantiene) la comprobación periódica en segundo plano. */
    fun schedule(c: Context) {
        val req = PeriodicWorkRequestBuilder<SafetyWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("safety-check", ExistingPeriodicWorkPolicy.KEEP, req)
    }
}

class SafetyWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {
    override suspend fun doWork(): Result {
        if (!SafetyNotifier.enabled(applicationContext)) return Result.success()
        return runCatching { TrainsApi.safety() }
            .map { SafetyNotifier.notifyCritical(applicationContext, it.signals); Result.success() }
            .getOrElse { Result.retry() }
    }
}

package com.anden.miapp

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.widget.Toast
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.text.Normalizer
import java.util.Locale
import kotlin.math.max

/** Preferencias de accesibilidad por voz (se guardan en el móvil; por defecto, desactivadas). */
object VoicePrefs {
    private const val FILE = "anden"
    private fun p(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    fun voiceControl(c: Context) = p(c).getBoolean("voice_control", false)
    fun setVoiceControl(c: Context, on: Boolean) = p(c).edit().putBoolean("voice_control", on).apply()
    fun audioInfo(c: Context) = p(c).getBoolean("audio_info", false)
    fun setAudioInfo(c: Context, on: Boolean) = p(c).edit().putBoolean("audio_info", on).apply()
    fun tutorialSeen(c: Context) = p(c).getBoolean("voice_tutorial_seen", false)
    fun setTutorialSeen(c: Context) = p(c).edit().putBoolean("voice_tutorial_seen", true).apply()
}

/**
 * Puente entre la actividad (que lanza el reconocimiento de voz del sistema) y la pantalla principal.
 * Se usa el reconocedor del propio Android (RecognizerIntent): la app no accede al micrófono ni pide permiso de audio.
 */
object VoiceControl {
    /** La actividad rellena esto con la función que abre el reconocimiento de voz. */
    var launcher: (() -> Unit)? = null
    private val _results = MutableSharedFlow<List<String>>(extraBufferCapacity = 4)
    val results = _results.asSharedFlow()

    fun deliver(phrases: List<String>) { _results.tryEmit(phrases) }

    fun intent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES")
        putExtra(RecognizerIntent.EXTRA_PROMPT, "Di el nombre de la estación")
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
    }
}

/** Lectura en voz alta (síntesis de voz del sistema, en español). */
object Speaker {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var failed = false
    private val queue = ArrayDeque<Triple<String, String, (() -> Unit)?>>()
    private val callbacks = HashMap<String, () -> Unit>()
    private val main = Handler(Looper.getMainLooper())
    private var counter = 0

    private fun ensure(context: Context) {
        if (tts != null || failed) return
        val app = context.applicationContext
        tts = TextToSpeech(app) { status ->
            val engine = tts
            if (status != TextToSpeech.SUCCESS || engine == null) { failed = true; queue.clear(); return@TextToSpeech }
            val r = engine.setLanguage(Locale("es", "ES"))
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                main.post { Toast.makeText(app, "Tu móvil no tiene voz en español: instálala en Ajustes → Idioma → Síntesis de voz", Toast.LENGTH_LONG).show() }
            }
            engine.setSpeechRate(0.95f)
            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) { finish(utteranceId) }
                @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) { finish(utteranceId) }
            })
            ready = true
            while (queue.isNotEmpty()) { val (id, t, cb) = queue.removeFirst(); play(id, t, cb) }
        }
    }

    private fun finish(id: String?) {
        val cb = synchronized(callbacks) { callbacks.remove(id) } ?: return
        main.post { cb() }
    }

    private fun play(id: String, text: String, onDone: (() -> Unit)?, flush: Boolean = false) {
        if (onDone != null) synchronized(callbacks) { callbacks[id] = onDone }
        tts?.speak(text, if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, id)
    }

    /** Lee [text] (sustituyendo lo que se estuviera leyendo). [onDone] se llama al terminar, también si falla la voz. */
    fun speak(context: Context, text: String, onDone: (() -> Unit)? = null) {
        ensure(context)
        if (failed) { onDone?.invoke(); return }
        stop()
        // Los textos largos se trocean por frases: el motor limita la longitud de cada lectura.
        val chunks = splitForSpeech(text)
        chunks.forEachIndexed { i, chunk ->
            val id = "anden-${counter++}"
            val last = i == chunks.lastIndex
            if (!ready) queue.addLast(Triple(id, chunk, if (last) onDone else null))
            else play(id, chunk, if (last) onDone else null)
        }
    }

    fun stop() {
        queue.clear()
        synchronized(callbacks) { callbacks.clear() }
        tts?.stop()
    }

    private fun splitForSpeech(text: String): List<String> {
        val limit = 3000
        if (text.length <= limit) return listOf(text)
        val out = ArrayList<String>()
        var cur = StringBuilder()
        for (s in text.split(Regex("(?<=[.!?])\\s+"))) {
            if (cur.length + s.length + 1 > limit && cur.isNotEmpty()) { out.add(cur.toString()); cur = StringBuilder() }
            cur.append(s).append(' ')
        }
        if (cur.isNotBlank()) out.add(cur.toString().trim())
        return out
    }
}

// ───────────────────────── Reconocer qué estación se ha pedido ─────────────────────────

private fun vnorm(s: String): String =
    Normalizer.normalize(s.lowercase(Locale("es")), Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").replace(Regex("[^a-z0-9 ]"), " ").replace(Regex("\\s+"), " ").trim()

/** Palabras que se dicen al pedir una estación y no forman parte de su nombre. */
private val FILLER = setOf(
    "estacion", "estaciones", "de", "la", "el", "los", "las", "del", "en", "a", "al", "quiero", "ir", "abre", "abrir", "abreme", "dime",
    "pon", "ponme", "muestrame", "mostrar", "informacion", "sobre", "info", "parada", "cercanias", "tren", "trenes", "por", "favor", "que", "como", "esta",
)

private fun levenshtein(a: String, b: String): Int {
    if (a == b) return 0
    var prev = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        val cur = IntArray(b.length + 1); cur[0] = i
        for (j in 1..b.length) cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
        prev = cur
    }
    return prev[b.length]
}

/**
 * Estación que mejor encaja con lo que ha entendido el reconocedor (hasta 5 alternativas). Tolera artículos, "estación de…",
 * nombres parciales ("Atocha" → "Madrid-Atocha Cercanías") y pequeños errores de reconocimiento. null si no hay un candidato fiable.
 */
fun matchStation(phrases: List<String>, stations: List<Station>): Station? {
    if (stations.isEmpty()) return null
    var best: Station? = null
    var bestScore = 0
    // Se normalizan una sola vez los nombres (son ~1.900)
    val prepared = stations.map { s -> val n = vnorm(s.name); Triple(s, n, n.split(' ').filter { it.isNotEmpty() }) }
    phrases.forEachIndexed { idx, phrase ->
        val q = vnorm(phrase)
        val qt = q.split(' ').filter { it.isNotEmpty() && it !in FILLER }
        if (qt.isEmpty()) return@forEachIndexed
        val qj = qt.joinToString(" ")
        val bonus = if (idx == 0) 3 else 0
        for ((s, n, nt) in prepared) {
            val extras = max(0, nt.size - qt.size)
            val score = when {
                n == q || n == qj -> 100
                qt.all { it in nt } -> 80 - extras * 2
                n.contains(qj) -> 62 - extras
                else -> {
                    // Errores pequeños de reconocimiento: cada palabra pedida debe parecerse a alguna del nombre
                    var dist = 0
                    val ok = qt.all { w ->
                        val d = nt.minOfOrNull { levenshtein(w, it) } ?: 99
                        dist += d
                        d <= max(1, w.length / 4)
                    }
                    if (ok) 50 - dist * 3 - extras else 0
                }
            }
            if (score > 0 && score + bonus > bestScore) { bestScore = score + bonus; best = s }
        }
    }
    return best.takeIf { bestScore >= 40 }
}

// ───────────────────────── Lo que se dice al abrir una estación ─────────────────────────

private fun plural(n: Int, one: String, many: String) = if (n == 1) "$n $one" else "$n $many"

private fun spokenText(raw: String, max: Int = 260): String {
    var t = raw.replace(Regex("https?://\\S+"), " ").replace(Regex("#\\w+"), " ").replace("#", " ").replace(Regex("\\s+"), " ").trim()
    if (t.length > max) {
        val cut = t.lastIndexOf('.', max).takeIf { it > 80 } ?: t.lastIndexOf(' ', max).takeIf { it > 0 } ?: max
        t = t.substring(0, cut).trimEnd(',', ';', ' ') + "."
    }
    // Siempre acaba en punto: así la voz hace una pausa antes de la frase siguiente
    return if (t.endsWith(".") || t.endsWith("!") || t.endsWith("?")) t else "$t."
}

private fun categoryLead(c: AlertCategory) = when (c) {
    AlertCategory.Strike -> "Huelga: "
    AlertCategory.Works -> "Obras o mantenimiento: "
    AlertCategory.Bus -> "Servicio de autobuses: "
    AlertCategory.Disruption -> "Incidencia: "
    AlertCategory.Accessibility -> "Accesibilidad: "
    AlertCategory.Other -> "Aviso: "
}

/**
 * Texto que se lee en voz alta al abrir una estación: accesibilidad (ascensores y escaleras), avisos de la estación y de sus
 * líneas (huelgas, obras y mantenimiento, autobuses sustitutorios, incidencias) y estado de las próximas salidas.
 * Frases cortas y sin símbolos, para que se entienda bien al oírlo.
 */
fun spokenSummary(station: Station, board: StationBoard, alerts: List<AlertItem>, nowEpoch: Long): String {
    val parts = ArrayList<String>()
    parts += "Estación de ${station.name}."

    // Accesibilidad
    val acc = board.accessibility
    if (acc.any) {
        val bits = ArrayList<String>()
        if (acc.stationInaccessible) bits += "la estación está inaccesible para personas con movilidad reducida"
        if (acc.elevatorsOut > 0) bits += plural(acc.elevatorsOut, "ascensor fuera de servicio", "ascensores fuera de servicio")
        if (acc.escalatorsOut > 0) bits += plural(acc.escalatorsOut, "escalera mecánica fuera de servicio", "escaleras mecánicas fuera de servicio")
        if (acc.otherOut > 0) bits += plural(acc.otherOut, "otro elemento de accesibilidad averiado", "otros elementos de accesibilidad averiados")
        parts += "Atención, accesibilidad: " + bits.joinToString(", ") + "."
        board.alerts.filter { it.category == AlertCategory.Accessibility }.take(2).forEach { parts += spokenText(it.text, 220) }
    } else {
        parts += "No constan avisos de ascensores o escaleras averiados."
    }

    // Avisos: los de la propia estación y los de sus líneas
    val stationLines = (board.departures + board.arrivals).mapNotNull { it.line }.toSet()
    val stationNorm = vnorm(station.name)
    val seen = HashSet<String>()
    val spoken = ArrayList<Pair<Int, String>>() // prioridad, texto
    fun prio(c: AlertCategory) = when (c) { AlertCategory.Disruption -> 0; AlertCategory.Strike -> 1; AlertCategory.Bus -> 2; AlertCategory.Works -> 3; else -> 4 }
    fun add(c: AlertCategory, text: String) {
        val key = vnorm(text).take(80)
        if (!seen.add(key)) return
        spoken += prio(c) to categoryLead(c) + spokenText(text)
    }
    board.alerts.filter { it.category != AlertCategory.Accessibility }.forEach { add(it.category, it.text) }
    // Los nombres de línea se repiten entre regiones (C2 en Madrid, Valencia, Cataluña…): solo valen los avisos de la región de la estación
    val region = station.region
    alerts.filter { a ->
        a.active && a.category != AlertCategory.Accessibility && (a.severity != "info" || a.category != AlertCategory.Other) &&
            (region == null || a.regions.isEmpty() || region in a.regions) &&
            (a.lines.any { it in stationLines } || a.stationNames.any { vnorm(it).let { n -> n.isNotEmpty() && (n in stationNorm || stationNorm in n) } })
    }.forEach { add(it.category, it.text) }
    val ordered = spoken.sortedBy { it.first }.map { it.second }
    if (ordered.isEmpty()) {
        parts += "No hay otros avisos de huelgas, obras, autobuses o incidencias para esta estación."
    } else {
        parts += plural(ordered.size, "aviso que puede afectar a esta estación.", "avisos que pueden afectar a esta estación.")
        ordered.take(5).forEach { parts += it }
        if (ordered.size > 5) parts += "Hay ${ordered.size - 5} avisos más en la pestaña Avisos."
    }

    // Trenes
    val upcoming = board.departures.filter { it.expectedEpoch == 0L || it.expectedEpoch >= nowEpoch - 120 }.take(10)
    if (upcoming.isEmpty()) {
        parts += if (board.scheduleReady) "No hay salidas publicadas para esta estación ahora mismo." else "Los horarios de esta estación se están cargando."
    } else {
        val first = upcoming.first()
        val dest = first.otherEnd?.let { " con destino $it" } ?: ""
        val line = first.line?.let { "línea $it" } ?: "tren"
        val state = when {
            first.status == BoardStatus.Cancelled -> ", cancelado"
            (first.delayMin ?: 0) >= 5 -> ", con ${plural(first.delayMin ?: 0, "minuto", "minutos")} de retraso"
            else -> ", a su hora"
        }
        parts += "Próxima salida: $line$dest, a las ${first.expectedTime}$state."
        val cancelled = upcoming.count { it.status == BoardStatus.Cancelled }
        val late = upcoming.filter { it.status != BoardStatus.Cancelled && (it.delayMin ?: 0) >= 5 }
        val maxDelay = late.maxOfOrNull { it.delayMin ?: 0 } ?: 0
        parts += when {
            cancelled == 0 && late.isEmpty() -> "Las próximas ${upcoming.size} salidas no tienen retrasos importantes."
            else -> {
                val bits = ArrayList<String>()
                if (cancelled > 0) bits += plural(cancelled, "cancelada", "canceladas")
                if (late.isNotEmpty()) bits += "${plural(late.size, "con retraso", "con retraso")} de 5 minutos o más, el mayor de $maxDelay minutos"
                "De las próximas ${upcoming.size} salidas: " + bits.joinToString(", ") + "."
            }
        }
    }
    parts += "Información orientativa: consulta siempre los avisos del operador."
    return parts.joinToString(" ")
}

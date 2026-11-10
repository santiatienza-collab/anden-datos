package com.example.tren4you

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class HttpStatusException(val code: Int) : Exception("HTTP $code")

/** Trenes con su posición y la hora (segundos epoch) a la que se generó la instantánea de datos. */
data class TrainsData(val trains: List<Train>, val generatedAt: Long)

/**
 * Cliente de la API estática publicada en GitHub Pages (HTTPS). No hay servidor propio: un flujo de
 * GitHub Actions regenera los ficheros JSON cada pocos minutos.
 */
object TrainsApi {
    private val base = BuildConfig.BACKEND_URL.trim().trimEnd('/')

    private suspend fun get(path: String): JSONObject = withContext(Dispatchers.IO) {
        // GitHub Pages guarda los ficheros en caché hasta 10 min; un parámetro distinto cada minuto fuerza a pedir el más reciente.
        val conn = URL("$base$path?v=${System.currentTimeMillis() / 60_000}").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "application/json")
            val code = conn.responseCode
            if (code != 200) throw HttpStatusException(code)
            JSONObject(conn.inputStream.bufferedReader().readText())
        } finally {
            conn.disconnect()
        }
    }

    /** Trenes con posición y color de semáforo. Lanza excepción si falla. */
    suspend fun trains(): TrainsData {
        val o = get("/api/v1/trains.json")
        val arr = o.getJSONArray("trains")
        return TrainsData((0 until arr.length()).mapNotNull { Train.fromJson(arr.getJSONObject(it)) }, o.optLong("generatedAt"))
    }

    /** Todas las estaciones, con marca de avisos activos. */
    suspend fun stations(): List<Station> = parseStations(get("/api/v1/stops.json").getJSONArray("stops"))

    /**
     * Salidas y llegadas de una estación. Solo se publican tableros de estaciones con servicio: si no
     * hay fichero (404) se devuelve un tablero vacío en lugar de un error.
     */
    suspend fun board(station: Station): StationBoard = try {
        parseBoard(get("/api/v1/stations/${station.key}/board.json"))
    } catch (e: HttpStatusException) {
        if (e.code != 404) throw e
        StationBoard(station, true, AccessibilitySummary(false, 0, 0, 0), emptyList(), emptyList(), emptyList())
    }

    suspend fun alerts(): List<AlertItem> = parseAlerts(get("/api/v1/alerts.json").getJSONArray("alerts"))

    /** Estado de las fuentes de datos (de la última instantánea). */
    suspend fun sources(): List<SourceStatus> {
        val o = get("/health.json")
        val src = o.getJSONObject("sources")
        return src.keys().asSequence().map { k ->
            val x = src.getJSONObject(k)
            SourceStatus(k, !x.has("lastError") || x.isNull("lastError"), if (x.isNull("feedAgeSec")) null else x.optLong("feedAgeSec"), x.optString("lastError").ifEmpty { null })
        }.toList().sortedBy { it.id }
    }

    /** Contornos de las comunidades (GeoJSON en bruto) para dibujarlas y tocarlas en el mapa. */
    suspend fun regionsGeo(): String = get("/api/v1/regions/geo.json").toString()

    suspend fun regions(): List<Region> {
        val arr = get("/api/v1/regions.json").getJSONArray("regions")
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            val b = o.getJSONArray("bbox")
            Region(o.getString("id"), o.getString("name"), b.getDouble(0), b.getDouble(1), b.getDouble(2), b.getDouble(3))
        }
    }
}

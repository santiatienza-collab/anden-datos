package com.example.tren4you

import org.json.JSONArray
import org.json.JSONObject

data class Station(
    val id: String,
    /** Clave apta para nombres de fichero (los ids de algunos operadores llevan ":"). */
    val key: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    val alerts: Int = 0,
    /** Tiene algún aviso de accesibilidad activo (ascensor, escalera, estación inaccesible…). */
    val accessibilityIssue: Boolean = false,
    val region: String? = null,
    val province: String? = null,
    /** Estación de metro (Metro de Barcelona, Metro Bilbao). */
    val metro: Boolean = false,
)

data class Region(val id: String, val name: String, val west: Double, val south: Double, val east: Double, val north: Double)

enum class AlertCategory {
    Accessibility, Strike, Works, Bus, Disruption, Other;

    companion object {
        fun from(k: String?) = when (k) {
            "accessibility" -> Accessibility
            "strike" -> Strike
            "works" -> Works
            "bus" -> Bus
            "disruption" -> Disruption
            else -> Other
        }
    }
}

enum class AccessElement { Station, Elevator, Escalator, Platform, Other }

data class StationAlert(
    val id: String,
    val text: String,
    val category: AlertCategory,
    val element: AccessElement?,
    val stationInaccessible: Boolean,
)

data class AccessibilitySummary(
    val stationInaccessible: Boolean,
    val elevatorsOut: Int,
    val escalatorsOut: Int,
    val otherOut: Int,
) {
    val any get() = stationInaccessible || elevatorsOut + escalatorsOut + otherOut > 0
}

enum class BoardStatus { Cancelled, Skipped, Delayed, OnTime, Scheduled }

data class BoardRow(
    val tripId: String,
    /** Hora esperada (segundos epoch): permite ocultar los trenes que ya han pasado. */
    val expectedEpoch: Long,
    val line: String?,
    val otherEnd: String?,
    val scheduledTime: String,
    val expectedTime: String,
    val delayMin: Int?,
    val status: BoardStatus,
    val level: Level,
)

data class StationBoard(
    val station: Station,
    val scheduleReady: Boolean,
    val accessibility: AccessibilitySummary,
    val alerts: List<StationAlert>,
    val departures: List<BoardRow>,
    val arrivals: List<BoardRow>,
)

private fun JSONObject.str(k: String): String? = if (isNull(k)) null else getString(k).trim().ifEmpty { null }

fun parseStation(o: JSONObject) = Station(
    id = o.getString("id"), key = o.optString("key").ifEmpty { o.getString("id") }, name = o.getString("name"),
    lat = o.getDouble("lat"), lon = o.getDouble("lon"),
    alerts = o.optInt("alerts"), accessibilityIssue = o.optBoolean("accessibility"),
    region = if (o.isNull("region")) null else o.optString("region").ifEmpty { null },
    province = if (o.isNull("province")) null else o.optString("province").ifEmpty { null },
    metro = o.optBoolean("metro"),
)

fun parseStations(arr: JSONArray) = (0 until arr.length()).map { parseStation(arr.getJSONObject(it)) }

fun parseBoard(o: JSONObject): StationBoard {
    val acc = o.getJSONObject("accessibility")
    val alerts = o.getJSONArray("alerts").let { a ->
        (0 until a.length()).map {
            val x = a.getJSONObject(it)
            val ai = x.optJSONObject("accessibility")
            StationAlert(
                id = x.getString("id"), text = x.getString("text"),
                category = AlertCategory.from(x.str("category")),
                element = ai?.str("element")?.let { e ->
                    when (e) { "station" -> AccessElement.Station; "elevator" -> AccessElement.Elevator
                        "escalator" -> AccessElement.Escalator; "platform" -> AccessElement.Platform
                        else -> AccessElement.Other }
                },
                stationInaccessible = ai?.optBoolean("stationInaccessible") ?: false,
            )
        }
    }
    fun rows(key: String) = o.getJSONArray(key).let { a ->
        (0 until a.length()).map {
            val x = a.getJSONObject(it)
            BoardRow(
                tripId = x.getString("tripId"), expectedEpoch = x.optLong("expectedEpoch"), line = x.str("line"), otherEnd = x.str("otherEnd"),
                scheduledTime = x.getString("scheduledTime"), expectedTime = x.getString("expectedTime"),
                delayMin = if (x.isNull("delayMin")) null else x.getInt("delayMin"),
                status = when (x.getString("status")) {
                    "cancelled" -> BoardStatus.Cancelled; "skipped" -> BoardStatus.Skipped
                    "delayed" -> BoardStatus.Delayed; "on_time" -> BoardStatus.OnTime
                    else -> BoardStatus.Scheduled
                },
                level = Level.from(x.str("level")),
            )
        }
    }
    return StationBoard(
        station = parseStation(o.getJSONObject("station")),
        scheduleReady = o.optBoolean("scheduleReady"),
        accessibility = AccessibilitySummary(
            acc.optBoolean("stationInaccessible"), acc.optInt("elevatorsOut"),
            acc.optInt("escalatorsOut"), acc.optInt("otherOut"),
        ),
        alerts = alerts, departures = rows("departures"), arrivals = rows("arrivals"),
    )
}

/** Aviso de servicio para la pantalla de Avisos. */
data class AlertItem(
    val id: String,
    val text: String,
    val category: AlertCategory,
    val severity: String,
    val element: AccessElement?,
    val stationInaccessible: Boolean,
    val regions: List<String>,
    val lines: List<String>,
    val stationNames: List<String>,
    val active: Boolean,
    val activeFrom: Long?,
)

fun parseAlerts(arr: JSONArray): List<AlertItem> = (0 until arr.length()).map {
    val x = arr.getJSONObject(it)
    fun strs(k: String) = x.optJSONArray(k)?.let { a -> (0 until a.length()).map { i -> a.getString(i) } } ?: emptyList()
    val ai = x.optJSONObject("accessibility")
    AlertItem(
        id = x.getString("id"), text = x.getString("text").split(Regex("\\s+")).joinToString(" ").trim(),
        category = AlertCategory.from(x.optString("category")), severity = x.optString("severity", "info"),
        element = ai?.optString("element")?.let { e ->
            when (e) { "station" -> AccessElement.Station; "elevator" -> AccessElement.Elevator
                "escalator" -> AccessElement.Escalator; "platform" -> AccessElement.Platform; else -> AccessElement.Other }
        },
        stationInaccessible = ai?.optBoolean("stationInaccessible") ?: false,
        regions = strs("regions"), lines = strs("lines"), stationNames = strs("stationNames"),
        active = x.optBoolean("active", true),
        activeFrom = if (x.isNull("activeFrom")) null else x.optLong("activeFrom"),
    )
}

/** Estado de una fuente de datos (pantalla de Ajustes). */
/** Estado de las fuentes y antigüedad (s) de la última instantánea publicada. */
data class SourcesInfo(val snapshotAgeSec: Long, val list: List<SourceStatus>)

data class SourceStatus(val id: String, val ok: Boolean, val ageSec: Long?, val error: String?)

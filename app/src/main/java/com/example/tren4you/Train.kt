package com.example.tren4you

import org.json.JSONObject

enum class Level(val key: String) {
    Green("green"), Amber("amber"), Red("red"), Gray("gray");

    companion object {
        fun from(key: String?) = entries.firstOrNull { it.key == key } ?: Gray
    }
}

data class Train(
    val id: String,
    val label: String,
    val line: String?,
    val route: String?,
    val lat: Double,
    val lon: Double,
    val level: Level,
    val delayMin: Int?,
    val cancelled: Boolean,
    val stopName: String?,
    /** "exact" = GPS del feed; "stop" = colocado en su última parada. */
    val positionBasis: String,
    val network: String,
    /** Tipo de servicio (av, ld, avant, md, cercanias, rodalies, sfm) y compañía (Renfe, SFM). */
    val service: String,
    val company: String,
    /** Comunidad autónoma (id), o null si está fuera de España. */
    val region: String?,
) {
    /** Posición estimada según el horario: no hay retraso medido (SFM no publica tiempo real). */
    val estimated: Boolean get() = positionBasis == "schedule"

    companion object {
        fun fromJson(o: JSONObject): Train? {
            if (o.isNull("lat") || o.isNull("lon")) return null
            fun s(k: String) = if (o.isNull(k)) null else o.getString(k).trim().ifEmpty { null }
            return Train(
                id = o.getString("tripId"),
                label = s("label") ?: o.getString("tripId"),
                line = s("line"), route = s("route"),
                lat = o.getDouble("lat"), lon = o.getDouble("lon"),
                level = Level.from(s("level")),
                delayMin = if (o.isNull("delayMin")) null else o.getInt("delayMin"),
                cancelled = o.optBoolean("cancelled"),
                stopName = s("stopName"),
                positionBasis = s("positionBasis") ?: "none",
                network = s("network") ?: "",
                service = s("service") ?: "",
                company = s("company") ?: "",
                region = s("region"),
            )
        }
    }
}

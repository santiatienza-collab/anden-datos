package com.anden.miapp

import androidx.compose.ui.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.circleBlur
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleOpacity
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.lineBlur
import org.maplibre.android.style.layers.PropertyFactory.lineCap
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineJoin
import org.maplibre.android.style.layers.PropertyFactory.lineOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.sources.GeoJsonSource
import kotlin.math.sin

/**
 * Alertas críticas en el mapa: el tramo afectado se dibuja en rojo neón (varias capas superpuestas: halo ancho y difuso,
 * brillo, núcleo y filo casi blanco) y los trenes o estaciones implicados, como puntos con resplandor. El halo parpadea.
 * Se dibuja SIEMPRE para las señales críticas y, además, para las que el usuario haya pedido ver (aunque no sean críticas).
 */
object CriticalMap {
    const val SRC = "crit"
    const val HALO = "crit-halo"
    const val GLOW = "crit-glow"
    const val CORE = "crit-core"
    const val HOT = "crit-hot"
    const val PT_HALO = "crit-pt-halo"
    const val PT = "crit-pt"

    private const val NEON = 0xFFFF1744.toInt()
    private const val AMBER = 0xFFFF9F0A.toInt()
    private const val GREY = 0xFF8E8E93.toInt()
    private const val HOT_WHITE = 0xFFFFE3E8.toInt()

    private val isLine = Expression.eq(Expression.geometryType(), Expression.literal("LineString"))
    private val isPoint = Expression.eq(Expression.geometryType(), Expression.literal("Point"))
    private val isEnd = Expression.eq(Expression.get("end"), Expression.literal(1))

    private fun byLevel() = Expression.match(
        Expression.get("sev"), Expression.color(GREY),
        Expression.stop("critical", Expression.color(NEON)),
        Expression.stop("warning", Expression.color(AMBER)),
    )

    private fun zoomWidth(low: Float, high: Float) = Expression.interpolate(
        Expression.linear(), Expression.zoom(), Expression.stop(4, low), Expression.stop(10, high),
    )

    /** Añade fuente y capas justo debajo de los trenes (los trenes siguen viéndose encima del neón). */
    fun addLayers(style: Style, belowLayer: String) {
        style.addSource(GeoJsonSource(SRC, "{\"type\":\"FeatureCollection\",\"features\":[]}"))
        fun line(id: String, width: Expression, blur: Float, opacity: Float, color: Expression) {
            val l = LineLayer(id, SRC).withProperties(
                lineColor(color), lineWidth(width), lineBlur(blur), lineOpacity(opacity),
                lineCap(Property.LINE_CAP_ROUND), lineJoin(Property.LINE_JOIN_ROUND),
            )
            l.setFilter(isLine)
            style.addLayerBelow(l, belowLayer)
        }
        line(HALO, zoomWidth(14f, 30f), 14f, 0.35f, byLevel())
        line(GLOW, zoomWidth(7f, 14f), 4f, 0.65f, byLevel())
        line(CORE, zoomWidth(2.6f, 5f), 0f, 1f, byLevel())
        line(HOT, zoomWidth(1f, 2f), 0f, 0.95f, Expression.color(HOT_WHITE))
        fun pt(id: String, radius: Expression, blur: Float, opacity: Float, stroke: Float) {
            val l = CircleLayer(id, SRC).withProperties(
                circleColor(byLevel()), circleRadius(radius), circleBlur(blur), circleOpacity(opacity),
                circleStrokeWidth(stroke), circleStrokeColor(Expression.color(HOT_WHITE)),
            )
            l.setFilter(isPoint)
            style.addLayerBelow(l, belowLayer)
        }
        pt(PT_HALO, Expression.switchCase(isEnd, Expression.literal(15f), Expression.literal(26f)), 1f, 0.35f, 0f)
        pt(PT, Expression.switchCase(isEnd, Expression.literal(4.5f), Expression.literal(8f)), 0f, 1f, 2f)
    }

    /** Parpadeo del neón: k entre 0 y 1. */
    fun pulse(style: Style, k: Float) {
        style.getLayerAs<LineLayer>(HALO)?.setProperties(lineOpacity(0.18f + 0.40f * k))
        style.getLayerAs<LineLayer>(GLOW)?.setProperties(lineOpacity(0.45f + 0.50f * k))
        style.getLayerAs<CircleLayer>(PT_HALO)?.setProperties(circleOpacity(0.20f + 0.45f * k))
    }

    fun pulseValue(millis: Long): Float = (0.5 + 0.5 * sin(millis / 380.0)).toFloat()

    /** GeoJSON de las señales a dibujar: tramos como líneas; trenes/estaciones y extremos de tramo como puntos. */
    fun geoJson(signals: List<SafetySignal>, focusIds: Set<String>): String {
        val features = JSONArray()
        fun feature(geom: JSONObject, s: SafetySignal, extra: Map<String, Any> = emptyMap()) {
            val props = JSONObject().put("id", s.id).put("sev", s.level).put("focus", if (s.id in focusIds) 1 else 0)
            for ((k, v) in extra) props.put(k, v)
            features.put(JSONObject().put("type", "Feature").put("properties", props).put("geometry", geom))
        }
        fun point(lat: Double, lon: Double) = JSONObject().put("type", "Point").put("coordinates", JSONArray().put(lon).put(lat))
        for (s in signals) {
            for (seg in s.segments) {
                if (seg.size < 2) continue
                val coords = JSONArray()
                for ((lat, lon) in seg) coords.put(JSONArray().put(lon).put(lat))
                feature(JSONObject().put("type", "LineString").put("coordinates", coords), s)
                // Extremos: marcan dónde empieza y dónde acaba el tramo
                feature(point(seg.first().first, seg.first().second), s, mapOf("end" to 1))
                feature(point(seg.last().first, seg.last().second), s, mapOf("end" to 1))
            }
            val pts = when {
                s.points.isNotEmpty() -> s.points
                s.segments.isEmpty() && s.lat != null && s.lon != null -> listOf(SafetyPoint(s.lat, s.lon, s.title))
                else -> emptyList()
            }
            for (p in pts) feature(point(p.lat, p.lon), s, mapOf("label" to p.label))
        }
        return JSONObject().put("type", "FeatureCollection").put("features", features).toString()
    }

    /** Encuadre que abarca todos los tramos y puntos de las señales; null si no tienen ubicación. */
    fun bounds(signals: List<SafetySignal>): LatLngBounds? {
        val b = LatLngBounds.Builder()
        var n = 0
        for (s in signals) {
            for (seg in s.segments) for ((lat, lon) in seg) { b.include(LatLng(lat, lon)); n++ }
            for (p in s.points) { b.include(LatLng(p.lat, p.lon)); n++ }
            if (s.segments.isEmpty() && s.points.isEmpty() && s.lat != null && s.lon != null) { b.include(LatLng(s.lat, s.lon)); n++ }
        }
        if (n == 0) return null
        return runCatching { b.build() }.getOrNull() // un solo punto: lo resuelve el llamador
    }

    fun singlePoint(signals: List<SafetySignal>): LatLng? {
        val all = signals.flatMap { s ->
            s.segments.flatten().map { LatLng(it.first, it.second) } + s.points.map { LatLng(it.lat, it.lon) } +
                (if (s.segments.isEmpty() && s.points.isEmpty() && s.lat != null && s.lon != null) listOf(LatLng(s.lat, s.lon)) else emptyList())
        }
        return all.firstOrNull()?.takeIf { p -> all.all { it.latitude == p.latitude && it.longitude == p.longitude } }
    }

    val neonColor = Color(NEON)
}

/** Petición de ver alertas en el mapa; `nonce` distingue peticiones repetidas con los mismos ids. */
data class FocusRequest(val ids: List<String>, val nonce: Long)

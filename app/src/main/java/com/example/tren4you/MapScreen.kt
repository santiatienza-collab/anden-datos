package com.example.tren4you

import android.content.Context
import android.graphics.RectF
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.tren4you.ui.theme.AndenWhite
import com.example.tren4you.ui.theme.AndenYellow
import com.example.tren4you.ui.theme.Gray400
import com.example.tren4you.ui.theme.Gray600
import com.example.tren4you.ui.theme.Gray800
import com.example.tren4you.ui.theme.Gray900
import com.example.tren4you.ui.theme.Gray950
import com.example.tren4you.ui.theme.LevelAmber
import com.example.tren4you.ui.theme.LevelGray
import com.example.tren4you.ui.theme.LevelGreen
import com.example.tren4you.ui.theme.LevelRed
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.fillColor
import org.maplibre.android.style.layers.PropertyFactory.fillOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.textAnchor
import org.maplibre.android.style.layers.PropertyFactory.textColor
import org.maplibre.android.style.layers.PropertyFactory.textField
import org.maplibre.android.style.layers.PropertyFactory.textFont
import org.maplibre.android.style.layers.PropertyFactory.textHaloColor
import org.maplibre.android.style.layers.PropertyFactory.textHaloWidth
import org.maplibre.android.style.layers.PropertyFactory.textOffset
import org.maplibre.android.style.layers.PropertyFactory.textOptional
import org.maplibre.android.style.layers.PropertyFactory.textSize
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

private const val SRC = "trains"
private const val LAYER = "trains-layer"
private const val ST_SRC = "stations"
private const val ST_LAYER = "stations-layer"
private const val ST_LABELS = "stations-labels"
private const val RG_SRC = "regions"
private const val RG_FILL = "regions-fill"
private const val RG_LINE = "regions-line"
private const val REFRESH_MS = 60_000L // los datos se publican cada ~5 min; más frecuente no aporta nada

// Mapa base: datos de OpenStreetMap servidos por OpenFreeMap (vectorial, gratuito, sin clave).
// Atribución obligatoria: OpenFreeMap, OpenMapTiles y colaboradores de OSM (la muestra el botón (i)).
// Para producción conviene autoalojar las teselas.
private const val STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron"

// Encuadre inicial: España peninsular y Baleares (Canarias, Ceuta y Melilla se ven al elegirlas).
private val SPAIN = Region("espana", "España", -9.6, 35.9, 4.6, 43.9)

fun Level.color(): Color = when (this) {
    Level.Green -> LevelGreen
    Level.Amber -> LevelAmber
    Level.Red -> LevelRed
    Level.Gray -> LevelGray
}

private fun levelLabel(l: Level) = when (l) {
    Level.Green -> "Puntual"
    Level.Amber -> "Retraso"
    Level.Red -> "Retraso grave"
    Level.Gray -> "Sin datos"
}

private fun trainsGeoJson(trains: List<Train>): String {
    val features = JSONArray()
    for (t in trains) features.put(
        JSONObject()
            .put("type", "Feature")
            .put("geometry", JSONObject().put("type", "Point").put("coordinates", JSONArray().put(t.lon).put(t.lat)))
            .put("properties", JSONObject().put("id", t.id).put("level", t.level.key))
    )
    return JSONObject().put("type", "FeatureCollection").put("features", features).toString()
}

private fun stationsGeoJson(stations: List<Station>): String {
    val features = JSONArray()
    for (s in stations) features.put(
        JSONObject()
            .put("type", "Feature")
            .put("geometry", JSONObject().put("type", "Point").put("coordinates", JSONArray().put(s.lon).put(s.lat)))
            .put(
                "properties",
                JSONObject().put("id", s.id).put("name", s.name)
                    .put("flag", if (s.accessibilityIssue) "access" else if (s.alerts > 0) "alert" else "ok"),
            )
    )
    return JSONObject().put("type", "FeatureCollection").put("features", features).toString()
}

private fun levelExpr(): Expression = Expression.match(
    Expression.get("level"), Expression.color(LevelGray.toArgb()),
    Expression.stop("green", Expression.color(LevelGreen.toArgb())),
    Expression.stop("amber", Expression.color(LevelAmber.toArgb())),
    Expression.stop("red", Expression.color(LevelRed.toArgb())),
)

/** Colores de las capas propias según el mapa base (claro u oscuro). */
private class Palette {
    val trainStroke = Gray900
    val stationFill = Color.White
    val stationStroke = Gray600
    val stationAlert = Color(0xFFD99A00)
    val label = Gray900
    val labelHalo = Color.White
    val regionLine = Gray600
    val regionAccent = Color(0xFFD99A00)
}

/** Resalta la comunidad elegida: contorno grueso y relleno suave; el resto, contorno fino. */
private fun highlightRegion(style: Style, selectedId: String?) {
    val c = Palette()
    val sel = selectedId ?: "-"
    style.getLayerAs<FillLayer>(RG_FILL)?.setProperties(
        fillOpacity(Expression.match(Expression.get("id"), Expression.literal(0.01f), Expression.stop(sel, Expression.literal(0.1f)))),
    )
    style.getLayerAs<LineLayer>(RG_LINE)?.setProperties(
        lineColor(Expression.match(Expression.get("id"), Expression.color(c.regionLine.toArgb()), Expression.stop(sel, Expression.color(c.regionAccent.toArgb())))),
        lineWidth(Expression.match(Expression.get("id"), Expression.literal(1f), Expression.stop(sel, Expression.literal(3f)))),
    )
}

/** Añade las capas de estaciones y trenes sobre el estilo base ya cargado. */
private fun addAndenLayers(style: Style) {
    val c = Palette()
    // Comunidades autónomas: relleno casi invisible (para poder tocarlas) y contorno fino.
    style.addSource(GeoJsonSource(RG_SRC, "{\"type\":\"FeatureCollection\",\"features\":[]}"))
    style.addLayer(FillLayer(RG_FILL, RG_SRC).withProperties(fillColor(Expression.color(c.regionAccent.toArgb())), fillOpacity(0.01f)))
    style.addLayer(LineLayer(RG_LINE, RG_SRC).withProperties(lineColor(Expression.color(c.regionLine.toArgb())), lineWidth(1f)))
    style.addSource(GeoJsonSource(ST_SRC, stationsGeoJson(emptyList())))
    // Estaciones debajo de los trenes. Con aviso: borde amarillo; con aviso de accesibilidad: más grueso.
    style.addLayer(
        CircleLayer(ST_LAYER, ST_SRC).withProperties(
            circleColor(Expression.color(c.stationFill.toArgb())),
            circleRadius(
                Expression.interpolate(
                    Expression.linear(), Expression.zoom(),
                    Expression.stop(6, 2.5f), Expression.stop(10, 5f), Expression.stop(13, 8f),
                )
            ),
            circleStrokeColor(
                Expression.match(
                    Expression.get("flag"), Expression.color(c.stationStroke.toArgb()),
                    Expression.stop("alert", Expression.color(c.stationAlert.toArgb())),
                    Expression.stop("access", Expression.color(c.stationAlert.toArgb())),
                )
            ),
            circleStrokeWidth(
                Expression.match(
                    Expression.get("flag"), Expression.literal(1.2f),
                    Expression.stop("alert", Expression.literal(2f)),
                    Expression.stop("access", Expression.literal(3f)),
                )
            ),
        ).also { it.minZoom = 6f }
    )
    style.addLayer(
        SymbolLayer(ST_LABELS, ST_SRC).withProperties(
            textField(Expression.get("name")),
            textFont(arrayOf("Noto Sans Regular")),
            textSize(11f),
            textColor(Expression.color(c.label.toArgb())),
            textHaloColor(Expression.color(c.labelHalo.toArgb())),
            textHaloWidth(1.4f),
            textOffset(arrayOf(0f, 1.2f)),
            textAnchor(Property.TEXT_ANCHOR_TOP),
            textOptional(true),
        ).also { it.minZoom = 10.5f }
    )
    style.addSource(GeoJsonSource(SRC, trainsGeoJson(emptyList())))
    style.addLayer(
        CircleLayer(LAYER, SRC).withProperties(
            circleColor(levelExpr()),
            circleRadius(
                Expression.interpolate(
                    Expression.linear(), Expression.zoom(),
                    Expression.stop(4, 3.5f), Expression.stop(8, 6f), Expression.stop(12, 9f),
                )
            ),
            circleStrokeColor(Expression.color(c.trainStroke.toArgb())),
            circleStrokeWidth(1.4f),
        )
    )
}

/**
 * Pantalla única de Andén: mapa a pantalla completa con la barra superior (contadores, selector de
 * comunidad, buscador y engranaje de Ajustes) y, abajo, el panel con pestañas Retrasos / Avisos / Estaciones.
 */
@Composable
fun MapScreen(
    regions: List<Region>,
    region: Region?, // null = toda España
    onRegion: (Region?) -> Unit,
    stations: List<Station>,
    trains: List<Train>,
    dataTimeSec: Long?,
    error: String?,
    pendingStation: Station?,
    pendingTrain: Train?,
    onPendingHandled: () -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current

    var filter by remember { mutableStateOf<Level?>(null) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var station by remember { mutableStateOf<Station?>(null) }
    var arrivals by remember { mutableStateOf(false) }
    var board by remember { mutableStateOf<StationBoard?>(null) }
    var boardError by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleReady by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1_000) } }

    // Tablero de la estación abierta: al abrirla y cada minuto.
    LaunchedEffect(station?.id) {
        val st = station ?: return@LaunchedEffect
        board = null
        boardError = null
        while (true) {
            runCatching { TrainsApi.board(st) }
                .onSuccess { board = it; boardError = null }
                .onFailure { boardError = it.message ?: "sin conexión" }
            delay(60_000)
        }
    }

    val inRegion = remember(trains, region) { if (region == null) trains else trains.filter { it.region == region?.id } }
    val visible = remember(inRegion, filter) { if (filter == null) inRegion else inRegion.filter { it.level == filter } }
    val visibleStations = remember(stations, region) { if (region == null) stations else stations.filter { it.region == region?.id } }
    val selected = remember(trains, selectedId) { trains.firstOrNull { it.id == selectedId } }

    // Contornos de las comunidades: se descargan una vez (se reintenta hasta lograrlo).
    var regionsGeo by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (regionsGeo == null) {
            runCatching { TrainsApi.regionsGeo() }.onSuccess { regionsGeo = it }
            if (regionsGeo == null) delay(5_000)
        }
    }
    LaunchedEffect(regionsGeo, styleReady) {
        val g = regionsGeo ?: return@LaunchedEffect
        if (styleReady) map?.style?.getSourceAs<GeoJsonSource>(RG_SRC)?.setGeoJson(g)
    }
    LaunchedEffect(region, regionsGeo, styleReady) {
        if (styleReady) map?.style?.let { highlightRegion(it, region?.id) }
    }

    // Empuja datos al mapa (también tras cambiar de estilo, cuando styleReady vuelve a true).
    LaunchedEffect(visible, styleReady) {
        if (styleReady) map?.style?.getSourceAs<GeoJsonSource>(SRC)?.setGeoJson(trainsGeoJson(visible))
    }
    LaunchedEffect(visibleStations, styleReady) {
        if (styleReady) map?.style?.getSourceAs<GeoJsonSource>(ST_SRC)?.setGeoJson(stationsGeoJson(visibleStations))
    }

    // Encuadre: toda España al inicio; al elegir comunidad, se ajusta a ella.
    var framed by remember { mutableStateOf(false) }
    LaunchedEffect(region, styleReady) {
        val m = map ?: return@LaunchedEffect
        if (!styleReady) return@LaunchedEffect
        val r = region ?: SPAIN
        // Mínimo de ~0,5° para que Ceuta/Melilla no queden con un zoom absurdo.
        val padLon = maxOf(0.0, (0.5 - (r.east - r.west)) / 2)
        val padLat = maxOf(0.0, (0.5 - (r.north - r.south)) / 2)
        val bounds = LatLngBounds.Builder()
            .include(LatLng(r.south - padLat, r.west - padLon))
            .include(LatLng(r.north + padLat, r.east + padLon))
            .build()
        with(density) {
            val upd = CameraUpdateFactory.newLatLngBounds(
                bounds, 24.dp.roundToPx(), 250.dp.roundToPx(), 24.dp.roundToPx(), 130.dp.roundToPx(),
            )
            if (framed) m.animateCamera(upd, 700) else { m.moveCamera(upd); framed = true }
        }
    }

    fun openStation(s: Station, fly: Boolean) {
        selectedId = null
        arrivals = false
        station = s
        if (fly) map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(s.lat, s.lon), 12.5), 700)
    }

    fun openTrain(t: Train) {
        station = null
        selectedId = t.id
        map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(t.lat, t.lon), 9.5), 700)
    }

    LaunchedEffect(pendingStation, pendingTrain, map) {
        if (map == null) return@LaunchedEffect
        val st = pendingStation
        val tr = pendingTrain
        if (st != null) { openStation(st, true); onPendingHandled() }
        else if (tr != null) { openTrain(tr); onPendingHandled() }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFFE8E8EA))) {
        MapContainer(
            context,
            onMap = { m, ready -> map = m; styleReady = ready },
            onTap = { trainHit, stationHit, regionHit ->
                when {
                    trainHit != null -> { selectedId = trainHit; station = null }
                    stationHit != null -> stations.firstOrNull { it.id == stationHit }?.let { openStation(it, false) }
                    // Un toque en vacío cierra primero lo abierto; si no había nada, elige la comunidad tocada.
                    selectedId != null || station != null -> { selectedId = null; station = null }
                    regionHit != null -> regions.firstOrNull { it.id == regionHit }?.let { onRegion(it) }
                }
            },
        )

        Column(Modifier.fillMaxSize().statusBarsPadding().padding(12.dp)) {
            TopBar(
                inRegion, filter,
                onFilter = { filter = if (filter == it) null else it },
                onSearch = { searching = true },
            )
            Spacer(Modifier.height(8.dp))
            RegionRow(regions, region, onPick = { onRegion(it); station = null; selectedId = null })
            Spacer(Modifier.weight(1f))
            StatusLine(dataTimeSec, now, error)
            Spacer(Modifier.height(8.dp))
            when {
                selected != null -> TrainCard(selected, onClose = { selectedId = null })
                station != null -> station?.let { st ->
                    StationSheet(
                        board = board?.takeIf { it.station.id == st.id }, stationName = st.name, arrivals = arrivals,
                        nowSec = now / 1000, error = boardError, onToggle = { arrivals = it }, onClose = { station = null },
                    )
                }
                else -> {}
            }
        }

        if (searching) SearchOverlay(stations, onClose = { searching = false }, onPick = { s -> searching = false; openStation(s, true) })
    }
}

@Composable
private fun SearchOverlay(stations: List<Station>, onClose: () -> Unit, onPick: (Station) -> Unit) {
    var q by remember { mutableStateOf("") }
    val results = remember(q, stations) { searchStations(stations, q) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(Modifier.fillMaxSize().background(Gray900.copy(alpha = 0.97f)).statusBarsPadding().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Gray800).padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = AndenYellow)
                Spacer(Modifier.width(8.dp))
                BasicTextField(
                    value = q, onValueChange = { q = it }, singleLine = true,
                    textStyle = TextStyle(color = AndenWhite, fontSize = 16.sp),
                    cursorBrush = SolidColor(AndenYellow),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    decorationBox = { inner ->
                        if (q.isEmpty()) Text("Buscar estación…", color = Gray400, fontSize = 16.sp)
                        inner()
                    },
                )
            }
            Spacer(Modifier.width(10.dp))
            Text("Cancelar", color = AndenYellow, fontSize = 14.sp, modifier = Modifier.clickable(onClick = onClose).padding(6.dp))
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn {
            itemsIndexed(results, key = { i, s -> "${s.id}#$i" }) { _, s ->
                Row(Modifier.fillMaxWidth().clickable { onPick(s) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(s.name, color = AndenWhite, fontSize = 15.sp, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun MapContainer(
    context: Context,
    onMap: (MapLibreMap, Boolean) -> Unit,
    onTap: (trainId: String?, stationId: String?, regionId: String?) -> Unit,
) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }

    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context).also { mv ->
            mv.onCreate(null)
            mv.getMapAsync { m ->
                m.uiSettings.isRotateGesturesEnabled = false
                m.uiSettings.isLogoEnabled = false
                m.addOnMapClickListener { latLng ->
                    val p = m.projection.toScreenLocation(latLng)
                    val train = m.queryRenderedFeatures(p, LAYER).firstOrNull()?.getStringProperty("id")
                    // Margen de toque mayor para las estaciones (son más pequeñas).
                    val box = RectF(p.x - 24f, p.y - 24f, p.x + 24f, p.y + 24f)
                    val station = if (train == null) m.queryRenderedFeatures(box, ST_LAYER).firstOrNull()?.getStringProperty("id") else null
                    val regionId = if (train == null && station == null) m.queryRenderedFeatures(p, RG_FILL).firstOrNull()?.getStringProperty("id") else null
                    onTap(train, station, regionId)
                    train != null || station != null || regionId != null
                }
                mapRef = m
            }
        }
    }

    // Aplica el estilo base (siempre claro) y añade las capas propias.
    LaunchedEffect(mapRef) {
        val m = mapRef ?: return@LaunchedEffect
        onMap(m, false)
        m.setStyle(Style.Builder().fromUri(STYLE_LIGHT)) { style ->
            addAndenLayers(style)
            onMap(m, true)
        }
    }

    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> {}
            }
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }
    AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
}

@Composable
private fun TopBar(
    trains: List<Train>, filter: Level?,
    onFilter: (Level) -> Unit, onSearch: () -> Unit,
) {
    Surface(shape = RoundedCornerShape(16.dp), color = Gray800.copy(alpha = 0.95f)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Andén", color = AndenYellow, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Text("Estado de trenes en España", color = Gray400, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.Search, "Buscar estación", tint = AndenYellow,
                    modifier = Modifier.clip(CircleShape).clickable(onClick = onSearch).padding(4.dp).size(24.dp))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (l in listOf(Level.Green, Level.Amber, Level.Red, Level.Gray)) {
                    val n = trains.count { it.level == l }
                    val on = filter == l
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) AndenYellow else Gray900)
                            .clickable { onFilter(l) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(9.dp).clip(CircleShape).background(l.color()))
                        Spacer(Modifier.width(6.dp))
                        Text("$n", color = if (on) Gray950 else AndenWhite, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusLine(dataTimeSec: Long?, now: Long, error: String?) {
    val age = dataTimeSec?.let { now / 1000 - it }
    val stale = age != null && age > 1_200 // más de 20 min: algo falla en la publicación de datos
    val text = when {
        age == null && error == null -> "Cargando trenes…"
        age == null -> "Sin conexión con los datos ($error)"
        error != null -> "Sin conexión · datos de ${ageLabel(age).removePrefix("hace ")}"
        stale -> "Datos antiguos (${ageLabel(age)})"
        else -> "Datos de ${ageLabel(age).removePrefix("hace ")}"
    }
    Text(
        text, color = if (error != null || stale) LevelAmber else Gray400, fontSize = 11.sp,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(Gray900.copy(alpha = 0.88f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun TrainCard(t: Train, onClose: () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = Gray800, border = BorderStroke(1.dp, t.level.color().copy(alpha = 0.6f))) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(12.dp).clip(CircleShape).background(t.level.color()))
                Spacer(Modifier.width(10.dp))
                Text(
                    listOfNotNull(t.line, t.label).joinToString(" · "), color = AndenWhite, fontSize = 18.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
                )
                Text("✕", color = Gray400, fontSize = 18.sp, modifier = Modifier.clickable(onClick = onClose).padding(4.dp))
            }
            t.route?.let { Text(it, color = Gray400, fontSize = 13.sp, modifier = Modifier.padding(top = 2.dp)) }
            Spacer(Modifier.height(10.dp))
            val d = t.delayMin
            val delayText = when {
                t.cancelled -> "Cancelado"
                d == null -> "Sin dato de retraso"
                d <= 0 -> "Sin retraso"
                else -> "+$d min"
            }
            Text("${levelLabel(t.level)} · $delayText", color = t.level.color(), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            t.stopName?.let { Text("Última parada: $it", color = AndenWhite, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp)) }
            Text(
                when (t.positionBasis) {
                    "exact" -> "Posición GPS"
                    "schedule" -> "Posición estimada según el horario (sin datos en tiempo real)"
                    else -> "Posición aproximada (última parada)"
                },
                color = Gray400, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

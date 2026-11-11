'use strict';
// Andén web: lee la misma API estática que la app (api/v1/*.json) y la muestra en el navegador.

const COLORS = { green: '#34d17a', amber: '#ff9f0a', red: '#ff453a', gray: '#8e8e93' };
const SERVICES = {
  av: 'AVE · AVLO', ld: 'Larga dist.', avant: 'Avant', md: 'Media dist.', cercanias: 'Cercanías',
  rodalies: 'Rodalies', sfm: 'SFM Mallorca', euskotren: 'Euskotren', metrobilbao: 'Metro Bilbao', fgc: 'FGC',
};
const SEV = {
  cancelled: { title: 'Cancelados', color: '#ff453a', dot: '#9b1c16', hint: 'Sin servicio' },
  severe: { title: 'Graves', color: '#ff453a', dot: '#ff453a', hint: '15 min o más' },
  moderate: { title: 'Moderados', color: '#ff9f0a', dot: '#ff9f0a', hint: 'De 5 a 14 min' },
};
const CATS = [[null, 'Todos', '🔖'], ['accessibility', 'Accesibilidad', '♿'], ['disruption', 'Incidencias', '⚠️'],
  ['strike', 'Huelgas', '📢'], ['works', 'Obras', '🚧'], ['bus', 'Autobús', '🚌'], ['other', 'Otros', 'ℹ️']];
const CAT_ICON = { accessibility: '♿', disruption: '⚠️', strike: '📢', works: '🚧', bus: '🚌', other: 'ℹ️' };
const SPAIN = [[-9.6, 35.9], [4.6, 43.9]];

const S = {
  trains: [], stops: [], alerts: [], regions: [], region: '', tab: 'map',
  safety: [], safetyNote: '', safetyStats: null, safetyLoaded: false, safetyLevel: null, safetyAcked: new Set(),
  level: null, service: null, sev: null, cat: null, onlyAlerts: false, q: '', generatedAt: 0,
};
let map, mapReady = false;

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const regionName = (id) => S.regions.find((r) => r.id === id)?.name ?? id ?? '';
// Los datos se piden cada 30 s. La caché de GitHub Pages puede durar 10 min: un parámetro distinto cada 30 s fuerza el dato más reciente.
const REFRESH_MS = 30000;
async function fetchJson(path, bucketMs = REFRESH_MS) {
  // Tiempo límite de 15 s: sin él, una petición colgada (corte de red, cambio de wifi…) dejaba la web sin actualizarse hasta recargar.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(path + '?v=' + Math.floor(Date.now() / bucketMs), { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
// Un fallo puntual (p. ej. Pages redesplegándose) se reintenta una vez antes de darlo por malo.
async function j(path) {
  try { return await fetchJson(path); }
  catch (e) { await new Promise((ok) => setTimeout(ok, 1500)); return fetchJson(path); }
}
const ageText = (sec) => (sec < 90 ? Math.max(sec, 0) + ' s' : sec < 5400 ? Math.round(sec / 60) + ' min' : Math.round(sec / 3600) + ' h');

const sevOf = (t) => (t.cancelled ? 'cancelled' : t.level === 'red' ? 'severe' : t.level === 'amber' ? 'moderate' : null);
const estimated = (t) => t.positionBasis === 'schedule';
const inRegion = (list) => (S.region ? list.filter((x) => x.region === S.region) : list);
const delayed = (list) => list.filter((t) => sevOf(t));

// ---------- Datos ----------
let loading = false, loadingSince = 0, retryTimer = null;
async function loadAll() {
  if (loading && Date.now() - loadingSince < 45000) return; // pasados 45 s se da por colgada y se relanza
  loading = true; loadingSince = Date.now();
  try {
    // Cada fichero va por separado: si uno falla se conservan los últimos datos buenos de los demás.
    const [t, st, al, rg] = await Promise.allSettled([
      j('api/v1/trains.json'), j('api/v1/stops.json'), j('api/v1/alerts.json'),
      S.regions.length ? Promise.resolve(null) : j('api/v1/regions.json'),
    ]);
    if (t.status === 'fulfilled') { S.trains = t.value.trains; S.generatedAt = t.value.generatedAt; }
    if (st.status === 'fulfilled') S.stops = st.value.stops;
    if (al.status === 'fulfilled') S.alerts = al.value.alerts;
    if (rg.status === 'fulfilled' && rg.value) { S.regions = rg.value.regions; }
    const failed = [t, st, al].find((x) => x.status === 'rejected');
    S.error = failed ? failed.reason?.message ?? 'sin conexión' : null;
  } finally { loading = false; }
  renderAll();
  // Solo si NUNCA se ha cargado nada (primera carga fallida) se reintenta pronto, con un único temporizador.
  // (Que no haya trenes de madrugada es normal y no debe provocar reintentos.)
  if ((!S.generatedAt || !S.regions.length) && !retryTimer) retryTimer = setTimeout(() => { retryTimer = null; loadAll(); }, 5000);
}

// Reloj verde con fecha y hora (se actualiza cada segundo). Sustituye al cartel "Datos de hace X": solo se cambia por un aviso
// ámbar si hay un problema con los datos (sin conexión o datos antiguos).
const clockFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); // hora local del navegador
const CLOCK_SVG = '<svg class="clk" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="8" x2="11.4" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line class="mh" x1="8" y1="8" x2="8" y2="3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
let clockMode = false;
function tickClock() {
  if (!clockMode) return;
  const p = Object.fromEntries(clockFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  $('#age').innerHTML = CLOCK_SVG + '<span class="tm">' + p.weekday.replace('.', '') + ' ' + p.day + ' ' + p.month.replace('.', '') + ' ' + p.year + ' · ' + p.hour + ':' + p.minute + ':' + p.second + '</span>';
}
function renderAge() {
  const el = $('#age');
  const age = S.generatedAt ? Math.floor(Date.now() / 1000) - S.generatedAt : null;
  let warn = null;
  if (age == null) warn = S.error ? 'Sin datos (' + S.error + ')' : null;
  else if (S.error) warn = 'Sin conexión · datos de hace ' + ageText(age);
  else if (age > 1200) warn = 'Datos antiguos (hace ' + ageText(age) + ')';
  clockMode = !warn;
  el.classList.toggle('stale', !!warn);
  if (warn) el.textContent = warn; else tickClock();
}

// ---------- Mapa ----------
function trainsGeo(list) {
  return { type: 'FeatureCollection', features: list.map((t) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
    properties: { id: t.tripId, level: t.level, est: estimated(t) } })) };
}
function stopsGeo(list) {
  return { type: 'FeatureCollection', features: list.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: { id: s.id, name: s.name, flag: s.accessibility ? 'access' : s.alerts > 0 ? 'alert' : 'ok' } })) };
}

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const dark = false; // la web usa siempre el mapa claro
let regionsGeoData = null;
const palette = () => (dark
  ? { stroke: '#f5f5f7', stFill: '#2a2a2e', stStroke: '#9a9aa2', alert: '#ffd60a', line: '#9a9aa2', accent: '#ffd60a', estStroke: '#9a9aa2' }
  : { stroke: '#1c1c1f', stFill: '#ffffff', stStroke: '#5a5a60', alert: '#d99a00', line: '#5a5a60', accent: '#d99a00', estStroke: '#5a5a60' });

/** El mapa es opcional: si el navegador no tiene WebGL (p. ej. aceleración por hardware desactivada) o la librería no carga, el resto de la web sigue funcionando. */
function mapFail(msg) {
  map = null; mapReady = false;
  $('#map').innerHTML = '<div class="note" style="padding:24px;max-width:520px">🗺️ No se puede mostrar el mapa en este navegador. ' + esc(msg) +
    '<br><br>Puedes seguir usando Retrasos, Avisos y Estaciones. Si usas Chrome, comprueba que esté activada la opción «Usar aceleración gráfica cuando esté disponible» (chrome://settings/system) y recarga con Ctrl+F5.</div>';
}

function initMap() {
  try {
    if (typeof maplibregl === 'undefined') throw new Error('No se cargó la librería del mapa (¿bloqueada por una extensión o por la red?).');
    map = new maplibregl.Map({ container: 'map', style: dark ? STYLE_DARK : STYLE_LIGHT, bounds: SPAIN, fitBoundsOptions: { padding: 20 } });
  } catch (err) {
    return mapFail(err && err.message ? err.message : 'WebGL no disponible.');
  }
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  // Las capas se vuelven a añadir cada vez que se carga un estilo (al inicio y al cambiar de modo claro/oscuro)
  map.on('style.load', addLayers);
  map.on('click', 'trains', (e) => { const t = S.trains.find((x) => x.tripId === e.features[0].properties.id); if (t) trainPopup(t); });
  const openSt = (e) => { const s = S.stops.find((x) => x.id === e.features[0].properties.id); if (s) openStation(s); };
  map.on('click', 'stations-alerts', openSt); map.on('click', 'stations', openSt);
  map.on('click', 'regions-fill', (e) => {
    if (map.queryRenderedFeatures(e.point, { layers: ['trains', 'stations', 'stations-alerts'] }).length) return;
    setRegion(e.features[0].properties.id);
  });
  for (const l of ['trains', 'stations', 'stations-alerts']) {
    map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
  }
}

/** Los estilos piden el nombre en inglés (name_en); los datos traen también el castellano (name:es): se pide primero ese. */
function spanishLabels() {
  const rx = /\["get","(name_en|name:latin)"\]/g;
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol' || !l.layout || !l.layout['text-field']) continue;
    const json = JSON.stringify(l.layout['text-field']);
    if (!json.includes('name_en')) continue;
    try { map.setLayoutProperty(l.id, 'text-field', JSON.parse(json.replace(rx, '["coalesce",["get","name:es"],["get","$1"]]'))); } catch (_) { /* esa capa se queda como estaba */ }
  }
}

async function addLayers() {
  spanishLabels();
  mapReady = false; // hasta que las capas estén de nuevo
  const c = palette(), empty = { type: 'FeatureCollection', features: [] };
  map.addSource('regions', { type: 'geojson', data: regionsGeoData || empty });
  map.addLayer({ id: 'regions-fill', type: 'fill', source: 'regions', paint: { 'fill-color': c.accent, 'fill-opacity': ['case', ['==', ['get', 'id'], ['literal', S.region || '-']], 0.1, 0.01] } });
  map.addLayer({ id: 'regions-line', type: 'line', source: 'regions', paint: { 'line-color': c.line, 'line-width': 1 } });
  map.addSource('stations', { type: 'geojson', data: empty });
  map.addLayer({ id: 'stations', type: 'circle', source: 'stations', minzoom: 6,
    paint: { 'circle-color': c.stFill, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5, 13, 8], 'circle-stroke-color': c.stStroke, 'circle-stroke-width': 1.2 } });
  map.addLayer({ id: 'stations-alerts', type: 'circle', source: 'stations', filter: ['!=', ['get', 'flag'], 'ok'],
    paint: { 'circle-color': c.alert, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 6, 13, 9], 'circle-stroke-color': '#1c1c1f', 'circle-stroke-width': 1.6 } });
  map.addSource('trains', { type: 'geojson', data: empty });
  const est = ['==', ['get', 'est'], true];
  map.addLayer({ id: 'trains', type: 'circle', source: 'trains', paint: {
    'circle-color': ['case', est, '#ffffff', ['match', ['get', 'level'], 'green', COLORS.green, 'amber', COLORS.amber, 'red', COLORS.red, COLORS.gray]],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 6, 12, 9],
    'circle-stroke-color': ['case', est, c.estStroke, c.stroke], 'circle-stroke-width': ['case', est, 2.2, 1.4] } });
  mapReady = true;
  pushMap();
  if (!regionsGeoData) {
    try { regionsGeoData = await j('api/v1/regions/geo.json'); map.getSource('regions').setData(regionsGeoData); } catch (_) { /* se reintenta al cambiar de modo */ }
  }
}

function pushMap() {
  if (!map || !mapReady) return;
  try {
    const tr = map.getSource('trains'), st = map.getSource('stations');
    if (!tr || !st) return; // el estilo se está recargando: se reintenta en la próxima actualización
    let list = inRegion(S.trains);
    if (S.level) list = list.filter((t) => t.level === S.level && !estimated(t));
    tr.setData(trainsGeo(list));
    st.setData(stopsGeo(inRegion(S.stops)));
    map.setPaintProperty('regions-fill', 'fill-opacity', ['case', ['==', ['get', 'id'], ['literal', S.region || '-']], 0.1, 0.01]);
  } catch (e) { console.error('[mapa]', e); }
}

function fitRegion() {
  if (!map) return;
  const r = S.regions.find((x) => x.id === S.region);
  if (!r) return map.fitBounds(SPAIN, { padding: 20, duration: 600 });
  const [w, s, e, n] = r.bbox, pw = Math.max(0, 0.5 - (e - w)) / 2, ph = Math.max(0, 0.5 - (n - s)) / 2;
  map.fitBounds([[w - pw, s - ph], [e + pw, n + ph]], { padding: 30, duration: 600 });
}

function trainPopup(t) {
  const d = t.cancelled ? 'Cancelado' : t.delayMin == null ? 'sin retraso medido' : t.delayMin <= 0 ? 'Sin retraso' : '+' + t.delayMin + ' min';
  const lvl = estimated(t) ? 'Según horario' : { green: 'Puntual', amber: 'Retraso', red: 'Retraso grave', gray: 'Sin datos' }[t.level];
  const basis = { exact: 'Posición GPS', schedule: 'Posición estimada según el horario (sin tiempo real)', interpolated: 'Posición estimada con el horario y el retraso medido' }[t.positionBasis] ?? 'Posición aproximada (última parada)';
  new maplibregl.Popup({ maxWidth: '300px' }).setLngLat([t.lon, t.lat]).setHTML(
    '<b>' + esc([t.line, t.label].filter(Boolean).join(' · ')) + '</b>' +
    (t.route ? '<div class="note">' + esc(t.route) + '</div>' : '') +
    '<div style="margin:6px 0;color:' + (COLORS[t.level] ?? '#fff') + ';font-weight:700">' + esc(lvl) + ' · ' + esc(d) + '</div>' +
    (t.stopName ? '<div>Última parada: ' + esc(t.stopName) + '</div>' : '') + '<div class="note">' + basis + '</div>').addTo(map);
}

function renderCounters() {
  const list = inRegion(S.trains).filter((t) => !estimated(t));
  $('#counters').innerHTML = [['green', 'Puntuales'], ['amber', 'Retraso'], ['red', 'Graves'], ['gray', 'Sin dato']].map(([l, label]) =>
    '<div class="counter' + (S.level === l ? ' on' : '') + '" data-act="level" data-v="' + l + '"><b><span class="dot" style="background:' + COLORS[l] + '"></span>' +
    list.filter((t) => t.level === l).length + '</b><span>' + label + '</span></div>').join('');
}

// ---------- Retrasos ----------
function renderDelays() {
  const el = $('#tab-delays');
  const reg = inRegion(S.trains);
  const pool = S.service ? reg.filter((t) => t.service === S.service) : reg;
  const measured = pool.filter((t) => t.level !== 'gray' || t.cancelled);
  const groups = { cancelled: [], severe: [], moderate: [] };
  for (const t of pool) { const s = sevOf(t); if (s) groups[s].push(t); }
  for (const k in groups) groups[k].sort((a, b) => (b.delayMin ?? 0) - (a.delayMin ?? 0));
  const total = groups.cancelled.length + groups.severe.length + groups.moderate.length;
  const nums = [...groups.severe, ...groups.moderate].map((t) => t.delayMin ?? 0);
  const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  const worst = Math.max(0, ...nums);
  const pct = measured.length ? Math.round((total * 100) / measured.length) : 0;
  const onTime = measured.filter((t) => t.level === 'green' && !t.cancelled).length;

  const counts = {};
  for (const t of reg) if (sevOf(t)) counts[t.service] = (counts[t.service] || 0) + 1;
  const svc = ['<button class="chip' + (!S.service ? ' on' : '') + '" data-act="service" data-v=""><b>' + delayed(reg).length + '</b><small>Todas</small></button>']
    .concat(Object.entries(SERVICES).map(([k, label]) => '<button class="chip' + (S.service === k ? ' on' : '') + '" data-act="service" data-v="' + k + '"><b>' + (k === 'sfm' ? '—' : counts[k] || 0) + '</b><small>' + label + '</small></button>')).join('');

  const parts = [['Puntuales', onTime, COLORS.green], ['Moderados', groups.moderate.length, COLORS.amber], ['Graves', groups.severe.length, COLORS.red], ['Cancelados', groups.cancelled.length, SEV.cancelled.dot]];
  const bar = measured.length ? '<div class="bar">' + parts.filter((p) => p[1] > 0).map((p) => '<div style="flex:' + p[1] + ';background:' + p[2] + '"></div>').join('') + '</div><div class="legend">' +
    parts.map((p) => '<span><span class="dot" style="background:' + p[2] + '"></span><b>' + p[1] + '</b> ' + p[0] + '</span>').join('') + '</div>' : '<div class="note">Sin trenes con datos en tiempo real.</div>';

  let byRegion = '';
  if (!S.region && total) {
    const m = {};
    for (const t of pool) if (sevOf(t) && t.region) { (m[t.region] ??= { n: 0, bad: 0 }).n++; if (sevOf(t) !== 'moderate') m[t.region].bad++; }
    const top = Object.entries(m).sort((a, b) => b[1].n - a[1].n).slice(0, 7), max = top[0]?.[1].n || 1;
    byRegion = '<div class="card"><h3>Comunidades más afectadas</h3>' + top.map(([id, v]) => '<div class="rbar" data-act="region" data-v="' + id + '"><span>' + esc(regionName(id)) + '</span><div class="track"><i style="width:' +
      (v.n / max) * 100 + '%"></i><u style="width:' + (v.bad / max) * 100 + '%"></u></div><b>' + v.n + '</b></div>').join('') +
      '<div class="note">Naranja: con retraso · Rojo: graves o cancelados · Toca una para filtrar</div></div>';
  }
  const estNote = reg.some(estimated) && (S.region === 'illes-balears' || S.service === 'sfm')
    ? '<div class="card"><b style="color:var(--yellow)">Mallorca: sin retrasos en tiempo real</b><div class="note">SFM y el Consorcio de Transportes no publican retrasos. Se muestran los horarios oficiales y la posición estimada de cada tren (anillo blanco en el mapa).</div></div>' : '';

  const sevBtn = (key, label, n, dot) => '<button class="seg' + (S.sev === key ? ' on' : '') + '" data-act="sev" data-v="' + (key ?? '') + '"><b>' + n + '</b><small><span class="dot" style="background:' + dot + '"></span>' + label + '</small></button>';
  const shown = S.sev ? [S.sev] : ['cancelled', 'severe', 'moderate'];
  let cards = '', count = 0;
  for (const k of shown) {
    if (!groups[k].length) continue;
    cards += '<h2 class="sec" style="color:' + SEV[k].color + '">' + SEV[k].title + ' (' + groups[k].length + ') <span class="note">' + SEV[k].hint + '</span></h2>';
    for (const t of groups[k]) {
      if (count++ >= 150) break;
      const col = SEV[k].color, d = t.delayMin ?? 0;
      cards += '<div class="dcard" data-act="train" data-v="' + esc(t.tripId) + '"><div class="badge" style="background:' + col + '29;color:' + col + '">' +
        (k === 'cancelled' ? '⛔<small>Cancel.</small>' : '+' + d + '<small>min</small>') + '</div><div class="dbody"><div class="t">' +
        (SERVICES[t.service] ? '<span class="tag">' + SERVICES[t.service] + '</span>' : '') + esc([t.line, t.label].filter(Boolean).join(' · ')) + '</div>' +
        (t.route ? '<div class="m">' + esc(t.route) + '</div>' : '') + '<div class="m">' + esc([t.stopName && 'Última parada: ' + t.stopName, regionName(t.region)].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="pbar"><i style="width:' + (k === 'cancelled' ? 100 : Math.min(100, Math.max(4, (d / 90) * 100))) + '%;background:' + col + '"></i></div></div></div>';
    }
  }
  if (!count) cards = '<div class="note">' + (total ? 'No hay trenes con esta gravedad.' : 'No hay retrasos con este filtro.') + '</div>';
  else if (count > 150) cards += '<div class="note">Mostrando los 150 con más retraso.</div>';

  el.innerHTML = '<div class="grid s4">' + svc + '</div><div class="note" style="margin:-4px 0 12px">Compañías con datos abiertos: Renfe, SFM, Euskotren, Metro Bilbao, FGC y TMB (próximos trenes).</div>' + estNote +
    '<div class="grid k4"><div class="kpi"><b>' + measured.length + '</b><small>En circulación</small></div><div class="kpi"><b style="color:' + (total ? COLORS.amber : COLORS.green) + '">' + total +
    '</b><small>Con retraso (' + pct + ' %)</small></div><div class="kpi"><b>' + avg + ' min</b><small>Retraso medio</small></div><div class="kpi"><b style="color:' + (worst >= 15 ? COLORS.red : 'inherit') + '">' + worst + ' min</b><small>Máximo</small></div></div>' +
    '<div class="card"><h3>Estado de los trenes</h3>' + bar + '</div>' + byRegion +
    '<div class="grid k4">' + sevBtn(null, 'Todos', total, '#9a9aa2') + sevBtn('cancelled', 'Cancelados', groups.cancelled.length, SEV.cancelled.dot) + sevBtn('severe', 'Graves', groups.severe.length, SEV.severe.dot) + sevBtn('moderate', 'Moderados', groups.moderate.length, SEV.moderate.dot) + '</div>' + cards;
  $('#n-delays').textContent = delayed(reg).length || '';
}

// ---------- Avisos ----------
function renderAlerts() {
  const el = $('#tab-alerts');
  const rank = (a) => (a.stationInaccessible || a.severity === 'critical' ? 0 : a.severity === 'warning' ? 1 : 2);
  const all = S.alerts.filter((a) => !S.region || a.regions.includes(S.region));
  const list = all.filter((a) => !S.cat || a.category === S.cat).sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || rank(a) - rank(b));
  const icon = (a) => (a.category === 'accessibility' ? (a.accessibility?.element === 'elevator' ? '🛗' : a.accessibility?.element === 'escalator' ? '↕️' : a.stationInaccessible ? '🚫' : '♿') : CAT_ICON[a.category] ?? 'ℹ️');
  el.innerHTML = '<div class="row"><b>' + list.length + ' aviso' + (list.length === 1 ? '' : 's') + '</b><span class="note">' + esc(S.region ? regionName(S.region) : 'Toda España') + '</span></div>' +
    '<div class="grid c7">' + CATS.map(([k, label, ic]) => '<button class="chip' + (S.cat === k ? ' on' : '') + '" data-act="cat" data-v="' + (k ?? '') + '"><b>' + ic + '</b><small>' + label + '</small></button>').join('') + '</div>' +
    (list.length ? list.map((a) => {
      const col = a.stationInaccessible || a.severity === 'critical' ? COLORS.red : a.category === 'accessibility' ? '#ffd60a' : a.severity === 'warning' ? COLORS.amber : '#9a9aa2';
      const since = !a.active && a.activeFrom ? '<div style="color:var(--yellow);font-size:11px;font-weight:700">Desde el ' + new Date(a.activeFrom * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + '</div>' : '';
      const tags = [...a.lines, ...a.stationNames].map((x) => '<span>' + esc(x) + '</span>').join('');
      return '<div class="acard"><div class="aicon" style="color:' + col + '">' + icon(a) + '</div><div>' + since + '<div>' + esc(a.text) + '</div>' + (tags ? '<div class="tags">' + tags + '</div>' : '') + '</div></div>';
    }).join('') : '<div class="note">No hay avisos con este filtro.</div>');
  $('#n-alerts').textContent = all.filter((a) => a.active && a.severity !== 'info').length || '';
}

// ---------- Estaciones ----------
function renderStations() {
  const el = $('#tab-stations');
  const base = inRegion(S.stops);
  const pool = S.onlyAlerts ? base.filter((s) => s.alerts > 0) : base;
  const q = norm(S.q.trim());
  const mark = (s) => (s.accessibility ? '♿🚫' : s.alerts > 0 ? '⚠️' : '');
  let body = '';
  if (q.length >= 2) {
    const res = pool.filter((s) => norm(s.name).includes(q)).sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q))).slice(0, 80);
    body = '<div class="note">' + res.length + ' resultado' + (res.length === 1 ? '' : 's') + '</div>' + res.map((s) => '<div class="st" data-act="station" data-v="' + esc(s.id) + '"><span>' + (s.metro ? ico(s) + ' ' : '') + esc(s.name) + ' <span class="note">' + esc(s.province ?? '') + '</span></span><span>' + mark(s) + '</span></div>').join('');
  } else {
    // Árbol: comunidad -> provincia -> estación
    const tree = {};
    for (const s of pool) ((tree[s.region ?? '_fuera'] ??= {})[s.province ?? 'Fuera de España'] ??= []).push(s);
    const rName = (id) => (id === '_fuera' ? 'Fuera de España' : regionName(id));
    const cnt = (list) => { const n = list.filter((s) => s.alerts > 0).length; return (n ? '⚠️ ' + n + ' · ' : '') + list.length; };
    const outLast = (a, b) => (a === '_fuera' || a === 'Fuera de España') - (b === '_fuera' || b === 'Fuera de España');
    body = Object.keys(tree).sort((a, b) => outLast(a, b) || rName(a).localeCompare(rName(b), 'es')).map((rid) => {
      const provs = tree[rid], pkeys = Object.keys(provs).sort((a, b) => outLast(a, b) || a.localeCompare(b, 'es'));
      const all = pkeys.flatMap((p) => provs[p]);
      const inner = pkeys.map((p) => {
        const l = provs[p].sort((a, b) => Number(b.alerts > 0) - Number(a.alerts > 0) || a.name.localeCompare(b.name, 'es'));
        const open = S.onlyAlerts || pkeys.length === 1;
        return '<details class="prov"' + (open ? ' open' : '') + '><summary><span>' + esc(p) + '</span><em>' + cnt(l) + '</em></summary>' +
          l.map((s) => '<div class="st" data-act="station" data-v="' + esc(s.id) + '"><span>' + ico(s) + ' ' + esc(s.name) + '</span><span>' + mark(s) + '</span></div>').join('') + '</details>';
      }).join('');
      return '<details class="comm"' + (S.region || S.onlyAlerts ? ' open' : '') + '><summary><span>📍 ' + esc(rName(rid)) + '</span><em>' + cnt(all) + '</em></summary>' + inner + '</details>';
    }).join('');
  }
  el.innerHTML = '<div class="row"><input type="search" id="q" placeholder="Buscar estación…" value="' + esc(S.q) + '" style="flex:1;min-width:180px"><label><input type="checkbox" id="only" ' + (S.onlyAlerts ? 'checked' : '') + '> Con avisos</label></div>' +
    '<div class="note" style="margin-bottom:8px">' + pool.length + ' estaciones' + (S.onlyAlerts ? ' con avisos' : ' · ' + base.filter((s) => s.alerts > 0).length + ' con avisos') + '</div>' + body;
}

const TMB = '<svg width="16" height="16" viewBox="0 0 20 20" style="vertical-align:-3px" aria-label="Metro TMB"><path d="M10 0l10 10-10 10L0 10z" fill="#DA291C"/><text x="10" y="10.6" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">M</text></svg>';
const ico = (s) => (s.id.startsWith('tmb-') ? TMB : s.metro ? 'Ⓜ️' : '🚉');

async function openStation(s) {
  const d = $('#detail'), body = $('#detail-body');
  d.hidden = false;
  body.innerHTML = '<h3>' + (s.metro ? ico(s) + ' ' : '') + esc(s.name) + '</h3><div class="note">Cargando…</div>';
  let b;
  try { b = await j('api/v1/stations/' + (s.key ?? s.id) + '/board.json'); } catch (e) { b = { departures: [], arrivals: [], alerts: [], accessibility: {}, empty: true }; }
  const acc = b.accessibility ?? {};
  const accHtml = [acc.stationInaccessible && '🚫 Estación inaccesible', acc.elevatorsOut && '🛗 ' + acc.elevatorsOut + ' ascensor(es) fuera de servicio', acc.escalatorsOut && '↕️ ' + acc.escalatorsOut + ' escalera(s)'].filter(Boolean).join('<br>');
  const now = Math.floor(Date.now() / 1000);
  const rows = (list) => list.filter((r) => !r.expectedEpoch || r.expectedEpoch >= now - 90).map((r) => {
    const st = { cancelled: '<span style="color:var(--red)">⛔ Cancelado</span>', skipped: '<span style="color:var(--red)">Sin parada</span>', delayed: '<span style="color:' + COLORS[r.level] + '">+' + r.delayMin + ' min</span>', on_time: '<span style="color:' + COLORS.green + '">A tiempo</span>', scheduled: '<span class="note">Horario</span>' }[r.status];
    return '<tr><td class="time">' + esc(r.expectedTime) + (r.status === 'delayed' ? '<s>' + esc(r.scheduledTime) + '</s>' : '') + '</td><td>' + (r.line ? '<span class="tag">' + esc(r.line) + '</span>' : '') + esc(r.otherEnd ?? '—') + '</td><td>' + st + '</td></tr>';
  }).join('');
  const table = (id, list) => '<table id="' + id + '"' + (id === 'arr' ? ' hidden' : '') + '>' + (rows(list) || '<tr><td class="note">Sin trenes en las próximas horas</td></tr>') + '</table>';
  body.innerHTML = '<h3>' + (s.metro ? ico(s) + ' ' : '') + esc(s.name) + '</h3>' + (accHtml ? '<div class="card" style="padding:8px 12px">' + accHtml + '</div>' : '') +
    (b.alerts ?? []).map((a) => '<div class="note" style="margin-bottom:6px">' + esc(a.text) + '</div>').join('') +
    '<div class="row"><button class="chip on" id="bt-dep" data-act="board" data-v="dep">Salidas</button><button class="chip" id="bt-arr" data-act="board" data-v="arr">Llegadas</button></div>' +
    table('dep', b.departures ?? []) + table('arr', b.arrivals ?? []) + '<div class="note" style="margin-top:8px">Horarios oficiales con el retraso conocido en la última actualización.</div>';
  if (mapReady && S.tab === 'map') map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 12) });
}

// ---------- Seguridad ----------
const LV = {
  critical: { label: 'CRÍTICO', color: '#ff453a' },
  warning: { label: 'ATENCIÓN', color: '#ff9f0a' },
  info: { label: 'INFORMACIÓN', color: '#8e8e93' },
};
const KIND_ICON = { accident: '🚨', signalling: '🚦', track: '🛤️', power: '⚡', closing_in: '🚆', stopped_train: '🚆', cascade: '⚠️' };
const ORIGINAL_TITLE = document.title;
let titleTimer = null;

async function loadSafety() {
  try {
    const d = await fetchJson('api/v1/safety.json', 15000);
    S.safety = d.signals ?? []; S.safetyNote = d.note ?? ''; S.safetyStats = d.stats ?? null; S.safetyLoaded = true;
  } catch (_) { /* se conservan las últimas señales; el siguiente intento es en 15 s */ }
  handleSafety();
}

const criticals = () => S.safety.filter((x) => x.severity === 'critical');
const unseen = () => criticals().filter((x) => !S.safetyAcked.has(x.id));

function handleSafety() {
  const n = S.safety.filter((x) => x.severity !== 'info').length;
  const b = $('#n-safety'); if (b) b.textContent = n || '';
  // Avisos del navegador solo para críticas que no se hayan notificado en las últimas 6 h
  const seen = JSON.parse(localStorage.getItem('anden_notified') || '{}'); const now = Date.now();
  for (const k of Object.keys(seen)) if (now - seen[k] > 6 * 3600e3) delete seen[k];
  for (const sig of criticals()) {
    if (seen[sig.id]) continue;
    seen[sig.id] = now;
    browserNotify(sig);
  }
  localStorage.setItem('anden_notified', JSON.stringify(seen));
  if (S.tab === 'safety') criticals().forEach((x) => S.safetyAcked.add(x.id));
  renderSafety(); renderBanner();
}

function renderBanner() {
  const el = $('#crit-banner'); const u = unseen();
  const show = u.length > 0 && S.tab !== 'safety';
  el.hidden = !show;
  $('#tab-btn-safety').classList.toggle('blink', u.length > 0 && S.tab !== 'safety');
  // El título de la pestaña del navegador también parpadea mientras haya una crítica sin revisar
  if (u.length && !titleTimer) {
    let on = false;
    titleTimer = setInterval(() => { on = !on; document.title = on ? '⚠ ALERTA CRÍTICA · Andén' : ORIGINAL_TITLE; }, 1000);
  } else if (!u.length && titleTimer) { clearInterval(titleTimer); titleTimer = null; document.title = ORIGINAL_TITLE; }
  if (!show) return;
  const f = u[0];
  el.innerHTML = '<div class="ic">⚠️</div><div class="tx"><div class="k">ALERTA CRÍTICA' + (u.length > 1 ? ' · ' + u.length + ' activas' : '') + '</div><div class="t">' + esc(f.title) +
    '</div><div class="d">' + esc(f.detail) + '</div><div class="go">Toca para ver en Seguridad</div></div><button class="x" data-act="ack-safety" aria-label="Descartar">✕</button>';
  el.dataset.act = 'open-safety';
}

function renderSafety() {
  const el = $('#tab-safety'); if (!el) return;
  const all = S.safety;
  const list = S.safetyLevel ? all.filter((x) => x.severity === S.safetyLevel) : all;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const notifBtn = perm === 'granted' ? '<span class="note">🔔 Avisos del navegador activados (mientras la página esté abierta)</span>'
    : perm === 'denied' ? '<span class="note">Los avisos del navegador están bloqueados en este sitio (cámbialo en los ajustes del navegador).</span>'
    : perm === 'unsupported' ? ''
    : '<button class="btn" data-act="notif">🔔 Activar avisos del navegador</button>';
  const chips = all.length ? '<div class="row">' + [['', 'Todas', all.length], ['critical', 'Crítico', 0], ['warning', 'Atención', 0], ['info', 'Información', 0]].map(([k, label]) => {
    const c = k ? all.filter((x) => x.severity === k).length : all.length;
    return '<button class="chip' + ((S.safetyLevel ?? '') === k ? ' on' : '') + '" data-act="slevel" data-v="' + k + '"><b>' + c + '</b><small>' + label + '</small></button>';
  }).join('') + '</div>' : '';
  const body = !S.safetyLoaded ? '<div class="note">Cargando…</div>'
    : !all.length ? '<div class="okbox"><div class="ic">✅</div><div><b>Sin señales de riesgo ahora</b><div class="note">' +
        (S.safetyStats?.compared ? 'Se han comparado ' + S.safetyStats.compared + ' trenes con la actualización anterior.' : 'No hay trenes que comparar con la actualización anterior ahora mismo (por ejemplo, de madrugada).') + '</div></div></div>'
    : list.map((x) => {
        const lv = LV[x.severity] ?? LV.warning;
        const clickable = x.lat != null && x.lon != null;
        return '<div class="scard ' + esc(x.severity) + '"' + (clickable ? ' data-act="signal" data-v="' + esc(x.id) + '"' : '') + '><div class="ic">' + (KIND_ICON[x.kind] ?? '⚠️') + '</div><div><b>' + esc(x.title) + '</b><div class="note">' + esc(x.detail) +
          '</div><div class="lv" style="color:' + lv.color + '">' + lv.label + '</div></div></div>';
      }).join('');
  el.innerHTML = '<div class="row"><b>Seguridad</b><span class="note">Vigilancia con datos abiertos</span></div>' + (notifBtn ? '<div class="row">' + notifBtn + '</div>' : '') + chips + body +
    '<div class="snote">' + esc(S.safetyNote || 'Este panel no sustituye a la señalización ni a los sistemas del operador.') + '</div>';
}

function goSignal(id) {
  const sig = S.safety.find((x) => x.id === id); if (!sig) return;
  const t = [...(sig.tripIds ?? [])].reverse().map((tid) => S.trains.find((x) => x.tripId === tid)).find(Boolean);
  if (t) return goTrain(t.tripId);
  setTab('map');
  if (map && sig.lat != null) setTimeout(() => map.flyTo({ center: [sig.lon, sig.lat], zoom: 10 }), 50);
}

async function enableBrowserNotifications() {
  if (!('Notification' in window)) return;
  await Notification.requestPermission();
  renderSafety();
}

function browserNotify(sig) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('⚠ ' + sig.title, { body: sig.detail + '\nDatos abiertos, orientativos: sigue siempre las indicaciones del operador.', tag: sig.id, requireInteraction: true, icon: 'icon.png' });
    n.onclick = () => { window.focus(); setTab('safety'); n.close(); };
  } catch (_) { /* algunos navegadores solo permiten notificaciones desde un service worker */ }
}

// ---------- Interfaz ----------
function renderAll() {
  const sel = $('#region');
  if (sel.options.length <= 1 && S.regions.length) S.regions.forEach((r) => sel.add(new Option(r.name, r.id)));
  sel.value = S.region;
  // Cada parte va aislada: si una falla, las demás se siguen actualizando
  for (const f of [renderAge, renderCounters, pushMap, renderDelays, renderAlerts]) { try { f(); } catch (e) { console.error(e); } }
  // La lista de estaciones es grande: solo se redibuja si es la pestaña visible (o al cambiar de pestaña)
  if (S.tab === 'stations') renderStations();
}

function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['map', 'delays', 'alerts', 'stations', 'safety']) $('#tab-' + t).hidden = t !== tab;
  if (tab === 'safety') { S.safety.filter((x) => x.severity === 'critical').forEach((x) => S.safetyAcked.add(x.id)); renderSafety(); renderBanner(); }
  if (tab === 'stations') renderStations();
  if (tab === 'map' && map) setTimeout(() => map.resize(), 0);
}
function setRegion(id) { S.region = id || ''; renderAll(); fitRegion(); }
function goTrain(id) {
  const t = S.trains.find((x) => x.tripId === id); if (!t) return;
  setTab('map');
  if (!map) return;
  setTimeout(() => { map.flyTo({ center: [t.lon, t.lat], zoom: 9.5 }); trainPopup(t); }, 50);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.act) {
    case 'level': S.level = S.level === v ? null : v; renderCounters(); pushMap(); break;
    case 'service': S.service = v || null; renderDelays(); break;
    case 'sev': S.sev = S.sev === v || !v ? null : v; renderDelays(); break;
    case 'cat': S.cat = v || null; renderAlerts(); break;
    case 'region': setRegion(v); break;
    case 'slevel': S.safetyLevel = S.safetyLevel === v || !v ? null : v; renderSafety(); break;
    case 'open-safety': setTab('safety'); break;
    case 'ack-safety': S.safety.filter((x) => x.severity === 'critical').forEach((x) => S.safetyAcked.add(x.id)); renderBanner(); break;
    case 'notif': enableBrowserNotifications(); break;
    case 'signal': goSignal(v); break;
    case 'train': goTrain(v); break;
    case 'station': { const s = S.stops.find((x) => x.id === v); if (s) { setTab('map'); openStation(s); } break; }
    case 'board':
      $('#dep').hidden = v !== 'dep'; $('#arr').hidden = v !== 'arr';
      $('#bt-dep').classList.toggle('on', v === 'dep'); $('#bt-arr').classList.toggle('on', v === 'arr'); break;
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; const pos = e.target.selectionStart; renderStations(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); } });
document.addEventListener('change', (e) => { if (e.target.id === 'only') { S.onlyAlerts = e.target.checked; renderStations(); } });
$('#region').addEventListener('change', (e) => setRegion(e.target.value));
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
$('#detail-close').addEventListener('click', () => ($('#detail').hidden = true));

(async function start() {
  initMap();
  try { S.regions = (await j('api/v1/regions.json')).regions; } catch (_) { /* se reintenta con la siguiente carga */ }
  await loadAll();
  // Enlaces directos: #retrasos, #avisos, #estaciones
  const direct = { retrasos: 'delays', avisos: 'alerts', estaciones: 'stations', seguridad: 'safety' }[location.hash.slice(1)];
  if (direct) setTab(direct);
  setInterval(loadAll, REFRESH_MS);
  // Seguridad se consulta aparte y más a menudo (15 s): el fichero es pequeño y así se ve cuanto antes una alerta nueva.
  loadSafety();
  setInterval(loadSafety, 15000);
  setInterval(renderAge, 15000);
  setInterval(tickClock, 1000);
  // Las pestañas en segundo plano frenan los temporizadores: al volver (o recuperar la conexión) se actualiza al momento.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadAll(); loadSafety(); } });
  window.addEventListener('online', () => { loadAll(); loadSafety(); });
})();

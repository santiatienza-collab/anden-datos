#!/usr/bin/env node
// Andén - sondeo de fuentes de datos ferroviarios.
// Uso:  node tools/probe/probe.mjs [--json salida.json] [--only id1,id2]
// Sin dependencias (Node >= 18). Solo hace peticiones GET/HEAD de lectura.
//
// Para cada fuente comprueba: accesibilidad, latencia, tamaño, formato y
// frescura del dato (cuando es posible). Las URLs marcadas "candidate: true"
// son suposiciones por verificar: un fallo ahí no implica que la fuente no exista.

import { writeFileSync } from 'node:fs';

const UA = 'Anden-probe/0.1';
const TIMEOUT_MS = 25_000;
const NOW = () => Date.now() / 1000;

// ---------- utilidades de análisis ----------
const ageStr = (secs) => {
  if (secs == null || Number.isNaN(secs)) return 'n/d';
  const a = Math.round(secs);
  if (a < 0) return `futuro(${a}s)`;
  if (a < 120) return `${a}s`;
  if (a < 7200) return `${Math.round(a / 60)}min`;
  if (a < 172800) return `${Math.round(a / 3600)}h`;
  return `${Math.round(a / 86400)}d`;
};

// GTFS-RT en JSON: { header:{timestamp}, entity:[...] }
function analyseGtfsRtJson(json, kind) {
  const ts = Number(json?.header?.timestamp);
  const entities = Array.isArray(json?.entity) ? json.entity : [];
  const info = { entidades: entities.length };
  if (kind === 'trip') {
    const delays = entities
      .map((e) => e.tripUpdate?.delay ?? e.trip_update?.delay)
      .filter((d) => typeof d === 'number');
    if (delays.length) {
      info.conRetraso = delays.filter((d) => d > 300).length;
      info.retrasoMaxMin = Math.round(Math.max(...delays) / 60);
    }
  }
  return { ageSecs: ts ? NOW() - ts : null, info };
}

const jsonLen = (j) => (Array.isArray(j) ? j.length : j && typeof j === 'object' ? Object.keys(j).length : 0);

// ---------- definición de fuentes ----------
// kind: official | official-regional | third-party
const SOURCES = [
  // Renfe - tiempo real (GTFS-RT en JSON)
  {
    id: 'renfe-rt-vehicles', name: 'Renfe GTFS-RT posiciones', kind: 'official',
    url: 'https://gtfsrt.renfe.com/vehicle_positions.json', type: 'json',
    analyse: (j) => analyseGtfsRtJson(j, 'vehicle'),
  },
  {
    id: 'renfe-rt-trips', name: 'Renfe GTFS-RT retrasos', kind: 'official',
    url: 'https://gtfsrt.renfe.com/trip_updates.json', type: 'json',
    analyse: (j) => analyseGtfsRtJson(j, 'trip'),
  },
  {
    id: 'renfe-rt-alerts', name: 'Renfe GTFS-RT alertas', kind: 'official',
    url: 'https://gtfsrt.renfe.com/alerts.json', type: 'json',
    analyse: (j) => analyseGtfsRtJson(j, 'alert'),
  },
  // Renfe - horarios estáticos (solo cabeceras)
  {
    id: 'renfe-gtfs-ld', name: 'Renfe GTFS estático AV/LD/MD', kind: 'official',
    url: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip', type: 'head',
  },
  {
    id: 'renfe-gtfs-cercanias', name: 'Renfe GTFS estático Cercanías', kind: 'official',
    url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip', type: 'head',
  },
  // Portales oficiales (solo accesibilidad)
  {
    id: 'renfe-data-portal', name: 'Portal Renfe Data', kind: 'official',
    url: 'https://data.renfe.com/', type: 'head',
  },
  {
    id: 'nap-portal', get: true, name: 'NAP Ministerio de Transportes (requiere registro)', kind: 'official',
    url: 'https://nap.transportes.gob.es/', type: 'head',
  },
  {
    id: 'adif-ide-wfs', name: 'Adif IDEADIF WFS (infraestructura)', kind: 'official', candidate: true,
    url: 'https://ideadif.adif.es/services/wfs?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0', type: 'head',
  },
  {
    id: 'adif-avisos', name: 'Adif Avisos (web oficial, HTML)', kind: 'official',
    url: 'https://www.adif.es/viajeros/avisos', type: 'head', get: true,
  },
  {
    id: 'fgc-opendata', name: 'FGC datos abiertos (Opendatasoft)', kind: 'official-regional', candidate: true,
    url: 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets?limit=5', type: 'json',
    analyse: (j) => ({ ageSecs: null, info: { datasets: j?.total_count ?? jsonLen(j?.results) } }),
  },
  {
    id: 'euskadi-opendata', name: 'Open Data Euskadi (portal)', kind: 'official-regional',
    url: 'https://opendata.euskadi.eus/', type: 'head',
  },
  // RadarDeTrenes (no oficial; atribuir a Renfe, Adif y RadarDeTrenes)
  {
    id: 'rdt-ready', name: 'RadarDeTrenes /readyz', kind: 'third-party',
    url: 'https://radardetrenes.com/readyz', type: 'json',
    analyse: (j) => ({ ageSecs: null, info: j }),
  },
  {
    id: 'rdt-fleet', name: 'RadarDeTrenes flota (all)', kind: 'third-party',
    url: 'https://radardetrenes.com/api/v1/fleet?type=all', type: 'json',
    analyse: (j) => {
      const list = Array.isArray(j) ? j : j?.trains ?? j?.data ?? j?.items ?? [];
      return { ageSecs: null, info: { trenes: jsonLen(list), clavesRaiz: Object.keys(j ?? {}).slice(0, 6).join(',') } };
    },
  },
  {
    id: 'rdt-stations', name: 'RadarDeTrenes estaciones', kind: 'third-party',
    url: 'https://radardetrenes.com/api/v1/stations', type: 'json',
    analyse: (j) => ({ ageSecs: null, info: { estaciones: jsonLen(Array.isArray(j) ? j : j?.stations ?? j?.data ?? j) } }),
  },
  {
    id: 'rdt-board', name: 'RadarDeTrenes tablero (Madrid Atocha 60000)', kind: 'third-party', candidate: true,
    url: 'https://radardetrenes.com/api/v1/stations/60000/board-renfe', type: 'json',
    analyse: (j) => ({ ageSecs: null, info: { clavesRaiz: Object.keys(j ?? {}).slice(0, 8).join(',') } }),
  },
  {
    id: 'rdt-lines', name: 'RadarDeTrenes líneas Cercanías (meta)', kind: 'third-party',
    url: 'https://radardetrenes.com/api/v1/lines/meta', type: 'json',
    analyse: (j) => ({ ageSecs: null, info: { lineas: jsonLen(Array.isArray(j) ? j : j?.lines ?? j?.data ?? j) } }),
  },
];

// ---------- ejecución ----------
async function probe(src) {
  const res = { id: src.id, name: src.name, kind: src.kind, url: src.url, candidate: !!src.candidate };
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const method = src.type === 'head' && !src.get ? 'HEAD' : 'GET';
    const r = await fetch(src.url, {
      method,
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: src.type === 'json' ? 'application/json' : '*/*' },
    });
    res.status = r.status;
    res.contentType = r.headers.get('content-type');
    res.lastModified = r.headers.get('last-modified');
    res.contentLength = r.headers.get('content-length');
    if (src.type === 'json' && r.ok) {
      const text = await res_text(r);
      res.bytes = text.length;
      try {
        const j = JSON.parse(text);
        const a = src.analyse ? src.analyse(j) : { ageSecs: null, info: {} };
        res.ageSecs = a.ageSecs;
        res.info = a.info;
        res.ok = true;
      } catch (e) {
        res.ok = false;
        res.error = `JSON inválido: ${e.message}`;
      }
    } else {
      res.ok = r.ok;
      if (!r.ok) res.error = `HTTP ${r.status}`;
      if (r.ok && res.lastModified) res.ageSecs = NOW() - Date.parse(res.lastModified) / 1000;
    }
  } catch (e) {
    res.ok = false;
    res.error = e.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : `${e.cause?.code ?? ''} ${e.message}`.trim();
  } finally {
    clearTimeout(timer);
    res.ms = Math.round(performance.now() - t0);
  }
  return res;
}
const res_text = (r) => r.text();

function verdict(r) {
  if (!r.ok) return r.candidate ? 'FALLO?' : 'FALLO';
  if (r.ageSecs != null && r.ageSecs > 600 && /rt-|fleet/.test(r.id)) return 'VIEJO';
  return 'OK';
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = arg('--only')?.split(',');
const list = only ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES;
console.log(`Sondeando ${list.length} fuentes (${new Date().toISOString()})...\n`);

const results = await Promise.all(list.map(probe));

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
console.log(pad('ESTADO', 8), pad('TIPO', 17), pad('FUENTE', 50), pad('HTTP', 5), pad('ms', 6), pad('edad', 7), 'detalle');
console.log('-'.repeat(130));
for (const r of results) {
  const detail = r.error ?? (r.info ? JSON.stringify(r.info) : r.contentType ?? '');
  console.log(pad(verdict(r), 8), pad(r.kind, 17), pad(r.name, 50), pad(r.status ?? '-', 5), pad(r.ms, 6), pad(ageStr(r.ageSecs), 7), detail.slice(0, 80));
}
console.log('\nFALLO? = URL candidata sin verificar; revisa la URL en la documentación oficial antes de descartarla.');

const out = arg('--json');
if (out) {
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`Resultados guardados en ${out}`);
}

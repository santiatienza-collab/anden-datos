// Genera la API como ficheros estáticos (una "instantánea") para publicarla en GitHub Pages.
// Uso: node src/snapshot.ts [carpeta_de_salida]   (por defecto ../site)
// Lo ejecuta GitHub Actions cada pocos minutos; cada ejecución descarga los feeds, calcula todo y escribe JSON.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Store } from './store.ts';
import { loadTmb } from './tmb.ts';
import {
  alertsResponse, boardResponse, stopKey, healthResponse, regionsGeoResponse, regionsResponse,
  statusResponse, stopsResponse, trainsResponse,
} from './api.ts';

const out = process.argv[2] ?? join(import.meta.dirname, '..', '..', 'site');
const now = Math.floor(Date.now() / 1000);

async function write(rel: string, body: unknown): Promise<number> {
  const file = join(out, rel);
  await mkdir(dirname(file), { recursive: true });
  const text = JSON.stringify(body);
  await writeFile(file, text);
  return text.length;
}

const store = new Store();
console.log('Cargando horarios (GTFS)…');
await store.refreshStatic({ awaitIndex: true });
console.log('Cargando tiempo real…');
await store.refreshRealtime();

// Si Renfe no responde, mejor no publicar datos vacíos que sustituyan a los últimos buenos.
const critical = ['renfe-rt-cercanias-trips', 'renfe-rt-ld-trips', 'renfe-alerts'];
const failed = critical.filter((k) => store.health[k]?.lastError || !store.health[k]?.lastOkAt);
if (failed.length === critical.length) {
  console.error('Todas las fuentes de tiempo real fallan: no se publica la instantánea.', store.health);
  process.exit(1);
}

// Metro de Barcelona (opcional: necesita TMB_APP_ID / TMB_APP_KEY). Un fallo aquí no afecta al resto.
let tmbBoards = new Map<string, any[]>();
try {
  const tmb = await loadTmb(now);
  if (tmb) {
    for (const s of tmb.stops) store.stops.set(s.id, s);
    tmbBoards = tmb.boards;
    store.health['tmb-itransit'] = { count: tmb.stops.length, lastOkAt: now };
  }
} catch (e) {
  store.health['tmb-itransit'] = { lastError: (e as Error).message, lastOkAt: store.health['tmb-itransit']?.lastOkAt };
  console.error('[tmb]', (e as Error).message);
}

await rm(out, { recursive: true, force: true });
let bytes = 0;
bytes += await write('api/v1/trains.json', trainsResponse(store, now));
bytes += await write('api/v1/alerts.json', alertsResponse(store, now));
bytes += await write('api/v1/stops.json', stopsResponse(store));
bytes += await write('api/v1/regions.json', regionsResponse());
bytes += await write('api/v1/regions/geo.json', regionsGeoResponse());
bytes += await write('api/v1/status.json', statusResponse(store, now));
bytes += await write('health.json', healthResponse(store, now));

let boards = 0;
for (const id of store.stops.keys()) {
  const b = boardResponse(store, id, now);
  if (!b || (b.departures.length === 0 && b.arrivals.length === 0 && b.alerts.length === 0)) continue;
  bytes += await write(`api/v1/stations/${stopKey(id)}/board.json`, b);
  boards++;
}

const allStops = new Map(stopsResponse(store).stops.map((x) => [x.id, x]));
for (const [sid, rows] of tmbBoards) {
  const info = allStops.get(sid);
  if (!info) continue;
  bytes += await write(`api/v1/stations/${stopKey(sid)}/board.json`, {
    generatedAt: now, station: info, scheduleReady: true,
    accessibility: { stationInaccessible: false, elevatorsOut: 0, escalatorsOut: 0, otherOut: 0 },
    alerts: [], departures: rows.slice(0, 30), arrivals: rows.slice(0, 30),
  });
  boards++;
}

await writeFile(join(out, '.nojekyll'), '');
await writeFile(join(out, 'datos.html'), `<!doctype html><meta charset="utf-8"><title>Andén · índice de datos</title>
<style>body{font:16px system-ui;background:#1c1c1f;color:#f5f5f7;max-width:40rem;margin:3rem auto;padding:0 1rem}a{color:#ffd60a}</style>
<h1>Andén · datos de trenes</h1>
<p>Instantánea generada el ${new Date(now * 1000).toISOString()}.</p>
<ul><li><a href="api/v1/trains.json">trains.json</a></li><li><a href="api/v1/alerts.json">alerts.json</a></li>
<li><a href="api/v1/stops.json">stops.json</a></li><li><a href="health.json">health.json</a></li></ul>
<p>Datos: Renfe (CC BY 4.0), Consorci de Transports de Mallorca (CC BY 4.0). Mapa: © OpenStreetMap contributors.</p>`);

console.log(`Instantánea escrita en ${out}: ${boards} estaciones con tablero, ${(bytes / 1e6).toFixed(1)} MB`);
console.log('Trenes:', trainsResponse(store, now).trains.length, '· avisos:', alertsResponse(store, now).alerts.length);

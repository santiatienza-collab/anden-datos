// Servidor de desarrollo local. En producción no se usa: los mismos cuerpos de respuesta se generan como
// ficheros estáticos con `npm run snapshot` y se publican en GitHub Pages.
import { createServer, type ServerResponse } from 'node:http';
import { Store } from './store.ts';
import { searchStops } from './schedule.ts';
import {
  alertsResponse, boardResponse, stopKey, healthResponse, regionsGeoResponse, regionsResponse,
  statusResponse, stopsResponse, trainsResponse,
} from './api.ts';

const PORT = Number(process.env.PORT ?? 8080);
const RT_EVERY_MS = 20_000;
const STATIC_EVERY_MS = 6 * 3600_000;
const store = new Store();

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=5',
  });
  res.end(JSON.stringify(body));
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  // Acepta las rutas con o sin ".json" para que la app funcione igual contra el servidor local y contra GitHub Pages.
  const p = url.pathname.replace(/\/+$/, '').replace(/\.json$/, '') || '/';
  const now = Math.floor(Date.now() / 1000);

  if (p === '/health') return json(res, healthResponse(store, now));
  if (p === '/api/v1/status') return json(res, statusResponse(store, now));
  if (p === '/api/v1/trains') return json(res, trainsResponse(store, now));
  if (p === '/api/v1/alerts') return json(res, alertsResponse(store, now));
  if (p === '/api/v1/stops') return json(res, stopsResponse(store));
  if (p === '/api/v1/regions') return json(res, regionsResponse());
  if (p === '/api/v1/regions/geo') return json(res, regionsGeoResponse());
  if (p === '/api/v1/stations/search') return json(res, { stations: searchStops(store.stops, url.searchParams.get('q') ?? '') });
  const st = p.match(new RegExp('^/api/v1/stations/([^/]+)/board$'));
  if (st) {
    const wanted = decodeURIComponent(st[1]);
    const id = store.stops.has(wanted) ? wanted : [...store.stops.keys()].find((k) => stopKey(k) === wanted);
    const b = id ? boardResponse(store, id, now) : null;
    return b ? json(res, b) : json(res, { error: 'station_not_found' }, 404);
  }
  json(res, { error: 'not_found' }, 404);
});

async function loop(fn: () => Promise<void>, every: number, name: string) {
  for (;;) {
    try { await fn(); } catch (e) { console.error(`[${name}]`, (e as Error).message); }
    await new Promise((r) => setTimeout(r, every));
  }
}

server.listen(PORT, () => console.log(`Andén backend (desarrollo) en http://localhost:${PORT}`));
// Primero lo estático (necesario para unir), luego tiempo real en bucle.
store.refreshStatic().then(() => {
  loop(() => store.refreshRealtime(), RT_EVERY_MS, 'realtime');
  setInterval(() => store.refreshStatic().catch(() => {}), STATIC_EVERY_MS);
});

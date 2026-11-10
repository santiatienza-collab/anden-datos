import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { parseCsv } from './csv.ts';
import type { Network, Route, Stop, Trip } from './model.ts';
import { buildCalendar, type Calendar } from './calendar.ts';

export interface StaticFeed {
  network: Network;
  url: string;
  /** Si la URL cambia en cada publicación, se obtiene aquí la vigente (url es el respaldo). */
  resolveUrl?: () => Promise<string>;
  /** Solo trenes y metro (route_type 1 y 2); el resto del GTFS (autobuses) se descarta. */
  railOnly?: boolean;
  /** Prefijo para los ids (evita choques con los de otras fuentes). */
  prefix?: string;
  /** Guarda en memoria el recorrido horario de cada viaje (feeds pequeños): permite calcular retrasos y estimar posiciones. */
  keepSchedule?: boolean;
}

const CTM_PAGE = 'https://www.tib.org/es/sobre-ctm/portal-de-transparencia/datos-abiertos';

/** El Consorcio de Transportes de Mallorca cambia la URL del zip en cada publicación: se lee de su portal. */
async function resolveCtmUrl(): Promise<string> {
  const res = await fetch(CTM_PAGE, { headers: { 'User-Agent': 'Anden-backend/0.1' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`portal CTM: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/href="([^"]*ctm-mallorca-es\.zip[^"]*)"/);
  if (!m) throw new Error('portal CTM: enlace al GTFS no encontrado');
  return new URL(m[1].replace(/&amp;/g, '&'), 'https://www.tib.org').toString();
}

export const STATIC_FEEDS: Record<string, StaticFeed> = {
  'renfe-gtfs-cercanias': {
    network: 'cercanias',
    url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
  },
  'renfe-gtfs-ld': {
    network: 'ld',
    url: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  },
  'ctm-mallorca': {
    network: 'mallorca',
    url: 'https://www.tib.org/documents/20124/478141/ctm-mallorca-es.zip',
    resolveUrl: resolveCtmUrl,
    railOnly: true,
    prefix: 'ctm-',
  },
  // Operadores con datos abiertos y tiempo real (GTFS + GTFS-RT en protobuf)
  'euskotren-gtfs': {
    network: 'euskotren',
    url: 'https://opendata.euskadi.eus/transport/moveuskadi/euskotren/gtfs_euskotren.zip',
    keepSchedule: true,
    prefix: 'eus-',
  },
  'metrobilbao-gtfs': {
    network: 'metrobilbao',
    url: 'https://opendata.euskadi.eus/transport/moveuskadi/metro_bilbao/gtfs_metro_bilbao.zip',
    keepSchedule: true,
    prefix: 'mbi-',
  },
  'fgc-gtfs': {
    network: 'fgc',
    url: 'https://www.fgc.cat/google/google_transit.zip',
    keepSchedule: true,
    prefix: 'fgc-',
  },
};

/** Parada de un viaje con sus horas (segundos desde medianoche del día de servicio). */
export interface ScheduledStop {
  stopId: string;
  arr: number;
  dep: number;
}

export interface StaticData {
  stops: Map<string, Stop>;
  routes: Map<string, Route>;
  trips: Map<string, Trip>;
  /** shapeId -> [[lat, lon], ...] (vacío si el feed no trae shapes.txt, p.ej. larga distancia). */
  shapes: Map<string, [number, number][]>;
  calendar: Calendar;
  /** Solo feeds pequeños (railOnly): recorrido horario de cada viaje, para estimar posiciones. */
  scheduled?: Map<string, ScheduledStop[]>;
  /** Andenes -> estación (ids con prefijo), para unir el tiempo real con las estaciones. */
  stopAlias: Map<string, string>;
  /** Cómo indexar stop_times de este feed (prefijo, viajes permitidos y andenes agrupados en su estación). */
  indexOpts: { prefix?: string; tripFilter?: Set<string>; stopMap?: Map<string, string> };
  /** Hash y ruta del zip: el índice de horarios solo se reconstruye si cambia. */
  zipHash: string;
  zipPath: string;
  fetchedAt: number;
}

const CACHE_DIR = join(import.meta.dirname, '..', 'data', 'cache');
const BASE_FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'shapes.txt', 'calendar.txt', 'calendar_dates.txt'];

const sha1 = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');

async function download(id: string, feed: StaticFeed): Promise<{ buf: Uint8Array; path: string }> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${id}.zip`);
  try {
    const url = feed.resolveUrl ? await feed.resolveUrl().catch(() => feed.url) : feed.url;
    const res = await fetch(url, { headers: { 'User-Agent': 'Anden-backend/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('la respuesta no es un zip');
    // Solo se reescribe si cambió.
    const old = await readFile(file).catch(() => null);
    if (!old || sha1(old) !== sha1(buf)) await writeFile(file, buf);
    return { buf, path: file };
  } catch (e) {
    // Sin red o error del origen: usar la última copia buena (y avisar vía staleness).
    const age = await stat(file).then((s) => Date.now() - s.mtimeMs).catch(() => null);
    if (age == null) throw new Error(`descarga fallida (${(e as Error).message}) y sin caché de ${id}`);
    console.warn(`[gtfs] ${id}: usando caché de hace ${Math.round(age / 3600000)}h (${(e as Error).message})`);
    return { buf: new Uint8Array(await readFile(file)), path: file };
  }
}

const toSec = (t: string): number | null => {
  const m = t.match(/^(\d+):(\d\d):(\d\d)$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export async function loadStatic(id: string): Promise<StaticData> {
  const feed = STATIC_FEEDS[id];
  if (!feed) throw new Error(`feed estático desconocido: ${id}`);
  const { buf: zip, path: zipPath } = await download(id, feed);
  const zipHash = sha1(zip);
  const needSchedule = !!(feed.railOnly || feed.keepSchedule);
  const wanted = new Set(needSchedule ? [...BASE_FILES, 'stop_times.txt'] : BASE_FILES);
  const files = unzipSync(zip, { filter: (f) => wanted.has(f.name) });
  const text = (n: string) => (files[n] ? strFromU8(files[n]) : '');
  const px = feed.prefix ?? '';
  const P = (s: string) => px + s;

  // Paradas con estación padre (andenes): se agrupan en su estación, que es lo que se muestra al usuario.
  const stopRows = parseCsv(text('stops.txt'));
  const parentIds = new Set(stopRows.filter((r) => r.location_type === '1').map((r) => r.stop_id));
  const rawAlias = new Map<string, string>();
  for (const r of stopRows) if (r.parent_station && parentIds.has(r.parent_station)) rawAlias.set(r.stop_id, r.parent_station);

  // Rutas (en feeds railOnly, solo metro y tren)
  const routes = new Map<string, Route>();
  const railRoutes = new Set<string>();
  for (const r of parseCsv(text('routes.txt'))) {
    if (!r.route_id) continue;
    if (feed.railOnly && r.route_type !== '1' && r.route_type !== '2') continue;
    railRoutes.add(r.route_id);
    routes.set(P(r.route_id), {
      id: P(r.route_id),
      shortName: r.route_short_name || (feed.network === 'metrobilbao' ? 'Metro' : r.route_long_name),
      longName: (r.route_long_name ?? '').replace(/\s+/g, ' '),
      color: r.route_color ? `#${r.route_color}` : undefined,
      network: feed.network,
    });
  }
  // Viajes
  const trips = new Map<string, Trip>();
  const rawTrips = new Set<string>();
  const usedShapes = new Set<string>();
  for (const r of parseCsv(text('trips.txt'))) {
    if (!r.trip_id) continue;
    if (feed.railOnly && !railRoutes.has(r.route_id)) continue;
    rawTrips.add(r.trip_id);
    if (r.shape_id) usedShapes.add(r.shape_id);
    trips.set(P(r.trip_id), { routeId: P(r.route_id), serviceId: r.service_id, shapeId: r.shape_id ? P(r.shape_id) : undefined });
  }
  // Recorrido horario (solo feeds pequeños) y paradas realmente usadas
  let scheduled: Map<string, ScheduledStop[]> | undefined;
  const usedStops = new Set<string>();
  if (needSchedule) {
    scheduled = new Map();
    const tmp = new Map<string, { seq: number; s: ScheduledStop }[]>();
    for (const r of parseCsv(text('stop_times.txt'))) {
      if (!rawTrips.has(r.trip_id)) continue;
      const arr = toSec(r.arrival_time), dep = toSec(r.departure_time);
      const t = dep ?? arr;
      if (t == null) continue;
      const sid = rawAlias.get(r.stop_id) ?? r.stop_id;
      usedStops.add(sid);
      const a = tmp.get(r.trip_id) ?? [];
      a.push({ seq: Number(r.stop_sequence), s: { stopId: P(sid), arr: arr ?? t, dep: t } });
      tmp.set(r.trip_id, a);
    }
    for (const [k, a] of tmp) scheduled.set(P(k), a.sort((x, y) => x.seq - y.seq).map((x) => x.s));
  }
  // Paradas
  const stops = new Map<string, Stop>();
  for (const r of stopRows) {
    const lat = Number(r.stop_lat), lon = Number(r.stop_lon);
    if (!r.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (rawAlias.has(r.stop_id)) continue; // andén: se muestra su estación
    if (feed.railOnly && !usedStops.has(r.stop_id)) continue;
    // Los nombres del CTM llevan sufijos ("Inca Estació (302)") que sobran en un tablero de estación.
    const name = feed.railOnly ? r.stop_name.replace(/\s*\(\d+\)\s*$/, '').replace(/\s+Estaci[oó]n?$/, '') : r.stop_name;
    stops.set(P(r.stop_id), { id: P(r.stop_id), name, lat, lon });
  }
  // Trazados
  const shapes = new Map<string, [number, number][]>();
  const pts = new Map<string, { seq: number; p: [number, number] }[]>();
  for (const r of parseCsv(text('shapes.txt'))) {
    if (feed.railOnly && !usedShapes.has(r.shape_id)) continue;
    const arr = pts.get(r.shape_id) ?? [];
    arr.push({ seq: Number(r.shape_pt_sequence), p: [Number(r.shape_pt_lat), Number(r.shape_pt_lon)] });
    pts.set(r.shape_id, arr);
  }
  for (const [k, arr] of pts) shapes.set(P(k), arr.sort((a, b) => a.seq - b.seq).map((x) => x.p));

  const calendar = buildCalendar(parseCsv(text('calendar.txt')), parseCsv(text('calendar_dates.txt')));
  return {
    stops, routes, trips, shapes, calendar, scheduled,
    stopAlias: new Map([...rawAlias].map(([c, p]) => [P(c), P(p)])),
    indexOpts: { prefix: feed.prefix, tripFilter: feed.railOnly ? rawTrips : undefined, stopMap: rawAlias.size ? rawAlias : undefined },
    zipHash, zipPath, fetchedAt: Date.now() / 1000,
  };
}

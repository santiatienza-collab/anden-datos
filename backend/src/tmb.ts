// Metro de Barcelona (TMB). API iTransit: próximos trenes por estación y sentido, en tiempo real.
// Requiere credenciales personales gratuitas (developer.tmb.cat) en TMB_APP_ID y TMB_APP_KEY; sin ellas se omite.
// Es una predicción de llegada, no un retraso medido: el metro opera por frecuencia y TMB no publica horario GTFS abierto,
// así que no hay semáforo de retraso para estos trenes.
import type { Stop } from './model.ts';

const API = 'https://api.tmb.cat/v1';

async function get(path: string, auth: string): Promise<any> {
  // El error nunca incluye la URL: lleva las credenciales.
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${auth}`, {
    headers: { 'User-Agent': 'Anden-backend/0.1', Accept: 'application/json' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`TMB ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

const hhmm = (epoch: number) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(epoch * 1000));

/** Devuelve las estaciones de metro y su tablero de próximos trenes, o null si no hay credenciales. */
export async function loadTmb(now: number): Promise<{ stops: Stop[]; boards: Map<string, any[]> } | null> {
  const id = process.env.TMB_APP_ID, key = process.env.TMB_APP_KEY;
  if (!id || !key) return null;
  const auth = `app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}`;

  const live = await get('/itransit/metro/estacions', auth);
  const lineCodes: number[] = [...new Set<number>((live.linies ?? []).map((l: any) => l.codi_linia))];

  const stops = new Map<string, Stop>();
  // En los enlaces TMB da una estación por línea: se fusionan las del mismo nombre y a menos de ~400 m.
  const alias = new Map<string, string>();
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (const code of lineCodes) {
    let fc: any;
    try { fc = await get(`/transit/linies/metro/${code}/estacions`, auth); } catch { continue; } // p. ej. funicular sin estaciones
    for (const f of fc.features ?? []) {
      const p = f.properties, [lon, lat] = f.geometry.coordinates;
      const sid = `tmb-${p.CODI_ESTACIO}`;
      if (stops.has(sid) || alias.has(sid)) continue;
      const twin = [...stops.values()].find((o) => norm(o.name) === norm(p.NOM_ESTACIO) && Math.abs(o.lat - lat) < 0.004 && Math.abs(o.lon - lon) < 0.004);
      if (twin) alias.set(sid, twin.id);
      else stops.set(sid, { id: sid, name: p.NOM_ESTACIO, lat, lon });
    }
  }

  const boards = new Map<string, any[]>();
  for (const l of live.linies ?? []) {
    for (const e of l.estacions ?? []) {
      const raw = `tmb-${e.codi_estacio}`;
      const sid = alias.get(raw) ?? raw;
      if (!stops.has(sid)) continue;
      for (const t of e.linies_trajectes ?? []) {
        for (const n of t.propers_trens ?? []) {
          const epoch = Math.round(n.temps_arribada / 1000);
          if (epoch < now - 30) continue;
          const row = {
            tripId: `tmb-${n.codi_servei}`, line: t.nom_linia, otherEnd: t.desti_trajecte, network: 'tmb',
            scheduledEpoch: epoch, scheduledTime: hhmm(epoch), delayMin: null,
            expectedEpoch: epoch, expectedTime: hhmm(epoch), status: 'scheduled', level: 'gray',
          };
          (boards.get(sid) ?? boards.set(sid, []).get(sid)!).push(row);
        }
      }
    }
  }
  for (const rows of boards.values()) rows.sort((a, b) => a.expectedEpoch - b.expectedEpoch);
  return { stops: [...stops.values()], boards };
}

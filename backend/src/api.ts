// Cuerpos de respuesta de la API. Los usan el servidor (desarrollo) y el generador de instantáneas
// estáticas (producción en GitHub Pages), de modo que ambos devuelven exactamente lo mismo.
import { regionList, regionsGeoJson } from './regions.ts';
import { board } from './schedule.ts';
import type { Store } from './store.ts';

/** Renfe a veces publica el mismo aviso varias veces con ids distintos: se deja uno. */
export function dedupeAlerts<T extends { text: string; stopIds: string[]; routeIds: string[] }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = [a.text.replace(/\s+/g, ' ').trim(), [...a.stopIds].sort().join(','), [...a.routeIds].sort().join(',')].join('|');
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/** Clave de una estación apta para nombres de fichero y URLs (los ids de algunos operadores llevan ":"). */
export const stopKey = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_');

export function trainsResponse(store: Store, now: number) {
  // Renfe a veces publica el mismo tren con dos identificadores de viaje (de dos días distintos): se deja el más reciente.
  const best = new Map<string, ReturnType<Store['trainsWithLevel']>[number]>();
  for (const t of store.trainsWithLevel(now)) {
    const key = `${t.service}|${t.line ?? ''}|${t.label}`;
    const cur = best.get(key);
    if (!cur || t.updatedAt > cur.updatedAt) best.set(key, t);
  }
  return { generatedAt: now, trains: [...best.values()] };
}

export function alertsResponse(store: Store, now: number) {
  // Renfe también reutiliza el mismo id para avisos distintos: aquí se garantiza que cada id es único.
  const used = new Map<string, number>();
  const alerts = dedupeAlerts(store.alerts).map((a) => {
    const d = store.describeAlert(a, now);
    const n = used.get(d.id) ?? 0;
    used.set(d.id, n + 1);
    return n === 0 ? d : { ...d, id: `${d.id}~${n}` };
  });
  return { generatedAt: now, attribution: 'Datos: Renfe (CC BY 4.0). Severidad estimada a partir del texto.', alerts };
}

export function stopsResponse(store: Store) {
  // Marca estaciones con avisos activos (para iconos en el mapa).
  const flagged = new Map<string, { alerts: number; accessibility: boolean }>();
  for (const a of store.alerts) {
    for (const sid of a.stopIds) {
      const f = flagged.get(sid) ?? { alerts: 0, accessibility: false };
      f.alerts++;
      if (a.category === 'accessibility' && a.accessibility?.state === 'out') f.accessibility = true;
      flagged.set(sid, f);
    }
  }
  return {
    stops: [...store.stops.values()].map((s) => ({
      ...s, key: stopKey(s.id), metro: /^(tmb|mbi)-/.test(s.id), region: store.stopRegion(s), province: store.stopProvince(s), ...(flagged.get(s.id) ?? { alerts: 0, accessibility: false }),
    })),
  };
}

/** Tablero de una estación: salidas y llegadas juntas (un solo fichero por estación en la versión estática). */
export function boardResponse(store: Store, id: string, now: number, limit = 30) {
  const stop = store.stops.get(id);
  if (!stop) return null;
  const feeds = store.feedIndexes();
  const indexing = Object.values(store.scheduleState).some((s) => s === 'indexing');
  const ctx = { feeds, trips: store.trips, routes: store.routes, stops: store.stops, delays: store.delays };
  return {
    generatedAt: now,
    station: stop,
    // Si los horarios aún se están indexando, la lista puede estar incompleta.
    scheduleReady: feeds.length > 0 && !indexing,
    accessibility: store.accessibilitySummary(id, now),
    alerts: store.alertsForStop(id, now).map((a) => ({
      id: a.id, text: a.text, category: a.category, severity: a.severity, accessibility: a.accessibility,
    })),
    departures: feeds.length ? board(ctx, id, 'departures', now, limit) : [],
    arrivals: feeds.length ? board(ctx, id, 'arrivals', now, limit) : [],
  };
}

export function healthResponse(store: Store, now: number) {
  return {
    now,
    sources: Object.fromEntries(Object.entries(store.health).map(([k, h]) => [
      k, { ...h, feedAgeSec: h.feedTimestamp ? now - h.feedTimestamp : null },
    ])),
    join: store.joinQuality(),
  };
}

export function statusResponse(store: Store, now: number) {
  const routes = store.routes;
  return {
    generatedAt: now,
    routes: store.statuses(now).map((s) => ({ ...s, name: routes.get(s.routeId)?.longName, shortName: routes.get(s.routeId)?.shortName })),
  };
}

export const regionsResponse = () => ({ regions: regionList() });
export const regionsGeoResponse = () => regionsGeoJson();

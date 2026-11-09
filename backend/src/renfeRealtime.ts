import type { AccessibilityInfo, Alert, AlertCategory, Severity, Stop, TrainPosition, Trip, TripDelay } from './model.ts';

const BASE = 'https://gtfsrt.renfe.com/';
export const RT_URLS = {
  'cercanias-vehicles': BASE + 'vehicle_positions.json',
  'cercanias-trips': BASE + 'trip_updates.json',
  'ld-vehicles': BASE + 'vehicle_positions_LD.json',
  'ld-trips': BASE + 'trip_updates_LD.json',
  alerts: BASE + 'alerts.json',
} as const;

type Network = 'cercanias' | 'ld';

interface Feed<E> {
  /** Epoch seg. de cabecera. */
  timestamp: number;
  entities: E[];
}

export async function fetchFeed(url: string): Promise<Feed<any>> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Anden-backend/0.1' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const j: any = await res.json();
  return { timestamp: Number(j?.header?.timestamp) || 0, entities: Array.isArray(j?.entity) ? j.entity : [] };
}

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : undefined;
};

export function parseTripUpdates(feed: Feed<any>, network: Network, trips: Map<string, Trip>): TripDelay[] {
  const out: TripDelay[] = [];
  for (const e of feed.entities) {
    const tu = e.tripUpdate;
    const tripId: string | undefined = tu?.trip?.tripId?.trim();
    if (!tripId) continue;
    const stu: any[] = tu.stopTimeUpdate ?? [];
    // Retraso: el del viaje; si falta, el del último stopTimeUpdate con dato.
    let delay = num(tu.delay);
    if (delay == null) {
      for (let i = stu.length - 1; i >= 0 && delay == null; i--) delay = num(stu[i].arrival?.delay ?? stu[i].departure?.delay);
    }
    out.push({
      tripId,
      routeId: trips.get(tripId)?.routeId ?? tu.trip?.routeId,
      delaySec: delay ?? 0,
      cancelled: tu.trip?.scheduleRelationship === 'CANCELED',
      skippedStops: stu.filter((s) => s.scheduleRelationship === 'SKIPPED').map((s) => String(s.stopId)),
      updatedAt: feed.timestamp,
      network,
    });
  }
  return out;
}

export function parseVehicles(
  feed: Feed<any>,
  network: Network,
  trips: Map<string, Trip>,
  stops: Map<string, Stop>,
  delays: Map<string, TripDelay>,
): TrainPosition[] {
  const out: TrainPosition[] = [];
  for (const e of feed.entities) {
    const v = e.vehicle;
    const tripId: string | undefined = v?.trip?.tripId?.trim();
    if (!tripId) continue;
    const lat = num(v.position?.latitude), lon = num(v.position?.longitude);
    const stopId: string | undefined = v.stopId?.trim();
    const stop = stopId ? stops.get(stopId) : undefined;
    let basis: TrainPosition['positionBasis'] = 'none';
    let plat = lat, plon = lon;
    if (lat != null && lon != null) basis = 'exact';
    else if (stop) { plat = stop.lat; plon = stop.lon; basis = 'stop'; }
    out.push({
      tripId,
      routeId: trips.get(tripId)?.routeId,
      label: v.vehicle?.label ?? v.vehicle?.id ?? tripId,
      lat: plat, lon: plon, positionBasis: basis,
      stopId, status: v.currentStatus,
      delaySec: delays.get(tripId)?.delaySec,
      // Marca de tiempo propia del vehículo si existe; si no, la de la cabecera.
      updatedAt: num(v.timestamp) ?? feed.timestamp,
      network,
    });
  }
  return out;
}

// --- Alertas ---------------------------------------------------------------
// Los feeds de Renfe NO traen cause/effect: la severidad sale del texto. Es una
// heurística (severityBasis = 'text-heuristic'); el texto original se conserva siempre.
const CRITICAL = /suspendid|interrump|cortad[oa]s?|cortes? (total|de la circulaci)|sin servicio|no hay servicio|servicio suspendido|accidente|descarrilam|arrollamiento/i;
const WARNING = /retras|huelga|paros?\b|obras|frecuencias? (de paso )?modificad|modificaci[oó]n|incidencia|aver[ií]a|servicio alternativo|autobus|limitaci[oó]n|desv[ií]o|supresi[oó]n|supriment/i;

// Accesibilidad (ascensores, escaleras): afecta a PMR, no a la circulación.
const ACCESSIBILITY = /ascensor|escaleras? mec[aá]nicas?|inaccesible|accesibilidad/i;

export function classify(text: string): Severity {
  if (ACCESSIBILITY.test(text) && !/circulaci[oó]n|interrump|suspendid/i.test(text)) return "info";
  if (CRITICAL.test(text)) return 'critical';
  if (WARNING.test(text)) return 'warning';
  return 'info';
}

export function categorize(text: string): { category: AlertCategory; accessibility?: AccessibilityInfo } {
  if (ACCESSIBILITY.test(text) && !/circulaci[oó]n|interrump/i.test(text)) {
    const element: AccessibilityInfo["element"] = /ascensor/i.test(text) ? "elevator"
      : /escaleras? mec/i.test(text) ? "escalator"
      : /plataforma|rampa|paso inferior/i.test(text) ? "platform"
      : /estaci[oó]n[^.]*inaccesible|inaccesible/i.test(text) ? "station" : "other";
    return {
      category: "accessibility",
      accessibility: {
        element,
        stationInaccessible: /(estaci[oó]n[^.]*(se encuentra|queda) inaccesible|inaccesible)/i.test(text),
        state: /restablec|vuelve a|de nuevo operativ|ya (est[aá]|funciona)/i.test(text) ? "restored" : "out",
      },
    };
  }
  if (/huelga|paros?(?![a-z])/i.test(text)) return { category: "strike" };
  if (/autob[uú]s|servicio alternativo|plan alternativo/i.test(text)) return { category: "bus" };
  if (/obras|mantenimiento|reforma/i.test(text)) return { category: "works" };
  if (/interrump|suspendid|incidencia|aver[ií]a|retras|cortad/i.test(text)) return { category: "disruption" };
  return { category: "other" };
}

export function parseAlerts(feed: Feed<any>): Alert[] {
  const out: Alert[] = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a) continue;
    const text: string = (a.descriptionText?.translation ?? []).find((t: any) => t.language === 'es')?.text
      ?? a.descriptionText?.translation?.[0]?.text ?? a.headerText?.translation?.[0]?.text ?? '';
    const ents: any[] = a.informedEntity ?? [];
    const period = (a.activePeriod ?? [])[0];
    out.push({
      id: String(e.id),
      routeIds: [...new Set(ents.map((x) => x.routeId?.trim()).filter(Boolean))] as string[],
      stopIds: [...new Set(ents.map((x) => x.stopId?.trim()).filter(Boolean))] as string[],
      text: text.trim(),
      activeFrom: num(period?.start),
      activeTo: num(period?.end),
      severity: classify(text),
      ...categorize(text),
      severityBasis: 'text-heuristic',
      updatedAt: feed.timestamp,
    });
  }
  return out;
}

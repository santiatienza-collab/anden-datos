import type { AccessibilityInfo, Alert, AlertCategory, Network, Severity, Stop, TrainPosition, Trip, TripDelay } from './model.ts';

const BASE = 'https://gtfsrt.renfe.com/';
export const RT_URLS = {
  'cercanias-vehicles': BASE + 'vehicle_positions.json',
  'cercanias-trips': BASE + 'trip_updates.json',
  'ld-vehicles': BASE + 'vehicle_positions_LD.json',
  'ld-trips': BASE + 'trip_updates_LD.json',
  alerts: BASE + 'alerts.json',
} as const;

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

/** Opciones para operadores distintos de Renfe (Euskotren, Metro Bilbao, FGC…). */
export interface ParseOpts {
  /** Prefijo de los ids de este operador en el GTFS estático (p. ej. "eus-"). */
  prefix?: string;
  /** Paradas hijas (andenes) -> estación; ids ya con prefijo. */
  stopAlias?: Map<string, string>;
  /**
   * Hora prevista (epoch s) de un viaje en una parada. Se usa para calcular el retraso cuando el feed solo
   * trae horas previstas y no minutos de retraso (Euskotren, Metro Bilbao, FGC).
   */
  scheduledEpoch?: (tripKey: string, stopKey: string, startDate: string | undefined, predicted: number) => number | undefined;
}

const MAX_PLAUSIBLE_DELAY = 6 * 3600; // un retraso mayor suele indicar que el viaje no encaja con el horario

export function parseTripUpdates(feed: Feed<any>, network: Network, trips: Map<string, Trip>, opts: ParseOpts = {}): TripDelay[] {
  const px = opts.prefix ?? '';
  const alias = (id: string) => opts.stopAlias?.get(id) ?? id;
  const out: TripDelay[] = [];
  for (const e of feed.entities) {
    const tu = e.tripUpdate;
    const raw: string | undefined = tu?.trip?.tripId?.trim();
    if (!raw) continue;
    const tripId = px + raw;
    const stu: any[] = tu.stopTimeUpdate ?? [];
    // Retraso: el del viaje; si falta, el del último stopTimeUpdate con dato.
    let delay = num(tu.delay);
    if (delay == null) {
      for (let i = stu.length - 1; i >= 0 && delay == null; i--) delay = num(stu[i].arrival?.delay ?? stu[i].departure?.delay);
    }
    // Si el feed solo trae horas: retraso = hora prevista por el feed - hora del horario, en la primera parada con dato.
    if (delay == null && opts.scheduledEpoch) {
      for (const u of stu) {
        const t = num(u.arrival?.time ?? u.departure?.time);
        if (t == null || u.stopId == null) continue;
        const sched = opts.scheduledEpoch(tripId, alias(px + String(u.stopId).trim()), tu.trip?.startDate, t);
        if (sched != null) { delay = t - sched; break; }
      }
    }
    if (delay != null && Math.abs(delay) > MAX_PLAUSIBLE_DELAY) delay = undefined;
    out.push({
      tripId,
      routeId: trips.get(tripId)?.routeId ?? (tu.trip?.routeId ? px + tu.trip.routeId : undefined),
      delaySec: delay ?? 0,
      cancelled: tu.trip?.scheduleRelationship === 'CANCELED',
      skippedStops: stu.filter((x) => x.scheduleRelationship === 'SKIPPED').map((x) => alias(px + String(x.stopId))),
      updatedAt: feed.timestamp,
      network,
      // Sin dato de retraso medible no se afirma "puntual": se deja sin medir.
      measured: delay != null,
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
  opts: ParseOpts = {},
): TrainPosition[] {
  const px = opts.prefix ?? '';
  const alias = (id: string) => opts.stopAlias?.get(id) ?? id;
  const out: TrainPosition[] = [];
  for (const e of feed.entities) {
    const v = e.vehicle;
    const raw: string | undefined = v?.trip?.tripId?.trim();
    if (!raw) continue;
    const tripId = px + raw;
    const lat = num(v.position?.latitude), lon = num(v.position?.longitude);
    const stopId: string | undefined = v.stopId ? alias(px + String(v.stopId).trim()) : undefined;
    const stop = stopId ? stops.get(stopId) : undefined;
    let basis: TrainPosition['positionBasis'] = 'none';
    let plat = lat, plon = lon;
    if (lat != null && lon != null) basis = 'exact';
    else if (stop) { plat = stop.lat; plon = stop.lon; basis = 'stop'; }
    out.push({
      tripId,
      routeId: trips.get(tripId)?.routeId,
      label: v.vehicle?.label ?? v.vehicle?.id ?? raw,
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
const CRITICAL = /suspendid|suspes|sense servei|servei interromput|tallada|interromp|interrump|cortad[oa]s?|cortes? (total|de la circulaci)|sin servicio|no hay servicio|servicio suspendido|accidente|accident|descarrilam|arrollamiento/i;
const WARNING = /retras|retard|vaga|obres|incid[eè]ncia|avaria|servei alternatiu|modificaci[oó] del servei|huelga|paros?\b|obras|frecuencias? (de paso )?modificad|modificaci[oó]n|incidencia|aver[ií]a|servicio alternativo|autobus|limitaci[oó]n|desv[ií]o|supresi[oó]n|supriment/i;

// Accesibilidad (ascensores, escaleras): afecta a PMR, no a la circulación.
const ACCESSIBILITY = /ascensor|escaleras? mec[aá]nicas?|escales mec[aà]niques|inaccesible|inaccessible|accesibilidad|accessibilitat/i;

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
  if (/huelga|vaga|greba|paros?(?![a-z])/i.test(text)) return { category: "strike" };
  if (/autob[uú]s|servicio alternativo|plan alternativo/i.test(text)) return { category: "bus" };
  if (/obras|obres|manteniment|mantenimiento|reforma/i.test(text)) return { category: "works" };
  if (/interromp|interrump|suspes|suspendid|incid[eè]ncia|aver[ií]a|avaria|retras|retard|cortad|tallada/i.test(text)) return { category: "disruption" };
  return { category: "other" };
}

const LANG_ORDER = ['es', 'ca', 'eu', 'en'];

function pickText(t: any): string {
  const tr: any[] = t?.translation ?? [];
  for (const l of LANG_ORDER) {
    const hit = tr.find((x) => String(x.language ?? '').toLowerCase().startsWith(l));
    if (hit?.text) return hit.text;
  }
  return tr[0]?.text ?? '';
}

export function parseAlerts(feed: Feed<any>, opts: ParseOpts = {}): Alert[] {
  const px = opts.prefix ?? '';
  const alias = (id: string) => opts.stopAlias?.get(id) ?? id;
  const out: Alert[] = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a) continue;
    const text: string = pickText(a.descriptionText) || pickText(a.headerText);
    const ents: any[] = a.informedEntity ?? [];
    const period = (a.activePeriod ?? [])[0];
    out.push({
      id: px + String(e.id),
      routeIds: [...new Set(ents.map((x) => x.routeId?.trim()).filter(Boolean).map((x: string) => px + x))] as string[],
      stopIds: [...new Set(ents.map((x) => x.stopId?.trim()).filter(Boolean).map((x: string) => alias(px + x)))] as string[],
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

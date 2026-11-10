// Señales de seguridad a partir de los datos abiertos. NO es un sistema de señalización ni de protección de trenes:
// solo vigila, con datos públicos y retrasados, situaciones que merecen atención humana.
//
// Qué mira (inspirado en lo que se sabe de Adamuz —rotura de carril— y Urda —fallo de señalización con un tren detenido
// en vía alcanzado por otro—):
//   · tren detenido en vía abierta (fuera de estación) varios minutos;
//   · tren en marcha que se acerca por detrás a uno detenido, en el mismo corredor;
//   · avisos oficiales de accidente, fallo de señalización, rotura/incidencia de vía o falta de energía;
//   · acumulación de trenes muy retrasados en una misma línea (posible bloqueo).
// Límites: posiciones con unos minutos de retraso (y estimadas en larga distancia), sin velocidad real ni vía/sentido,
// y Iryo, Ouigo y Alvia/AVE de otras compañías no publican datos abiertos: lo que no se ve, no se vigila.

export type SignalKind = 'closing_in' | 'stopped_train' | 'accident' | 'signalling' | 'track' | 'power' | 'cascade';

export interface SafetySignal {
  id: string;
  kind: SignalKind;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  lat?: number;
  lon?: number;
  region?: string;
  tripIds: string[];
  routeIds: string[];
  alertId?: string;
  /** Epoch seg. desde el que se observa la situación (si se conoce). */
  since?: number;
}

export interface SafetyTrain {
  tripId: string;
  label: string;
  line?: string;
  routeId?: string;
  lat?: number;
  lon?: number;
  positionBasis: string;
  status?: string;
  stopId?: string;
  updatedAt: number;
  delayMin?: number | null;
  level?: string;
  region?: string | null;
  company?: string;
}

export interface SafetyAlert {
  id: string;
  text: string;
  active: boolean;
  routeIds: string[];
  regions?: string[];
  stops?: { lat: number; lon: number }[];
  lines?: string[];
}

export interface PrevTrain { lat: number; lon: number; updatedAt: number }

export interface SafetyInput {
  now: number;
  trains: SafetyTrain[];
  alerts: SafetyAlert[];
  /** Instantánea anterior (para comparar posiciones). */
  prev?: { generatedAt: number; trains: Map<string, PrevTrain> };
  stops: Map<string, { lat: number; lon: number; name: string }>;
}

/** Tiempos y distancias de decisión. Se dejan explícitos para poder ajustarlos con datos reales. */
export const SAFETY = {
  /** Parado = no se ha movido más de esto entre dos instantáneas… */
  stoppedMaxMoveKm: 0.15,
  /** …y el feed ha avanzado al menos esto (si no, es dato congelado, no tren parado). */
  stoppedMinSec: 120,
  /** Para avisar solo por "detenido" hace falta más tiempo. */
  stoppedAloneSec: 240,
  /** Cerca de su próxima parada se considera espera normal en cabecera/andén. */
  nearStopKm: 0.6,
  /** Un tren "en marcha" se ha desplazado al menos esto. */
  movingMinKm: 0.3,
  approachRangeKm: 20,
  /** Desviación lateral máxima respecto a la trayectoria para considerar el mismo corredor. */
  lateralKm: 0.5,
  maxAngleDeg: 30,
  /** Crítico solo si llegaría en menos de esto Y está a menos de esta distancia (evita falsos críticos a decenas de km). */
  criticalEtaMin: 10,
  criticalDistKm: 10,
  prevMinAgeSec: 120,
  prevMaxAgeSec: 1200,
  cascadeMinTrains: 5,
  cascadeMinRatio: 0.5,
  cascadeDelayMin: 15,
};

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Vector (este, norte) en km de a a b, plano local (válido para distancias cortas). */
function vec(aLat: number, aLon: number, bLat: number, bLon: number): [number, number] {
  return [rad(bLon - aLon) * R * Math.cos(rad((aLat + bLat) / 2)), rad(bLat - aLat) * R];
}

// ── Avisos oficiales ────────────────────────────────────────────────────────────────────────────────────────────
const RE = {
  accident: /accidente|colisi[oó]n|choque|descarril|arrollad|atropell|incendio\b|evacuaci[oó]n|accident\b/i,
  signalling: /se[ñn]aliza|senyalitzaci|enclavamiento|enclavament|\bLZB\b|ERTMS|\bASFA\b|\bCTC\b|bloqueo (de )?v[ií]a|sistema de (seguridad|frenado)|gesti[oó]n manual/i,
  track: /rotura (de )?(carril|v[ií]a)|carril roto|trencament|hundimiento|desprendimiento|corrimiento|socav|v[ií]a (cortada|bloqueada)|incidencia (en|de) (la )?(v[ií]a|infraestructura)|inundaci[oó]n/i,
  power: /catenaria|sin (tensi[oó]n|energ[ií]a)|suministro el[eé]ctrico|corte de (luz|energ[ií]a|corriente)|falta de tensi[oó]n/i,
  halted: /interrump|suspend|cortad|detenid|sin circulaci|no hay circulaci|circulaci[oó]n (interrumpida|suspendida)/i,
};

export function classifyAlertText(text: string): { kind: SignalKind; severity: 'warning' | 'critical' } | null {
  const halted = RE.halted.test(text);
  if (RE.accident.test(text)) return { kind: 'accident', severity: 'critical' };
  if (RE.signalling.test(text)) return { kind: 'signalling', severity: halted ? 'critical' : 'warning' };
  if (RE.track.test(text)) return { kind: 'track', severity: halted ? 'critical' : 'warning' };
  if (RE.power.test(text)) return { kind: 'power', severity: halted ? 'critical' : 'warning' };
  return null;
}

const TITLES: Record<SignalKind, string> = {
  accident: 'Accidente o emergencia',
  signalling: 'Fallo de señalización',
  track: 'Incidencia en la vía',
  power: 'Fallo de energía',
  closing_in: 'Tren acercándose a otro detenido',
  stopped_train: 'Tren detenido en vía',
  cascade: 'Posible bloqueo de línea',
};

function alertSignals(alerts: SafetyAlert[]): SafetySignal[] {
  const out: SafetySignal[] = [];
  const seen = new Set<string>();
  for (const a of alerts) {
    if (!a.active) continue;
    const c = classifyAlertText(a.text);
    if (!c) continue;
    const key = `${c.kind}|${a.text.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = a.stops?.[0];
    out.push({
      id: `alert:${a.id}`, kind: c.kind, severity: c.severity, title: TITLES[c.kind],
      detail: a.text.replace(/\s+/g, ' ').trim().slice(0, 280),
      lat: at?.lat, lon: at?.lon, region: a.regions?.[0], tripIds: [], routeIds: a.routeIds.slice(0, 6), alertId: a.id,
    });
  }
  return out;
}

// ── Trenes ──────────────────────────────────────────────────────────────────────────────────────────────────────
interface Tracked { t: SafetyTrain; prev: PrevTrain; moveKm: number; dtSec: number }

function track(input: SafetyInput): Tracked[] {
  const { prev, now } = input;
  if (!prev) return [];
  const age = now - prev.generatedAt;
  if (age < SAFETY.prevMinAgeSec || age > SAFETY.prevMaxAgeSec) return [];
  const out: Tracked[] = [];
  for (const t of input.trains) {
    if (t.positionBasis !== 'exact' || t.lat == null || t.lon == null) continue;
    const p = prev.trains.get(t.tripId);
    if (!p) continue;
    const dtSec = t.updatedAt - p.updatedAt;
    if (dtSec < SAFETY.stoppedMinSec) continue; // dato sin renovar: no se puede afirmar nada
    out.push({ t, prev: p, moveKm: distKm(p.lat, p.lon, t.lat, t.lon), dtSec });
  }
  return out;
}

const hhmmss = (s: number) => `${Math.round(s / 60)} min`;
const name = (t: SafetyTrain) => `${t.line ? t.line + ' ' : ''}${t.label}${t.company ? ' (' + t.company + ')' : ''}`;

/** En un andén, cabecera o apartadero: a menos de nearStopKm de su próxima parada o de cualquier estación conocida. */
function nearNextStop(t: SafetyTrain, stops: SafetyInput['stops']): boolean {
  const s = t.stopId ? stops.get(t.stopId) : undefined;
  if (s && distKm(t.lat!, t.lon!, s.lat, s.lon) < SAFETY.nearStopKm) return true;
  for (const o of stops.values()) {
    if (Math.abs(o.lat - t.lat!) > 0.01 || Math.abs(o.lon - t.lon!) > 0.015) continue; // filtro rápido (~1 km)
    if (distKm(t.lat!, t.lon!, o.lat, o.lon) < SAFETY.nearStopKm) return true;
  }
  return false;
}

export function trainSignals(input: SafetyInput): SafetySignal[] {
  const tracked = track(input);
  const out: SafetySignal[] = [];

  const stopped = tracked.filter((x) =>
    x.t.status !== 'STOPPED_AT' && x.moveKm <= SAFETY.stoppedMaxMoveKm && !nearNextStop(x.t, input.stops));
  const moving = tracked.filter((x) => x.moveKm >= SAFETY.movingMinKm);

  for (const s of stopped) {
    const closers: { m: Tracked; d: number; etaMin: number }[] = [];
    for (const m of moving) {
      if (m.t.tripId === s.t.tripId) continue;
      const d = distKm(m.t.lat!, m.t.lon!, s.t.lat!, s.t.lon!);
      const dPrev = distKm(m.prev.lat, m.prev.lon, s.t.lat!, s.t.lon!);
      if (d > SAFETY.approachRangeKm || dPrev - d < SAFETY.movingMinKm * 0.7) continue; // no se acerca
      const v = vec(m.prev.lat, m.prev.lon, m.t.lat!, m.t.lon!);            // su trayectoria
      const u = vec(m.t.lat!, m.t.lon!, s.t.lat!, s.t.lon!);                // hacia el detenido
      const vn = Math.hypot(...v), un = Math.hypot(...u);
      if (vn === 0 || un === 0) continue;
      const cos = (v[0] * u[0] + v[1] * u[1]) / (vn * un);
      if (cos < Math.cos(rad(SAFETY.maxAngleDeg))) continue;                 // no apunta hacia él
      if (Math.abs(v[0] * u[1] - v[1] * u[0]) / vn > SAFETY.lateralKm) continue; // otro corredor
      // Mismo sentido: la próxima parada del detenido debe quedar por delante, en la dirección del que llega.
      const stop = s.t.stopId ? input.stops.get(s.t.stopId) : undefined;
      if (stop) {
        const w = vec(s.t.lat!, s.t.lon!, stop.lat, stop.lon);
        if (v[0] * w[0] + v[1] * w[1] <= 0) continue;                        // sentido contrario (otra vía)
      }
      const speed = vn / (m.dtSec / 3600); // km/h
      closers.push({ m, d, etaMin: speed > 5 ? (d / speed) * 60 : Infinity });
    }
    closers.sort((a, b) => a.d - b.d);
    const since = s.t.updatedAt - s.dtSec;
    if (closers.length) {
      const c = closers[0];
      const eta = Number.isFinite(c.etaMin) ? `, a este ritmo llegaría en ~${Math.max(1, Math.round(c.etaMin))} min` : '';
      out.push({
        id: `closing:${c.m.t.tripId}>${s.t.tripId}`, kind: 'closing_in',
        severity: c.etaMin < SAFETY.criticalEtaMin && c.d <= SAFETY.criticalDistKm ? 'critical' : 'warning',
        title: TITLES.closing_in,
        detail: `${name(c.m.t)} se acerca a ${name(s.t)}, detenido en vía desde hace ≥${hhmmss(s.dtSec)}: ${c.d.toFixed(1)} km de separación${eta}.`,
        lat: s.t.lat, lon: s.t.lon, region: s.t.region ?? undefined,
        tripIds: [c.m.t.tripId, s.t.tripId], routeIds: [c.m.t.routeId, s.t.routeId].filter((x): x is string => !!x), since,
      });
    } else if (s.dtSec >= SAFETY.stoppedAloneSec) {
      out.push({
        id: `stopped:${s.t.tripId}`, kind: 'stopped_train', severity: 'warning', title: TITLES.stopped_train,
        detail: `${name(s.t)} lleva ≥${hhmmss(s.dtSec)} sin moverse fuera de estación${s.t.delayMin ? ` (retraso ${s.t.delayMin} min)` : ''}.`,
        lat: s.t.lat, lon: s.t.lon, region: s.t.region ?? undefined, tripIds: [s.t.tripId],
        routeIds: s.t.routeId ? [s.t.routeId] : [], since,
      });
    }
  }
  return out;
}

export function cascadeSignals(input: SafetyInput): SafetySignal[] {
  const byRoute = new Map<string, SafetyTrain[]>();
  for (const t of input.trains) {
    if (t.positionBasis !== 'exact' || !t.routeId) continue;
    (byRoute.get(t.routeId) ?? byRoute.set(t.routeId, []).get(t.routeId)!).push(t);
  }
  const out: SafetySignal[] = [];
  for (const [routeId, list] of byRoute) {
    const late = list.filter((t) => (t.delayMin ?? 0) >= SAFETY.cascadeDelayMin);
    if (late.length < SAFETY.cascadeMinTrains || late.length / list.length < SAFETY.cascadeMinRatio) continue;
    const c = late[0];
    out.push({
      id: `cascade:${routeId}`, kind: 'cascade', severity: 'warning', title: TITLES.cascade,
      detail: `${late.length} de ${list.length} trenes de ${c.line ?? routeId} llevan más de ${SAFETY.cascadeDelayMin} min de retraso a la vez: puede haber una incidencia en la vía.`,
      lat: c.lat, lon: c.lon, region: c.region ?? undefined, tripIds: late.slice(0, 8).map((t) => t.tripId), routeIds: [routeId],
    });
  }
  return out;
}

/** Cuántos trenes se han podido comparar con la instantánea anterior (para saber si el detector está "viendo"). */
export function safetyStats(input: SafetyInput) {
  const tracked = track(input);
  const exact = input.trains.filter((t) => t.positionBasis === 'exact').length;
  return {
    trainsWithGps: exact,
    compared: tracked.length,
    stoppedInLine: tracked.filter((x) => x.t.status !== 'STOPPED_AT' && x.moveKm <= SAFETY.stoppedMaxMoveKm && !nearNextStop(x.t, input.stops)).length,
    moving: tracked.filter((x) => x.moveKm >= SAFETY.movingMinKm).length,
  };
}

const RANK = { critical: 0, warning: 1 } as const;

export function computeSafety(input: SafetyInput): SafetySignal[] {
  return [...alertSignals(input.alerts), ...trainSignals(input), ...cascadeSignals(input)]
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .slice(0, 60);
}

/** Instantánea anterior publicada, para comparar posiciones. Si no está disponible, se vigilan solo avisos y bloqueos. */
export async function fetchPrevious(url: string): Promise<SafetyInput['prev'] | undefined> {
  try {
    const res = await fetch(`${url}?x=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const j: any = await res.json();
    const trains = new Map<string, PrevTrain>();
    for (const t of j.trains ?? []) {
      if (t.positionBasis === 'exact' && t.lat != null) trains.set(t.tripId, { lat: t.lat, lon: t.lon, updatedAt: t.updatedAt });
    }
    return { generatedAt: j.generatedAt, trains };
  } catch {
    return undefined;
  }
}

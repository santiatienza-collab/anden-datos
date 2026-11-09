import type { DatabaseSync } from 'node:sqlite';
import { isServiceActive, madridDay, type Calendar } from './calendar.ts';
import type { Level, Network, Route, Stop, Trip, TripDelay } from './model.ts';
import { DEFAULT_THRESHOLDS, trainLevel } from './semaphore.ts';

export type BoardType = 'departures' | 'arrivals';
export type BoardStatus = 'cancelled' | 'skipped' | 'delayed' | 'on_time' | 'scheduled';

export interface BoardRow {
  tripId: string;
  line?: string;
  route?: string;
  /** Destino (salidas) u origen (llegadas). */
  otherEnd?: string;
  network: Network;
  scheduledEpoch: number;
  scheduledTime: string;
  /** null = sin dato en tiempo real para este tren (no se asume puntual). */
  delayMin: number | null;
  expectedEpoch: number;
  expectedTime: string;
  status: BoardStatus;
  level: Level;
}

export interface FeedIndex {
  network: Network;
  db: DatabaseSync;
  calendar: Calendar;
}

export interface BoardContext {
  feeds: FeedIndex[];
  trips: Map<string, Trip>;
  routes: Map<string, Route>;
  stops: Map<string, Stop>;
  delays: Map<string, TripDelay>;
}

const hhmm = (epochSec: number) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(epochSec * 1000);

const LOOKBACK_SEC = 3600; // para no perder trenes con retraso que aún no han pasado
const HOLD_SEC = 120; // se mantiene un tren 2 min después de su hora prevista (con retraso)

export function board(
  ctx: BoardContext,
  stopId: string,
  type: BoardType,
  nowSec: number,
  limit = 25,
  windowSec = 4 * 3600,
): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const feed of ctx.feeds) {
    const q = feed.db.prepare(
      `SELECT s.trip_id AS trip, s.dep AS dep, s.arr AS arr, e.first_stop AS first, e.last_stop AS last
         FROM st s LEFT JOIN trip_ends e ON e.trip_id = s.trip_id
        WHERE s.stop_id = ? AND s.dep BETWEEN ? AND ?`,
    );
    // Marcos de día: ayer (horas >24:00 del servicio de ayer), hoy y mañana.
    for (const shift of [-1, 0, 1]) {
      const day = madridDay(nowSec, shift);
      const lo = Math.max(0, nowSec - LOOKBACK_SEC - day.midnightEpoch);
      const hi = nowSec + windowSec - day.midnightEpoch;
      if (hi < 0) continue;
      for (const r of q.all(stopId, lo, hi) as { trip: string; dep: number; arr: number | null; first: string; last: string }[]) {
        const trip = ctx.trips.get(r.trip);
        if (!trip || !isServiceActive(feed.calendar, trip.serviceId, day.date, day.weekday)) continue;
        // Cabeceras: un tren que termina aquí no sale, y uno que empieza aquí no llega.
        if (type === 'departures' && r.last === stopId && r.first !== stopId) continue;
        if (type === 'arrivals' && r.first === stopId && r.last !== stopId) continue;
        const t = type === 'arrivals' ? (r.arr ?? r.dep) : r.dep;
        const scheduled = day.midnightEpoch + t;
        const d = ctx.delays.get(r.trip);
        const fresh = d && nowSec - d.updatedAt <= DEFAULT_THRESHOLDS.maxAgeSec ? d : undefined;
        const delaySec = fresh && !fresh.cancelled ? fresh.delaySec : 0;
        const expected = scheduled + delaySec;
        if (expected < nowSec - HOLD_SEC || scheduled > nowSec + windowSec) continue;
        const skipped = !!fresh?.skippedStops.includes(stopId);
        const status: BoardStatus = !fresh ? 'scheduled'
          : fresh.cancelled ? 'cancelled'
          : skipped ? 'skipped'
          : delaySec >= DEFAULT_THRESHOLDS.delayedSec ? 'delayed' : 'on_time';
        const route = trip.routeId ? ctx.routes.get(trip.routeId) : undefined;
        const other = type === 'departures' ? r.last : r.first;
        rows.push({
          tripId: r.trip,
          line: route?.shortName,
          route: route?.longName,
          otherEnd: other ? ctx.stops.get(other)?.name : undefined,
          network: feed.network,
          scheduledEpoch: scheduled,
          scheduledTime: hhmm(scheduled),
          delayMin: fresh && !fresh.cancelled ? Math.round(delaySec / 60) : null,
          expectedEpoch: expected,
          expectedTime: hhmm(expected),
          status,
          level: trainLevel(fresh, nowSec),
        });
      }
    }
  }
  // Un mismo servicio puede estar en ambos feeds (p. ej. Media Distancia) o en marcos de día solapados:
  // se deja una sola fila, prefiriendo la que tiene dato en tiempo real.
  const best = new Map<string, BoardRow>();
  for (const r of rows) {
    const key = r.line && r.otherEnd ? `${r.line}|${r.scheduledEpoch}|${r.otherEnd}` : `${r.tripId}|${r.scheduledEpoch}`;
    const cur = best.get(key);
    if (!cur || (cur.status === 'scheduled' && r.status !== 'scheduled')) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => a.expectedEpoch - b.expectedEpoch).slice(0, limit);
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchStops(stops: Map<string, Stop>, query: string, limit = 15): Stop[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const starts: Stop[] = [], contains: Stop[] = [];
  for (const s of stops.values()) {
    const n = norm(s.name);
    if (n.startsWith(q)) starts.push(s);
    else if (n.includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}

// Posición de un tren deducida de su horario: sin retraso (redes sin tiempo real, como Mallorca) o
// desplazada por el retraso medido (operadores que dan retrasos pero no posiciones, como Euskotren).
// No es un dato medido: es lo que debería estar haciendo cada tren ahora según el horario.
import { isServiceActive, madridDay, type Calendar } from './calendar.ts';
import type { ScheduledStop } from './gtfsStatic.ts';
import type { Stop, Trip } from './model.ts';

export interface ScheduledPosition {
  tripId: string;
  lat: number;
  lon: number;
  /** Parada en la que está detenido (si lo está) y siguiente parada. */
  stopId?: string;
  nextStopId?: string;
  atStop: boolean;
}

type Spot = Omit<ScheduledPosition, 'tripId'>;

/** Dónde está el viaje en el instante `t` (segundos desde la medianoche del día de servicio), o null si no circula. */
export function positionAt(list: ScheduledStop[], t: number, stops: Map<string, Stop>): Spot | null {
  if (list.length < 2 || t < list[0].arr || t > list[list.length - 1].arr) return null;
  for (let i = 0; i < list.length; i++) {
    const cur = list[i], here = stops.get(cur.stopId);
    if (!here) return null;
    // Detenido en la parada i
    if (t >= cur.arr && t <= cur.dep) return { lat: here.lat, lon: here.lon, stopId: cur.stopId, nextStopId: list[i + 1]?.stopId, atStop: true };
    // En marcha hacia la parada i+1
    const nxt = list[i + 1], there = nxt && stops.get(nxt.stopId);
    if (nxt && there && t > cur.dep && t < nxt.arr) {
      const f = (t - cur.dep) / Math.max(1, nxt.arr - cur.dep);
      return {
        lat: here.lat + (there.lat - here.lat) * f, lon: here.lon + (there.lon - here.lon) * f,
        stopId: cur.stopId, nextStopId: nxt.stopId, atStop: false,
      };
    }
  }
  return null;
}

/** Posición de un viaje ahora, retrasado `delaySec` respecto al horario. Prueba hoy y ayer (servicios que pasan de medianoche). */
export function positionNow(
  nowSec: number,
  list: ScheduledStop[],
  trip: Trip,
  calendar: Calendar,
  stops: Map<string, Stop>,
  delaySec = 0,
): Spot | null {
  for (const shift of [-1, 0]) {
    const day = madridDay(nowSec, shift);
    const spot = positionAt(list, nowSec - day.midnightEpoch - delaySec, stops);
    if (spot && isServiceActive(calendar, trip.serviceId, day.date, day.weekday)) return spot;
  }
  return null;
}

export function scheduledPositions(
  nowSec: number,
  scheduled: Map<string, ScheduledStop[]>,
  trips: Map<string, Trip>,
  calendar: Calendar,
  stops: Map<string, Stop>,
): ScheduledPosition[] {
  const out: ScheduledPosition[] = [];
  for (const [tripId, list] of scheduled) {
    const trip = trips.get(tripId);
    if (!trip) continue;
    const spot = positionNow(nowSec, list, trip, calendar, stops);
    if (spot) out.push({ tripId, ...spot });
  }
  return out;
}

/**
 * Hora prevista (epoch s) de un viaje en una parada, según el horario. Sirve para calcular el retraso cuando un feed
 * solo da horas previstas. Con `startDate` (YYYYMMDD) es exacta; sin ella se elige el día que más se acerca a la hora predicha.
 */
export function scheduledEpochFor(
  list: ScheduledStop[] | undefined,
  stopKey: string,
  startDate: string | undefined,
  predicted: number,
): number | undefined {
  const stop = list?.find((s) => s.stopId === stopKey);
  if (!stop) return undefined;
  if (startDate && /^\d{8}$/.test(startDate)) {
    const y = Number(startDate.slice(0, 4)), m = Number(startDate.slice(4, 6)), d = Number(startDate.slice(6, 8));
    return madridDay(Date.UTC(y, m - 1, d, 12) / 1000).midnightEpoch + stop.arr;
  }
  let best: number | undefined;
  for (const shift of [-1, 0, 1]) {
    const e = madridDay(predicted, shift).midnightEpoch + stop.arr;
    if (best == null || Math.abs(e - predicted) < Math.abs(best - predicted)) best = e;
  }
  return best;
}

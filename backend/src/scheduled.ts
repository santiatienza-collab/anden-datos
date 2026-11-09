// Posición estimada de trenes según su horario, para redes sin datos en tiempo real (Mallorca).
// No es un dato medido: es lo que debería estar haciendo cada tren ahora mismo según el horario.
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

export function scheduledPositions(
  nowSec: number,
  scheduled: Map<string, ScheduledStop[]>,
  trips: Map<string, Trip>,
  calendar: Calendar,
  stops: Map<string, Stop>,
): ScheduledPosition[] {
  const out: ScheduledPosition[] = [];
  // Hoy, y ayer por si el servicio de ayer pasa de medianoche (horas > 24:00).
  for (const shift of [-1, 0]) {
    const day = madridDay(nowSec, shift);
    const t = nowSec - day.midnightEpoch;
    for (const [tripId, list] of scheduled) {
      if (list.length < 2 || t < list[0].dep || t > list[list.length - 1].arr) continue;
      const trip = trips.get(tripId);
      if (!trip || !isServiceActive(calendar, trip.serviceId, day.date, day.weekday)) continue;
      for (let i = 0; i < list.length; i++) {
        const cur = list[i], here = stops.get(cur.stopId);
        if (!here) break;
        // Detenido en la parada i
        if (t >= cur.arr && t <= cur.dep) {
          out.push({ tripId, lat: here.lat, lon: here.lon, stopId: cur.stopId, nextStopId: list[i + 1]?.stopId, atStop: true });
          break;
        }
        // En marcha hacia la parada i+1
        const nxt = list[i + 1], there = nxt && stops.get(nxt.stopId);
        if (nxt && there && t > cur.dep && t < nxt.arr) {
          const f = (t - cur.dep) / Math.max(1, nxt.arr - cur.dep);
          out.push({
            tripId, lat: here.lat + (there.lat - here.lat) * f, lon: here.lon + (there.lon - here.lon) * f,
            stopId: cur.stopId, nextStopId: nxt.stopId, atStop: false,
          });
          break;
        }
      }
    }
  }
  return out;
}

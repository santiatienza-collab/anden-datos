import type { Alert, Level, RouteStatus, TripDelay } from './model.ts';

export interface Thresholds {
  /** Retraso (s) a partir del cual un tren cuenta como "con retraso". */
  delayedSec: number;
  /** Retraso (s) a partir del cual cuenta como "retraso grave". */
  severeSec: number;
  /** Fracción de trenes con retraso para pasar a ámbar. */
  amberShare: number;
  /** Fracción de trenes con retraso grave (o cancelados) para pasar a rojo. */
  redShare: number;
  /** Mínimo de trenes con retraso grave para que la fracción cuente (evita falsos rojos por 1 solo tren). */
  minTrainsForShare: number;
  /** Antigüedad máxima (s) de los datos para considerarlos válidos. */
  maxAgeSec: number;
  /** Un aviso que cita más de N líneas se considera de red amplia: no basta para poner una línea en rojo. */
  wideAlertRoutes: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  delayedSec: 300,
  severeSec: 900,
  amberShare: 0.25,
  redShare: 0.3,
  minTrainsForShare: 2,
  maxAgeSec: 300,
  wideAlertRoutes: 12,
};

const rank: Record<Level, number> = { gray: 0, green: 1, amber: 2, red: 3 };
export const worst = (a: Level, b: Level): Level => (rank[a] >= rank[b] ? a : b);

/**
 * Semáforo de una línea. Función pura.
 * - gray: sin datos de tiempo real recientes (nunca se asume verde sin datos).
 * - red: aviso crítico activo, o muchos trenes con retraso grave/cancelados.
 * - amber: aviso activo, o parte de los trenes con retraso.
 * - green: hay datos recientes y no se cumple nada de lo anterior.
 */
export function routeStatus(
  routeId: string,
  delays: TripDelay[],
  alerts: Alert[],
  nowSec: number,
  t: Thresholds = DEFAULT_THRESHOLDS,
): RouteStatus {
  const fresh = delays.filter((d) => nowSec - d.updatedAt <= t.maxAgeSec);
  const active = alerts.filter(
    (a) => (a.activeFrom ?? 0) <= nowSec && (a.activeTo == null || a.activeTo >= nowSec),
  );
  const reasons: string[] = [];
  const trips = fresh.length;
  const delayed5 = fresh.filter((d) => !d.cancelled && d.delaySec >= t.delayedSec).length;
  const delayed15 = fresh.filter((d) => !d.cancelled && d.delaySec >= t.severeSec).length;
  const cancelled = fresh.filter((d) => d.cancelled).length;
  const dataAgeSec = delays.length ? Math.max(...delays.map((d) => nowSec - d.updatedAt)) : null;

  let level: Level;
  if (trips === 0 && active.length === 0) {
    level = 'gray';
    reasons.push(delays.length ? 'datos de tiempo real caducados' : 'sin trenes en tiempo real');
  } else {
    level = 'green';
    const severe = delayed15 + cancelled;
    if (trips >= t.minTrainsForShare && severe >= t.minTrainsForShare && severe / trips >= t.redShare) {
      level = 'red';
      reasons.push(`${severe} de ${trips} trenes con retraso grave o cancelados`);
    } else if (trips > 0 && delayed5 / trips >= t.amberShare && delayed5 >= t.minTrainsForShare) {
      level = 'amber';
      reasons.push(`${delayed5} de ${trips} trenes con retraso`);
    }
    for (const a of active) {
      const wide = a.routeIds.length > t.wideAlertRoutes;
      if (a.severity === 'critical' && !wide) {
        level = worst(level, 'red');
        reasons.push('aviso crítico activo');
      } else if (a.severity === 'warning' || a.severity === 'critical') {
        level = worst(level, 'amber');
        reasons.push(wide ? 'aviso de red amplia (sin tramo concreto)' : 'aviso activo');
      }
    }
    if (trips === 0 && level === 'green') {
      // Solo hay avisos informativos y ningún tren con datos: no afirmamos "verde".
      level = 'gray';
      reasons.push('sin trenes en tiempo real');
    }
  }
  return {
    routeId,
    level,
    reasons: [...new Set(reasons)],
    trips,
    delayed5,
    delayed15,
    cancelled,
    alertIds: active.map((a) => a.id),
    dataAgeSec,
  };
}

/**
 * Color de un tren concreto según su retraso. Función pura.
 * gray = sin retraso fiable (sin dato de retraso o dato caducado).
 */
export function trainLevel(
  d: Pick<TripDelay, 'delaySec' | 'cancelled' | 'updatedAt'> | undefined,
  nowSec: number,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Level {
  if (!d || nowSec - d.updatedAt > t.maxAgeSec) return 'gray';
  if (d.cancelled || d.delaySec >= t.severeSec) return 'red';
  if (d.delaySec >= t.delayedSec) return 'amber';
  return 'green';
}

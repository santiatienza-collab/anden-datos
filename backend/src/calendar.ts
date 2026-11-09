// Calendario de servicios GTFS (calendar.txt + calendar_dates.txt) y utilidades de hora local de España.

export interface Calendar {
  base: Map<string, { days: boolean[]; start: string; end: string }>; // days[0]=lunes … days[6]=domingo
  exceptions: Map<string, Map<string, 1 | 2>>; // servicio -> fecha YYYYMMDD -> 1 añade, 2 quita
}

export function buildCalendar(cal: Record<string, string>[], dates: Record<string, string>[]): Calendar {
  const base: Calendar['base'] = new Map();
  for (const r of cal) {
    base.set(r.service_id, {
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => r[d] === '1'),
      start: r.start_date,
      end: r.end_date,
    });
  }
  const exceptions: Calendar['exceptions'] = new Map();
  for (const r of dates) {
    const m = exceptions.get(r.service_id) ?? new Map<string, 1 | 2>();
    m.set(r.date, r.exception_type === '1' ? 1 : 2);
    exceptions.set(r.service_id, m);
  }
  return { base, exceptions };
}

/** ¿Circula el servicio ese día? date = 'YYYYMMDD', weekday: 0=lunes … 6=domingo. */
export function isServiceActive(c: Calendar, service: string, date: string, weekday: number): boolean {
  const ex = c.exceptions.get(service)?.get(date);
  if (ex === 1) return true;
  if (ex === 2) return false;
  const b = c.base.get(service);
  return !!b && b.days[weekday] && date >= b.start && date <= b.end;
}

export interface LocalDay {
  date: string;
  weekday: number;
  midnightEpoch: number;
}

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});

function madridOffsetMin(epochMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(epochMs).find((x) => x.type === 'timeZoneName')!.value; // "GMT+01:00"
  const m = p.match(/GMT([+-])(\d\d):(\d\d)/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Día local de España que contiene el instante `epochSec`, desplazado `shiftDays` días. */
export function madridDay(epochSec: number, shiftDays = 0): LocalDay {
  const [y, mo, d] = fmt.format(epochSec * 1000).split('-').map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d + shiftDays);
  // Medianoche local = medianoche UTC - desfase (se evalúa a mediodía para evitar el salto horario).
  const off = madridOffsetMin(utcMidnight + 12 * 3600_000);
  const dt = new Date(utcMidnight);
  const date = `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
  return { date, weekday: (dt.getUTCDay() + 6) % 7, midnightEpoch: Math.round(utcMidnight / 1000) - off * 60 };
}

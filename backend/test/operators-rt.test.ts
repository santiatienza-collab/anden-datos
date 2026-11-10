import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTripUpdates } from '../src/renfeRealtime.ts';
import { positionAt, scheduledEpochFor } from '../src/scheduled.ts';
import { stopKey } from '../src/api.ts';
import type { ScheduledStop } from '../src/gtfsStatic.ts';
import type { Stop } from '../src/model.ts';

// 2026-11-09 00:00 en Madrid (UTC+1) = 2026-11-08 23:00 UTC
const MIDNIGHT = Date.UTC(2026, 10, 8, 23) / 1000;
const list: ScheduledStop[] = [
  { stopId: 'p-a', arr: 3600, dep: 3660 }, // 01:00
  { stopId: 'p-b', arr: 4260, dep: 4320 }, // 01:11
];

test('hora prevista con fecha de inicio exacta', () => {
  assert.equal(scheduledEpochFor(list, 'p-a', '20261109', 0), MIDNIGHT + 3600);
  assert.equal(scheduledEpochFor(list, 'p-zz', '20261109', 0), undefined);
});

test('sin fecha se elige el día más cercano a la hora predicha', () => {
  const predicted = MIDNIGHT + 3600 + 240;
  assert.equal(scheduledEpochFor(list, 'p-a', undefined, predicted), MIDNIGHT + 3600);
});

test('retraso calculado contra el horario cuando el feed solo trae horas', () => {
  const feed = {
    timestamp: 1000,
    entities: [{ tripUpdate: { trip: { tripId: 'T1', startDate: '20261109' }, stopTimeUpdate: [{ stopId: 'A', arrival: { time: String(MIDNIGHT + 3600 + 300) } }] } }],
  };
  const [d] = parseTripUpdates(feed, 'euskotren', new Map(), {
    prefix: 'eus-', stopAlias: new Map([['eus-A', 'p-a']]),
    scheduledEpoch: (_trip, stop, start, pred) => scheduledEpochFor(list, stop, start, pred),
  });
  assert.equal(d.tripId, 'eus-T1');
  assert.equal(d.delaySec, 300);
  assert.equal(d.measured, true);
});

test('si no se puede calcular el retraso, no se afirma que vaya puntual', () => {
  const feed = { timestamp: 1, entities: [{ tripUpdate: { trip: { tripId: 'X' }, stopTimeUpdate: [{ stopId: 'Z', arrival: { time: '5' } }] } }] };
  const [d] = parseTripUpdates(feed, 'fgc', new Map(), { prefix: 'fgc-', scheduledEpoch: () => undefined });
  assert.equal(d.measured, false);
});

test('un retraso absurdo (más de 6 h) se descarta', () => {
  const feed = { timestamp: 1, entities: [{ tripUpdate: { trip: { tripId: 'Y', startDate: '20261109' }, stopTimeUpdate: [{ stopId: 'A', arrival: { time: String(MIDNIGHT + 3600 + 8 * 3600) } }] } }] };
  const [d] = parseTripUpdates(feed, 'fgc', new Map(), { scheduledEpoch: (_t, s, st, p) => scheduledEpochFor(list, 'p-a', st, p) });
  assert.equal(d.measured, false);
});

test('posición interpolada entre dos paradas', () => {
  const stops = new Map<string, Stop>([
    ['p-a', { id: 'p-a', name: 'A', lat: 40, lon: -3 }],
    ['p-b', { id: 'p-b', name: 'B', lat: 41, lon: -2 }],
  ]);
  const half = positionAt(list, (3660 + 4260) / 2, stops);
  assert.ok(half && !half.atStop);
  assert.ok(Math.abs(half.lat - 40.5) < 1e-9 && Math.abs(half.lon - -2.5) < 1e-9);
  assert.equal(positionAt(list, 3630, stops)?.atStop, true); // detenido en A
  assert.equal(positionAt(list, 100, stops), null); // aún no ha salido
});

test('clave de estación segura para ficheros', () => {
  assert.equal(stopKey('eus-ES:Euskotren:StopPlace:1468:'), 'eus-ES_Euskotren_StopPlace_1468_');
  assert.equal(stopKey('60000'), '60000');
});

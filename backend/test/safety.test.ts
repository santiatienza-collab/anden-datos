import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAlertText, computeSafety, type SafetyTrain, type PrevTrain } from '../src/safety.ts';

// Línea recta hacia el norte: 1 minuto de latitud ≈ 1,85 km.
const stops = new Map([['N', { lat: 40.5, lon: -3, name: 'Norte' }]]);

const train = (id: string, lat: number, updatedAt: number, extra: Partial<SafetyTrain> = {}): SafetyTrain => ({
  tripId: id, label: id, line: 'AVE', routeId: 'R1', lat, lon: -3, positionBasis: 'exact', status: 'IN_TRANSIT_TO',
  stopId: 'N', updatedAt, delayMin: 0, level: 'green', company: 'Renfe', ...extra,
});
const prevOf = (list: [string, number, number][]) => ({
  generatedAt: 1000,
  trains: new Map<string, PrevTrain>(list.map(([id, lat, t]) => [id, { lat, lon: -3, updatedAt: t }])),
});

test('clasifica avisos de accidente, señalización, vía y energía', () => {
  assert.equal(classifyAlertText('Descarrilamiento de un tren en la línea')?.kind, 'accident');
  assert.equal(classifyAlertText('Fallo del sistema de señalización entre A y B')?.kind, 'signalling');
  assert.equal(classifyAlertText('Rotura de carril en la vía 2')?.kind, 'track');
  assert.equal(classifyAlertText('Falta de tensión en la catenaria')?.kind, 'power');
  assert.equal(classifyAlertText('Circulación interrumpida por fallo de señalización')?.severity, 'critical');
  assert.equal(classifyAlertText('Obras programadas el fin de semana'), null);
  assert.equal(classifyAlertText('Huelga general: el servicio podría verse afectado'), null);
});

test('Urda: aproximación por detrás a un tren detenido + aviso oficial de señalización → crítico', () => {
  // Detenido en 40.00 (no se mueve), su próxima parada está al norte. El otro viene del sur a ~100 km/h.
  const prev = prevOf([['STOP', 40.0, 700], ['MOVE', 39.87, 700]]);
  const trains = [train('STOP', 40.0, 900), train('MOVE', 39.92, 900)];
  const alerts = [{ id: 'S1', text: 'Fallo de señalización entre A y B', active: true, routeIds: ['R1'] }];
  const s = computeSafety({ now: 1300, trains, alerts, prev, stops });
  const c = s.find((x) => x.kind === 'closing_in');
  assert.ok(c, 'debe detectar la aproximación');
  assert.equal(c!.severity, 'critical');
  assert.deepEqual(c!.tripIds, ['MOVE', 'STOP']);
});

test('un tren que viene en sentido contrario (otra vía) no genera aviso de aproximación', () => {
  // El otro viene del norte hacia el sur, pasando junto al detenido.
  const prev = prevOf([['STOP', 40.0, 700], ['MOVE', 40.15, 700]]);
  const trains = [train('STOP', 40.0, 900), train('MOVE', 40.1, 900)];
  const s = computeSafety({ now: 1300, trains, alerts: [], prev, stops });
  assert.equal(s.some((x) => x.kind === 'closing_in'), false);
});

test('dato congelado (el feed no avanzó) no se interpreta como tren parado', () => {
  const prev = prevOf([['STOP', 40.0, 880]]);
  const s = computeSafety({ now: 1300, trains: [train('STOP', 40.0, 900)], alerts: [], prev, stops });
  assert.equal(s.length, 0);
});

test('tren detenido en estación o junto a su parada no avisa; detenido en vía abierta ≥4 min sí', () => {
  const prev = prevOf([['A', 40.0, 600], ['B', 40.499, 600]]);
  const trains = [train('A', 40.0, 900), train('B', 40.499, 900)];
  const s = computeSafety({ now: 1300, trains, alerts: [], prev, stops });
  assert.deepEqual(s.map((x) => x.tripIds[0]), ['A']);
  assert.equal(s[0].kind, 'stopped_train');
});

test('sin instantánea anterior solo se vigilan avisos y acumulación de retrasos', () => {
  const alerts = [{ id: 'X1', text: 'Fallo de señalización: circulación suspendida', active: true, routeIds: ['R1'] }];
  const late = Array.from({ length: 6 }, (_, i) => train('L' + i, 40 + i / 100, 900, { delayMin: 30, level: 'red' }));
  const s = computeSafety({ now: 1300, trains: late, alerts, stops });
  assert.deepEqual(s.map((x) => x.kind).sort(), ['cascade', 'signalling']);
  assert.equal(s.find((x) => x.kind === 'signalling')!.severity, 'critical');
});

test('la misma aproximación sin aviso oficial ni tiempo largo de parada se queda en atención (evita falsas alarmas)', () => {
  const prev = prevOf([['STOP', 40.0, 700], ['MOVE', 39.87, 700]]);
  const trains = [train('STOP', 40.0, 900), train('MOVE', 39.92, 900)];
  const c = computeSafety({ now: 1300, trains, alerts: [], prev, stops }).find((x) => x.kind === 'closing_in');
  assert.equal(c!.severity, 'warning');
});

test('parado ≥8 min con otro tren acercándose se escala a crítico aunque no haya aviso oficial', () => {
  const prev = prevOf([['STOP', 40.0, 400], ['MOVE', 39.87, 700]]);
  const trains = [train('STOP', 40.0, 900), train('MOVE', 39.92, 900)];
  const c = computeSafety({ now: 1300, trains, alerts: [], prev, stops }).find((x) => x.kind === 'closing_in');
  assert.equal(c!.severity, 'critical');
});

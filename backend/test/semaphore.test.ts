import test from 'node:test';
import assert from 'node:assert/strict';
import { routeStatus } from '../src/semaphore.ts';
import { classify, parseAlerts } from '../src/renfeRealtime.ts';
import { parseCsv } from '../src/csv.ts';
import type { Alert, TripDelay } from '../src/model.ts';

const NOW = 1_000_000;
const d = (delaySec: number, over: Partial<TripDelay> = {}): TripDelay => ({
  tripId: String(Math.random()), delaySec, cancelled: false, skippedStops: [], updatedAt: NOW - 10, network: 'cercanias', ...over,
});
const alert = (severity: Alert['severity'], over: Partial<Alert> = {}): Alert => ({
  id: 'a', routeIds: [], stopIds: [], text: '', severity, category: 'other', severityBasis: 'text-heuristic', updatedAt: NOW, ...over,
});

test('verde: trenes puntuales con datos recientes', () => {
  assert.equal(routeStatus('R', [d(0), d(60), d(120)], [], NOW).level, 'green');
});
test('gris: sin datos, nunca verde', () => {
  assert.equal(routeStatus('R', [], [], NOW).level, 'gray');
});
test('gris: datos caducados', () => {
  assert.equal(routeStatus('R', [d(0, { updatedAt: NOW - 3600 })], [], NOW).level, 'gray');
});
test('ámbar: 1/3 con retraso moderado', () => {
  assert.equal(routeStatus('R', [d(400), d(400), d(0)], [], NOW).level, 'amber');
});
test('un solo tren retrasado no pone la línea en rojo', () => {
  assert.notEqual(routeStatus('R', [d(3000), d(0), d(0), d(0)], [], NOW).level, 'red');
});
test('rojo: muchos trenes con retraso grave', () => {
  assert.equal(routeStatus('R', [d(1200), d(1500), d(0)], [], NOW).level, 'red');
});
test('rojo: cancelados cuentan como graves', () => {
  assert.equal(routeStatus('R', [d(0, { cancelled: true }), d(0, { cancelled: true }), d(0)], [], NOW).level, 'red');
});
test('aviso crítico activo => rojo aunque vaya puntual', () => {
  assert.equal(routeStatus('R', [d(0), d(0)], [alert('critical', { activeFrom: NOW - 5 })], NOW).level, 'red');
});
test('aviso que aún no ha empezado no cuenta', () => {
  assert.equal(routeStatus('R', [d(0), d(0)], [alert('critical', { activeFrom: NOW + 1000 })], NOW).level, 'green');
});
test('aviso crítico sin trenes en tiempo real se muestra rojo', () => {
  assert.equal(routeStatus('R', [], [alert('critical')], NOW).level, 'red');
});
test('aviso informativo sin trenes => gris, no verde', () => {
  assert.equal(routeStatus('R', [], [alert('info')], NOW).level, 'gray');
});

test('clasificación de texto', () => {
  assert.equal(classify('Se encuentra suspendido el servicio de trenes entre Cercedilla y Los Cotos'), 'critical');
  assert.equal(classify('Por obras, frecuencias de paso modificadas'), 'warning');
  assert.equal(classify('Nuevo horario disponible'), 'info');
});

test('parseAlerts extrae rutas, paradas y texto', () => {
  const [a] = parseAlerts({
    timestamp: 5,
    entities: [{ id: 'AVISO_1', alert: {
      activePeriod: [{ start: '100' }],
      informedEntity: [{ routeId: 'R1 ' }, { stopId: '04040' }],
      descriptionText: { translation: [{ text: 'Servicio interrumpido', language: 'es' }] },
    } }],
  });
  assert.deepEqual(a.routeIds, ['R1']);
  assert.deepEqual(a.stopIds, ['04040']);
  assert.equal(a.activeFrom, 100);
  assert.equal(a.severity, 'critical');
});

test('csv: comillas, espacios de relleno y CRLF', () => {
  const rows = parseCsv('a,b\r\n1  ,"x, ""y"""\r\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, "y"' }]);
});

test("aviso crítico de red amplia no pone rojo por sí solo (máx. ámbar)", () => {
  const wide = alert("critical", { routeIds: Array.from({ length: 30 }, (_, i) => "R" + i) });
  assert.equal(routeStatus("R1", [d(0), d(0)], [wide], NOW).level, "amber");
});
test("ascensor fuera de servicio es informativo, no crítico", () => {
  assert.equal(classify("Ascensor vía 1 de la estación de Cortadura, se encuentra fuera de servicio."), "info");
});
test("corte de circulación sigue siendo crítico", () => {
  assert.equal(classify("Corte total de la circulación entre A y B"), "critical");
});

import { trainLevel } from '../src/semaphore.ts';
test('color de tren por retraso', () => {
  const mk = (delaySec: number, over = {}) => ({ delaySec, cancelled: false, updatedAt: NOW - 5, ...over });
  assert.equal(trainLevel(mk(0), NOW), 'green');
  assert.equal(trainLevel(mk(299), NOW), 'green');
  assert.equal(trainLevel(mk(300), NOW), 'amber');
  assert.equal(trainLevel(mk(900), NOW), 'red');
  assert.equal(trainLevel(mk(0, { cancelled: true }), NOW), 'red');
  assert.equal(trainLevel(undefined, NOW), 'gray');
  assert.equal(trainLevel(mk(0, { updatedAt: NOW - 1000 }), NOW), 'gray');
});

import { categorize } from "../src/renfeRealtime.ts";
test("categoría de accesibilidad con elemento y estado", () => {
  const e = categorize("Ascensor de la estación de Atocha que da acceso a las vías 5 y 6, se encuentra fuera de servicio.");
  assert.equal(e.category, "accessibility");
  assert.equal(e.accessibility?.element, "elevator");
  assert.equal(e.accessibility?.stationInaccessible, false);
  const s = categorize("La estación de La Serna, en estos momentos, se encuentra inaccesible.");
  assert.equal(s.accessibility?.element, "station");
  assert.equal(s.accessibility?.stationInaccessible, true);
  assert.equal(categorize("Servicio de autobús alternativo entre A y B").category, "bus");
  assert.equal(categorize("Huelga general").category, "strike");
});

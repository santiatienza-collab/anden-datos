import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, isServiceActive, madridDay } from '../src/calendar.ts';

test('día local de Madrid: invierno (UTC+1) y verano (UTC+2)', () => {
  // 2026-11-09 14:00 UTC = 15:00 en Madrid; medianoche local = 2026-11-08 23:00 UTC
  const w = madridDay(Date.UTC(2026, 10, 9, 14) / 1000);
  assert.equal(w.date, '20261109');
  assert.equal(w.weekday, 0); // lunes
  assert.equal(w.midnightEpoch, Date.UTC(2026, 10, 8, 23) / 1000);
  const s = madridDay(Date.UTC(2026, 6, 15, 10) / 1000);
  assert.equal(s.midnightEpoch, Date.UTC(2026, 6, 14, 22) / 1000);
});

test('tras medianoche local pertenece al día siguiente', () => {
  // 2026-11-09 23:30 UTC = 00:30 del día 10 en Madrid
  assert.equal(madridDay(Date.UTC(2026, 10, 9, 23, 30) / 1000).date, '20261110');
});

test('desplazar días funciona al cruzar fin de mes', () => {
  assert.equal(madridDay(Date.UTC(2026, 10, 30, 12) / 1000, 1).date, '20261201');
});

test('calendario: días de la semana, rango y excepciones', () => {
  const c = buildCalendar(
    [{ service_id: 'S', monday: '1', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '0', sunday: '0', start_date: '20261101', end_date: '20261130' }],
    [{ service_id: 'S', date: '20261116', exception_type: '2' }, { service_id: 'S', date: '20261117', exception_type: '1' }],
  );
  assert.equal(isServiceActive(c, 'S', '20261109', 0), true);
  assert.equal(isServiceActive(c, 'S', '20261110', 1), false);
  assert.equal(isServiceActive(c, 'S', '20261116', 0), false); // excepción: quitado
  assert.equal(isServiceActive(c, 'S', '20261117', 1), true); // excepción: añadido
  assert.equal(isServiceActive(c, 'S', '20261207', 0), false); // fuera de rango
  assert.equal(isServiceActive(c, 'X', '20261109', 0), false);
});

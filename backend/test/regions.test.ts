import test from 'node:test';
import assert from 'node:assert/strict';
import { regionList, regionOf } from '../src/regions.ts';

test('hay 19 comunidades/ciudades autónomas', () => {
  assert.equal(regionList().length, 19);
});

test('ciudades conocidas caen en su comunidad', () => {
  const cases: [string, number, number, string][] = [
    ['Madrid', 40.4168, -3.7038, 'comunidad-de-madrid'],
    ['Barcelona', 41.3874, 2.1686, 'cataluna'],
    ['Sevilla', 37.3891, -5.9845, 'andalucia'],
    ['Valencia', 39.4699, -0.3763, 'comunitat-valenciana'],
    ['Bilbao', 43.263, -2.935, 'pais-vasco'],
    ['Zaragoza', 41.6488, -0.8891, 'aragon'],
    ['Vigo', 42.2406, -8.7207, 'galicia'],
    ['Palma', 39.5696, 2.6502, 'illes-balears'],
    ['Murcia', 37.9922, -1.1307, 'region-de-murcia'],
    ['Toledo', 39.8628, -4.0273, 'castilla-la-mancha'],
    ['Valladolid', 41.6523, -4.7245, 'castilla-y-leon'],
    ['Pamplona', 42.8125, -1.6458, 'navarra'],
    ['Logroño', 42.4627, -2.445, 'la-rioja'],
    ['Santander', 43.4623, -3.81, 'cantabria'],
    ['Oviedo', 43.3614, -5.8593, 'principado-de-asturias'],
    ['Badajoz', 38.8794, -6.9707, 'extremadura'],
  ];
  for (const [name, lat, lon, id] of cases) assert.equal(regionOf(lat, lon), id, name);
});

test('un punto lejos de España no tiene comunidad', () => {
  assert.equal(regionOf(48.85, 2.35), undefined); // París
  assert.equal(regionOf(38.7, -9.14), undefined); // Lisboa
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { provinceCount, provinceOf } from '../src/provinces.ts';

test('hay 52 provincias (incluye Ceuta y Melilla)', () => {
  assert.equal(provinceCount(), 52);
});

test('ciudades conocidas caen en su provincia', () => {
  const cases: [string, number, number, string][] = [
    ['Madrid', 40.4168, -3.7038, 'Madrid'],
    ['Barcelona', 41.3874, 2.1686, 'Barcelona'],
    ['Girona', 41.9794, 2.8214, 'Girona'],
    ['Lleida', 41.6176, 0.62, 'Lleida'],
    ['Sevilla', 37.3891, -5.9845, 'Sevilla'],
    ['Málaga', 36.7213, -4.4214, 'Málaga'],
    ['Bilbao', 43.263, -2.935, 'Bizkaia'],
    ['Palma', 39.5696, 2.6502, 'Illes Balears'],
    ['Inca', 39.7206, 2.9114, 'Illes Balears'],
    ['Ourense', 42.3358, -7.8639, 'Ourense'],
    ['A Coruña', 43.3623, -8.4115, 'A Coruña'],
    ['Alicante', 38.3452, -0.4815, 'Alicante'],
    ['Zaragoza', 41.6488, -0.8891, 'Zaragoza'],
  ];
  for (const [name, lat, lon, prov] of cases) assert.equal(provinceOf(lat, lon), prov, name);
});

test('fuera de España no hay provincia', () => {
  assert.equal(provinceOf(41.1496, -8.6109), undefined); // Oporto
  assert.equal(provinceOf(43.3, 5.38), undefined); // Marsella
});

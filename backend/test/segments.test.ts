import test from 'node:test';
import assert from 'node:assert/strict';
import { StopIndex, cutShape, extractPairs, segmentsFromText } from '../src/segments.ts';

test('extrae los pares "entre A y B" del aviso real de Rodalies', () => {
  const t = 'A causa de una incidencia en la infraestructura entre El Clot y Sant Adrià de Besòs, y otra entre Mataró y Arenys de Mar, los trenes pueden permanecer detenidos a medida que se aproximen a los tramos afectados.';
  assert.deepEqual(extractPairs(t), [['El Clot', 'Sant Adrià de Besòs'], ['Mataró', 'Arenys de Mar']]);
});

test('otros formatos de texto', () => {
  assert.deepEqual(extractPairs('Servicio interrumpido entre Madrid Chamartín y Alcalá de Henares por rotura de carril.'), [['Madrid Chamartín', 'Alcalá de Henares']]);
  assert.deepEqual(extractPairs('Sin circulación entre las estaciones de Vallecas y Atocha.'), [['Vallecas', 'Atocha']]);
  assert.deepEqual(extractPairs('Retrasos por obras.'), []);
});

const stops = [
  { id: 'a', name: 'El Clot-Aragó', lat: 41.4095, lon: 2.1871 },
  { id: 'a2', name: 'Clot', lat: 41.4096, lon: 2.1872 },
  { id: 'b', name: 'Sant Adrià de Besòs', lat: 41.4325, lon: 2.2189 },
  { id: 'c', name: 'Mataró', lat: 41.5388, lon: 2.4445 },
  { id: 'd', name: 'Arenys de Mar', lat: 41.5817, lon: 2.5506 },
  { id: 'x', name: 'Mataró', lat: 38.0, lon: -4.0 }, // homónimo lejano
];

test('localiza las estaciones, descarta homónimos lejanos y dibuja rectas si no hay trazado', () => {
  const segs = segmentsFromText('incidencia entre El Clot y Sant Adrià, y otra entre Mataró y Arenys de Mar, los trenes', new StopIndex(stops), []);
  assert.equal(segs.length, 2);
  assert.equal(segs[1].from, 'Mataró');
  assert.equal(segs[1].path[0][0], 41.5388);
  assert.equal(segs[1].basis, 'straight');
});

test('el tramo sigue el trazado de la línea cuando pasa cerca de las dos estaciones', () => {
  const shape: [number, number][] = [[41.40, 2.18], [41.4095, 2.1871], [41.42, 2.20], [41.4325, 2.2189], [41.45, 2.25]];
  const cut = cutShape([shape], [41.4095, 2.1871], [41.4325, 2.2189])!;
  assert.equal(cut.length, 3);
  assert.deepEqual(cut[1], [41.42, 2.2]);
  assert.equal(cutShape([shape], [41.4095, 2.1871], [40, 3]), null);
});

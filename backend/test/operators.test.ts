import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyService, SERVICE_COMPANY } from '../src/operators.ts';

test('larga distancia: AVE/AVLO, Avant, Alvia y media distancia', () => {
  assert.equal(classifyService('ld', 'AVE'), 'av');
  assert.equal(classifyService('ld', 'AVLO'), 'av');
  assert.equal(classifyService('ld', 'AVANT'), 'avant');
  for (const l of ['ALVIA', 'EUROMED', 'Intercity']) assert.equal(classifyService('ld', l), 'ld', l);
  for (const l of ['MD', 'REGIONAL', 'REG.EXP.', 'PROXIMDAD']) assert.equal(classifyService('ld', l), 'md', l);
});

test('Cercanías y Rodalies se distinguen por el nombre de la línea', () => {
  for (const l of ['C1', 'C4a', 'C10']) assert.equal(classifyService('cercanias', l), 'cercanias', l);
  for (const l of ['R1', 'R2S', 'R11', 'RL4', 'RG1', 'T1']) assert.equal(classifyService('cercanias', l), 'rodalies', l);
});

test('Mallorca es siempre SFM y las compañías son Renfe o SFM', () => {
  for (const l of ['T1', 'T2', 'T3', 'M1']) assert.equal(classifyService('mallorca', l), 'sfm', l);
  assert.equal(SERVICE_COMPANY.sfm, 'SFM');
  assert.equal(SERVICE_COMPANY.av, 'Renfe');
});

test('sin línea: cae en el servicio por defecto de su red', () => {
  assert.equal(classifyService('ld', undefined), 'ld');
  assert.equal(classifyService('cercanias', undefined), 'cercanias');
});

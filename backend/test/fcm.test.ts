import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { buildMessage, fcmConfigFromEnv, newCritical, signJwt, FCM_TOPIC } from '../src/fcm.ts';

test('el mensaje es de datos (sin bloque notification), a un tema, con prioridad alta', () => {
  const m = buildMessage({ id: 'closing:A>B', kind: 'closing_in', severity: 'critical', title: 'T', detail: 'D'.repeat(900) });
  assert.equal(m.message.topic, FCM_TOPIC);
  assert.equal('notification' in m.message, false);
  assert.equal(m.message.android.priority, 'HIGH');
  assert.equal(m.message.data.id, 'closing:A>B');
  assert.ok(m.message.data.detail.length <= 600, 'el detalle se recorta para no pasar el límite de FCM');
  for (const v of Object.values(m.message.data)) assert.equal(typeof v, 'string', 'FCM exige valores de datos de tipo texto');
});

test('el JWT de la cuenta de servicio está bien firmado (RS256) y lleva el ámbito de FCM', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = { projectId: 'p', clientEmail: 'sa@p.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  const [h, b, s] = signJwt(cfg, 1000).split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256');
  const body = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(body.iss, cfg.clientEmail);
  assert.match(body.scope, /firebase\.messaging/);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('solo se envían las críticas nuevas', () => {
  const sigs = [
    { id: 'a', severity: 'critical' }, { id: 'b', severity: 'critical' },
    { id: 'c', severity: 'warning' }, { id: 'd', severity: 'info' },
  ];
  assert.deepEqual(newCritical(sigs, new Set(['a'])).map((s) => s.id), ['b']);
  assert.deepEqual(newCritical(sigs, new Set()).map((s) => s.id), ['a', 'b']);
});

test('sin credenciales o con JSON roto no se envía nada (sin lanzar error)', () => {
  assert.equal(fcmConfigFromEnv({}), null);
  assert.equal(fcmConfigFromEnv({ FIREBASE_SERVICE_ACCOUNT: 'no es json' }), null);
  assert.equal(fcmConfigFromEnv({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'x' }) }), null);
  const ok = fcmConfigFromEnv({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'x', private_key: 'k', project_id: 'proj' }) });
  assert.equal(ok?.projectId, 'proj');
});

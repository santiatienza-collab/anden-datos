// Envío de notificaciones push con Firebase Cloud Messaging (API HTTP v1) a un tema al que se suscribe la app.
// Credenciales: secretos FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio) y FIREBASE_PROJECT_ID.
// Nunca se escriben en logs ni en errores: solo se informa del código HTTP.
import { createSign } from 'node:crypto';
import type { SafetySignal } from './safety.ts';

export const FCM_TOPIC = 'critical_alerts';

export interface FcmConfig { projectId: string; clientEmail: string; privateKey: string }

export function fcmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const projectId = env.FIREBASE_PROJECT_ID || j.project_id;
    if (!projectId || !j.client_email || !j.private_key) return null;
    return { projectId, clientEmail: j.client_email, privateKey: j.private_key };
  } catch {
    return null;
  }
}

/** Por qué no hay configuración válida (sin revelar nada del contenido de los secretos). */
export function fcmConfigProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return 'el secreto FIREBASE_SERVICE_ACCOUNT no llega al flujo (vacío o con otro nombre)';
  let j: any;
  try { j = JSON.parse(raw); } catch { return 'FIREBASE_SERVICE_ACCOUNT no es un JSON válido (¿se pegó incompleto?)'; }
  if (!j.client_email) return 'el JSON de FIREBASE_SERVICE_ACCOUNT no tiene client_email (¿es el google-services.json en lugar de la clave de cuenta de servicio?)';
  if (!j.private_key) return 'el JSON de FIREBASE_SERVICE_ACCOUNT no tiene private_key (¿es el google-services.json en lugar de la clave de cuenta de servicio?)';
  if (!(env.FIREBASE_PROJECT_ID || j.project_id)) return 'falta FIREBASE_PROJECT_ID';
  return null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** JWT RS256 para pedir un token OAuth2 a Google con la cuenta de servicio. */
export function signJwt(cfg: FcmConfig, nowSec: number): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    iss: cfg.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec + 3000,
  }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(cfg.privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

async function accessToken(cfg: FcmConfig, nowSec: number): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(cfg, nowSec) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`FCM: no se pudo obtener el token (HTTP ${res.status})`);
  return ((await res.json()) as any).access_token;
}

/**
 * Mensaje de DATOS (sin bloque "notification"): así la app lo recibe también con la app cerrada y construye ella la
 * notificación con su canal, icono y la acción de abrir Seguridad. Prioridad alta para que llegue al momento.
 */
type PushSignal = Pick<SafetySignal, 'id' | 'kind' | 'severity' | 'title' | 'detail'> & { lat?: number; lon?: number };

export function buildMessage(s: PushSignal) {
  return {
    message: {
      topic: FCM_TOPIC,
      // lat/lon (si se conocen) permiten abrir el mapa en el lugar exacto al tocar la notificación.
      data: {
        id: s.id, kind: s.kind, level: s.severity, title: s.title, detail: s.detail.slice(0, 600),
        ...(s.lat != null && s.lon != null ? { lat: String(s.lat), lon: String(s.lon) } : {}),
      },
      android: { priority: 'HIGH', ttl: '3600s' },
    },
  };
}

/** Envía las señales; devuelve los ids enviados. Una caída del envío no debe romper la publicación de datos. */
export async function sendSignals(cfg: FcmConfig, signals: PushSignal[], nowSec: number): Promise<string[]> {
  if (!signals.length) return [];
  const token = await accessToken(cfg, nowSec);
  const sent: string[] = [];
  for (const s of signals) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(buildMessage(s)),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) sent.push(s.id);
    else console.error(`[fcm] envío rechazado (HTTP ${res.status}) para ${s.id}`);
  }
  return sent;
}

/** Señales críticas que no estaban ya como críticas en la publicación anterior (evita repetir el aviso en cada ciclo). */
export function newCritical<T extends { id: string; severity: string }>(signals: T[], previousCriticalIds: Set<string>): T[] {
  return signals.filter((s) => s.severity === 'critical' && !previousCriticalIds.has(s.id));
}

/** ids críticos de la publicación anterior, o undefined si no se pudo leer (entonces no se envía nada, por seguridad). */
export async function fetchPreviousCriticalIds(url: string): Promise<Set<string> | undefined> {
  try {
    const res = await fetch(`${url}?x=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const j: any = await res.json();
    return new Set<string>((j.signals ?? []).filter((s: any) => s.severity === 'critical').map((s: any) => s.id));
  } catch {
    return undefined;
  }
}

/**
 * Registro de lo ya enviado (id → cuándo), publicado junto a los datos. Sustituye a comparar con el safety.json anterior:
 * así una crítica que ya estaba cuando se desplegó, o que apareció durante un hueco de publicación, se avisa igualmente UNA vez.
 * undefined = no se pudo leer (no se envía nada, por si ya se había avisado); 404 = aún no existe (registro vacío).
 */
export async function fetchSentLedger(url: string): Promise<Record<string, number> | undefined> {
  try {
    const res = await fetch(`${url}?x=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return {};
    if (!res.ok) return undefined;
    const j: any = await res.json();
    return j && typeof j.sent === 'object' && j.sent ? j.sent : {};
  } catch {
    return undefined;
  }
}

/** Registro nuevo: lo enviado ahora, más lo anterior que siga siendo crítico (si deja de serlo y reaparece, se avisa de nuevo). */
export function nextLedger(signals: { id: string; severity: string }[], ledger: Record<string, number>, sentNow: string[], nowSec: number): Record<string, number> {
  const out: Record<string, number> = {};
  const stillCritical = new Set(signals.filter((s) => s.severity === 'critical').map((s) => s.id));
  for (const [id, t] of Object.entries(ledger)) if (stillCritical.has(id)) out[id] = t;
  for (const id of sentNow) out[id] = nowSec;
  return out;
}

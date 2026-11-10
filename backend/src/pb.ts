// Lectura de feeds GTFS-RT en protobuf (Euskotren, Metro Bilbao, FGC). Devuelve la misma estructura que los
// feeds JSON de Renfe, de modo que se pueden usar los mismos analizadores.
import gtfs from 'gtfs-realtime-bindings';

export interface PbFeed {
  /** Epoch seg. de cabecera. */
  timestamp: number;
  entities: any[];
}

const UAS = [
  'Anden-backend/0.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
];

/**
 * Descarga un feed protobuf. Algunos portales devuelven una página HTML (bloqueo o redirección) a ciertos clientes:
 * se reintenta con otra cabecera y, si persiste, el error dice qué se recibió.
 */
export async function fetchPb(url: string): Promise<PbFeed> {
  let last = '';
  for (const ua of UAS) {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'application/octet-stream, */*' },
      signal: AbortSignal.timeout(25_000),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) { last = `HTTP ${res.status}`; continue; }
    if (bytes[0] === 0x3c) { // '<': HTML en lugar de protobuf
      const head = new TextDecoder().decode(bytes.slice(0, 80)).replace(/\s+/g, ' ');
      last = `HTML (${res.headers.get('content-type')}) en lugar de protobuf: ${head}`;
      continue;
    }
    const FM = gtfs.transit_realtime.FeedMessage;
    const msg: any = FM.toObject(FM.decode(bytes), { longs: String, enums: String });
    return { timestamp: Number(msg.header?.timestamp) || 0, entities: msg.entity ?? [] };
  }
  throw new Error(`${url}: ${last}`);
}

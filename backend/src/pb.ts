// Lectura de feeds GTFS-RT en protobuf (Euskotren, Metro Bilbao, FGC). Devuelve la misma estructura que los
// feeds JSON de Renfe, de modo que se pueden usar los mismos analizadores.
import gtfs from 'gtfs-realtime-bindings';

export interface PbFeed {
  /** Epoch seg. de cabecera. */
  timestamp: number;
  entities: any[];
}

export async function fetchPb(url: string): Promise<PbFeed> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Anden-backend/0.1' }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const FM = gtfs.transit_realtime.FeedMessage;
  const msg: any = FM.toObject(FM.decode(new Uint8Array(await res.arrayBuffer())), { longs: String, enums: String });
  return { timestamp: Number(msg.header?.timestamp) || 0, entities: msg.entity ?? [] };
}

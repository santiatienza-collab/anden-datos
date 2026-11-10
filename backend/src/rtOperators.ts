// Operadores con GTFS estático y GTFS-RT abiertos (protobuf), además de Renfe.
// Euskotren y Metro Bilbao: Open Data Euskadi (Moveuskadi). FGC: Dades obertes de FGC.
import type { Network } from './model.ts';

type Url = string | (() => Promise<string>);

export interface RtOperator {
  id: string;
  /** Clave del feed estático en STATIC_FEEDS. */
  feedId: string;
  network: Network;
  prefix: string;
  trips: Url;
  /** Sin posiciones propias (Euskotren): se estiman con el horario y el retraso medido. */
  vehicles?: Url;
  alerts?: Url;
}

const EUSKADI = 'https://opendata.euskadi.eus/transport/moveuskadi/';

/** FGC publica cada feed como un fichero de un conjunto de datos; la URL del fichero cambia, así que se consulta. */
const fgcFile = (dataset: string): (() => Promise<string>) => async () => {
  const res = await fetch(
    `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/${dataset}/records?limit=1`,
    { headers: { 'User-Agent': 'Anden-backend/0.1' }, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`FGC ${dataset}: HTTP ${res.status}`);
  const url = ((await res.json()) as any).results?.[0]?.file?.url;
  if (!url) throw new Error(`FGC ${dataset}: sin fichero`);
  return url;
};

export const RT_OPERATORS: RtOperator[] = [
  {
    id: 'euskotren', feedId: 'euskotren-gtfs', network: 'euskotren', prefix: 'eus-',
    trips: EUSKADI + 'euskotren/gtfsrt_euskotren_trip_updates.pb',
    alerts: EUSKADI + 'euskotren/gtfsrt_euskotren_alerts.pb',
  },
  {
    id: 'metrobilbao', feedId: 'metrobilbao-gtfs', network: 'metrobilbao', prefix: 'mbi-',
    trips: EUSKADI + 'metro_bilbao/gtfsrt_metro_bilbao_trip_updates.pb',
    vehicles: EUSKADI + 'metro_bilbao/gtfsrt_metro_bilbao_vehicle_positions.pb',
  },
  {
    id: 'fgc', feedId: 'fgc-gtfs', network: 'fgc', prefix: 'fgc-',
    // Sus posiciones usan identificadores de viaje distintos a los de horarios y retrasos (no se pueden enlazar) y su feed
    // de avisos solo trae notas de horario, no incidencias: se usan los retrasos y se estima la posición con el horario.
    trips: fgcFile('trip-updates-gtfs_realtime'),
  },
];

export const resolveUrl = (u: Url): Promise<string> => (typeof u === 'string' ? Promise.resolve(u) : u());

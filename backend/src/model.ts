// Modelo común de Andén. Todas las fuentes se convierten a estos tipos.

export type SourceId =
  | 'renfe-gtfs-cercanias'
  | 'renfe-gtfs-ld'
  | 'renfe-rt-cercanias'
  | 'renfe-rt-ld';

export type Network = 'cercanias' | 'ld' | 'mallorca';

export type Level = 'green' | 'amber' | 'red' | 'gray';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Route {
  id: string;
  shortName: string;
  longName: string;
  color?: string;
  network: Network;
}

/** Viaje del GTFS estático (solo lo necesario para unir con tiempo real). */
export interface Trip {
  routeId: string;
  serviceId: string;
  shapeId?: string;
}

export interface TripDelay {
  tripId: string;
  routeId?: string;
  delaySec: number;
  cancelled: boolean;
  skippedStops: string[];
  /** Epoch seg. del dato (cabecera del feed). */
  updatedAt: number;
  network: Network;
}

export interface TrainPosition {
  tripId: string;
  routeId?: string;
  label: string;
  lat?: number;
  lon?: number;
  /** 'exact' = GPS del feed; 'stop' = posición de la última parada; */
  positionBasis: 'exact' | 'stop' | 'schedule' | 'none';
  stopId?: string;
  status?: string;
  delaySec?: number;
  updatedAt: number;
  network: Network;
}

export type Severity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'accessibility' | 'strike' | 'works' | 'bus' | 'disruption' | 'other';

/** Detalle de avisos de accesibilidad (ascensores, escaleras, estación inaccesible…). */
export interface AccessibilityInfo {
  element: 'station' | 'elevator' | 'escalator' | 'platform' | 'other';
  /** El texto indica que la estación entera queda inaccesible para movilidad reducida. */
  stationInaccessible: boolean;
  /** out = fuera de servicio; restored = restablecido. */
  state: 'out' | 'restored';
}

export interface Alert {
  id: string;
  routeIds: string[];
  stopIds: string[];
  text: string;
  activeFrom?: number;
  activeTo?: number;
  severity: Severity;
  category: AlertCategory;
  accessibility?: AccessibilityInfo;
  /** Cómo se obtuvo la severidad. Los feeds de Renfe no traen cause/effect. */
  severityBasis: 'feed' | 'text-heuristic';
  updatedAt: number;
}

export interface RouteStatus {
  routeId: string;
  level: Level;
  reasons: string[];
  trips: number;
  delayed5: number;
  delayed15: number;
  cancelled: number;
  alertIds: string[];
  /** Antigüedad (s) del dato más viejo usado. */
  dataAgeSec: number | null;
}

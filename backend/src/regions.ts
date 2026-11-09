// Comunidades autónomas: asigna cada punto (tren o estación) a su comunidad por polígonos.
// Datos: Natural Earth (dominio público), generados con tools/geo/build-regions.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locate, type Area } from './geo.ts';

export interface RegionInfo {
  id: string;
  name: string;
  bbox: [number, number, number, number];
}

const FILE = join(import.meta.dirname, '..', 'data', 'regions.json');
let regions: Area[] = [];
try {
  regions = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error('[regiones] no se pudo cargar regions.json:', (e as Error).message);
}

export const regionList = (): RegionInfo[] => regions.map(({ id, name, bbox }) => ({ id, name, bbox }));

/** Comunidad autónoma de un punto (id), o undefined si está fuera de España. */
export function regionOf(lat: number, lon: number): string | undefined {
  return locate(regions, lat, lon)?.id;
}

/** Contornos de las comunidades en GeoJSON (para dibujarlas y tocarlas en el mapa). */
export function regionsGeoJson() {
  return {
    type: 'FeatureCollection',
    features: regions.map((r) => ({
      type: 'Feature',
      properties: { id: r.id, name: r.name },
      geometry: { type: 'MultiPolygon', coordinates: r.polys },
    })),
  };
}

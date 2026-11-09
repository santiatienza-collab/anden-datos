// Comunidades autónomas: asigna cada punto (tren o estación) a su comunidad por polígonos.
// Datos: Natural Earth (dominio público), generados con tools/geo/build-regions.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Ring = [number, number][];
interface RegionData {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // oeste, sur, este, norte
  polys: Ring[][]; // cada polígono: [anillo exterior, ...huecos]
}

export interface RegionInfo {
  id: string;
  name: string;
  bbox: [number, number, number, number];
}

const FILE = join(import.meta.dirname, '..', 'data', 'regions.json');
let regions: RegionData[] = [];
try {
  regions = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error('[regiones] no se pudo cargar regions.json:', (e as Error).message);
}

export const regionList = (): RegionInfo[] => regions.map(({ id, name, bbox }) => ({ id, name, bbox }));

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (x: number, y: number, p: Ring[]) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));

function contains(r: RegionData, lon: number, lat: number): boolean {
  const [w, s, e, n] = r.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n && r.polys.some((p) => inPolygon(lon, lat, p));
}

/** Distancia² (grados) al vértice más cercano de la región: solo para puntos fuera de todo polígono. */
function nearest(r: RegionData, lon: number, lat: number): number {
  let best = Infinity;
  for (const p of r.polys) for (const [x, y] of p[0]) best = Math.min(best, (x - lon) ** 2 + (y - lat) ** 2);
  return best;
}

/**
 * Comunidad autónoma de un punto. Si cae fuera de todos los polígonos (costa, simplificación del
 * contorno) se asigna la más cercana, siempre que esté a menos de ~0,1° (≈ 10 km); si no, undefined.
 */
export function regionOf(lat: number, lon: number): string | undefined {
  for (const r of regions) if (contains(r, lon, lat)) return r.id;
  let bestId: string | undefined, best = 0.01;
  for (const r of regions) {
    const d = nearest(r, lon, lat);
    if (d < best) { best = d; bestId = r.id; }
  }
  return bestId;
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

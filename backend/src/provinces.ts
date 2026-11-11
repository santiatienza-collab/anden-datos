// Provincias: asigna cada estación a su provincia por polígonos.
// Datos: Eurostat GISCO NUTS 2021 (© EuroGeographics), generados con tools/geo/build-geo.mjs (ver geo.config.json).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locate, type Area } from './geo.ts';

const FILE = join(import.meta.dirname, '..', 'data', 'provinces.json');
let provinces: Area[] = [];
try {
  provinces = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error('[provincias] no se pudo cargar provinces.json:', (e as Error).message);
}

export const provinceCount = () => provinces.length;

/** Nombre de la provincia de un punto, o undefined si está fuera de España. */
export function provinceOf(lat: number, lon: number, tolerance?: number): string | undefined {
  return locate(provinces, lat, lon, tolerance)?.name;
}

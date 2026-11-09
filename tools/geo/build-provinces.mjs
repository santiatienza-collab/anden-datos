// Escribe backend/data/provinces.json a partir de las provincias de Natural Earth (dominio público).
// Uso: node tools/geo/build-provinces.mjs
import { readFileSync, writeFileSync } from 'node:fs';

// Natural Earth usa nombres antiguos o en inglés para algunas provincias.
const NAMES = {
  'Lérida': 'Lleida', 'Gerona': 'Girona', 'Orense': 'Ourense', 'La Coruña': 'A Coruña',
  'Baleares': 'Illes Balears', 'Álava': 'Álava', 'Castellón': 'Castellón',
};
const round = (n) => Math.round(n * 1e4) / 1e4;

const src = JSON.parse(readFileSync(new URL('./esp-provincias.raw.json', import.meta.url), 'utf8'));
const out = src.features.map((f) => {
  const name = NAMES[f.properties.name] ?? f.properties.name;
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
    .map((p) => p.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { id: name.toLowerCase(), name, bbox: [w, s, e, n], polys };
}).sort((a, b) => a.name.localeCompare(b.name, 'es'));
writeFileSync(new URL('../../backend/data/provinces.json', import.meta.url), JSON.stringify(out));
console.log(out.length, 'provincias:', out.map((p) => p.name).join(', '));

// Agrupa las provincias de Natural Earth (dominio público) por comunidad autónoma y escribe
// backend/data/regions.json. Uso: node tools/geo/build-regions.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const NAMES = {
  'Andalucía': 'Andalucía', 'Aragón': 'Aragón', 'Asturias': 'Principado de Asturias', 'Islas Baleares': 'Illes Balears',
  'Canary Is.': 'Canarias', 'Cantabria': 'Cantabria', 'Castilla y León': 'Castilla y León',
  'Castilla-La Mancha': 'Castilla-La Mancha', 'Cataluña': 'Cataluña', 'Valenciana': 'Comunitat Valenciana',
  'Extremadura': 'Extremadura', 'Galicia': 'Galicia', 'Madrid': 'Comunidad de Madrid', 'Murcia': 'Región de Murcia',
  'Foral de Navarra': 'Navarra', 'País Vasco': 'País Vasco', 'La Rioja': 'La Rioja', 'Ceuta': 'Ceuta', 'Melilla': 'Melilla',
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const round = (n) => Math.round(n * 1e4) / 1e4;

const src = JSON.parse(readFileSync(new URL('./esp-provincias.raw.json', import.meta.url), 'utf8'));
const byRegion = new Map();
for (const f of src.features) {
  const name = NAMES[f.properties.region];
  if (!name) throw new Error('región sin nombre: ' + f.properties.region);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const r = byRegion.get(name) ?? [];
  for (const p of polys) r.push(p.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
  byRegion.set(name, r);
}
const regions = [...byRegion].map(([name, polys]) => {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { id: slug(name), name, bbox: [w, s, e, n], polys };
}).sort((a, b) => a.name.localeCompare(b.name, 'es'));
writeFileSync(new URL('../../backend/data/regions.json', import.meta.url), JSON.stringify(regions));
console.log(regions.length, 'regiones');
regions.forEach((r) => console.log(r.id.padEnd(22), r.bbox.map((x) => x.toFixed(2)).join(' ')));

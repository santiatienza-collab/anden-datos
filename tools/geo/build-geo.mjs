// Genera los contornos de comunidades y provincias a partir de una fuente configurable (ver geo.config.json).
//   1. Descarga (y guarda en caché) el GeoJSON de la fuente.
//   2. Lo convierte a TopoJSON, que comparte los bordes entre vecinos: al simplificar no quedan huecos ni solapes.
//   3. Simplifica conservando la fracción de vértices indicada en "keep".
//   4. Agrupa por nombre (p. ej. varias islas = una provincia) y escribe backend/data/<capa>.json
//      (formato que usa el backend) y <capa>.topo.json (el TopoJSON ligero, por si se quiere usar tal cual).
// Uso: npm install && npm run geo      (dentro de tools/geo)
//      npm run geo -- regions          (solo una capa)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import { feature, merge } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const cfg = JSON.parse(readFileSync(join(here, 'geo.config.json'), 'utf8'));
const only = process.argv[2];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const idOf = { slug, lowercase: (s) => s.toLowerCase() };

async function load(level) {
  const url = cfg.source.url.replace('{resolution}', cfg.source.resolution).replace('{level}', level);
  const cache = join(here, 'cache', `${cfg.source.resolution}_L${level}_${slug(new URL(url).hostname)}.json`);
  if (!existsSync(cache)) {
    console.log('descargando', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(cache, 'utf8'));
}

const count = (geo) => {
  let n = 0;
  const walk = (c) => (typeof c[0] === 'number' ? 0 : Array.isArray(c[0][0]) ? c.forEach(walk) : (n += c.length));
  walk(geo.coordinates);
  return n;
};

for (const [name, layer] of Object.entries(cfg.layers)) {
  if (only && only !== name) continue;
  const raw = await load(layer.level);
  const { property, equals } = cfg.filter;
  const features = raw.features.filter((f) => f.properties[property] === equals);
  if (!features.length) throw new Error(`${name}: la fuente no tiene elementos con ${property}=${equals}`);

  // 1-3. TopoJSON → simplificación que conserva la topología
  let topo = topology({ [name]: { type: 'FeatureCollection', features } }, cfg.quantization);
  topo = presimplify(topo);
  const before = topo.arcs.reduce((n, a) => n + a.length, 0);
  topo = simplify(topo, quantile(topo, 1 - layer.keep));
  const after = topo.arcs.reduce((n, a) => n + a.length, 0);

  // 4. Agrupar por nombre (las islas de una misma provincia, etc.)
  const groups = new Map();
  for (const g of topo.objects[name].geometries) {
    const code = g.properties[cfg.idProperty];
    const label = layer.names[code];
    if (!label) throw new Error(`${name}: falta el nombre de ${code} (${g.properties.NUTS_NAME}) en geo.config.json`);
    (groups.get(label) ?? groups.set(label, []).get(label)).push(g);
  }
  const k = 10 ** cfg.decimals;
  const round = (n) => Math.round(n * k) / k;
  const out = [...groups].map(([label, geoms]) => {
    const m = merge(topo, geoms);
    const polys = (m.type === 'Polygon' ? [m.coordinates] : m.coordinates).map((p) => p.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { id: idOf[layer.idFrom](label), name: label, bbox: [w, s, e, n], polys };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  writeFileSync(join(root, layer.output), JSON.stringify(out));
  writeFileSync(join(root, layer.topo), JSON.stringify(topo));
  const bytes = (f) => (readFileSync(join(root, f)).length / 1024).toFixed(0) + ' KB';
  const verts = out.reduce((n, r) => n + r.polys.reduce((m, p) => m + p.reduce((q, ring) => q + ring.length, 0), 0), 0);
  console.log(`${name}: ${out.length} áreas · vértices ${before} → ${after} tras simplificar (${Math.round(layer.keep * 100)}%) · ${verts} en el resultado · ${layer.output} ${bytes(layer.output)} · ${layer.topo} ${bytes(layer.topo)}`);
}

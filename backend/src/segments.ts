// Tramos afectados por un aviso. Los avisos de Renfe casi nunca traen estaciones estructuradas, pero el texto dice
// "…una incidencia en la infraestructura entre El Clot y Sant Adrià de Besòs, y otra entre Mataró y Arenys de Mar…".
// Aquí se extraen esos pares de estaciones, se localizan por nombre y se dibuja el tramo siguiendo el trazado de la línea
// (si el feed lo trae) o, si no, en línea recta entre las dos estaciones.

export type LatLon = [number, number];

export interface Segment {
  from: string;
  to: string;
  /** Polilínea [lat, lon] del tramo. */
  path: LatLon[];
  /** 'shape' = sigue el trazado de la línea; 'straight' = recta entre las dos estaciones. */
  basis: 'shape' | 'straight';
}

export interface NamedStop { id: string; name: string; lat: number; lon: number }

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function km(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Minúsculas, sin tildes ni signos, sin prefijos como "estación de". */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(estaciones?|estacio|apeadero|apeader)\b/g, ' ')
    .replace(/^(de|del)s+/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Quita los artículos iniciales ("El Clot" → "clot") solo para comparar de forma flexible. */
const loose = (n: string) => n.replace(/^(el|la|los|las|els|les|l)\s+/, '').trim();

/** Pares de estaciones que el texto cita como extremos de un tramo ("entre A y B", "entre A e I", "de A a B"). */
export function extractPairs(text: string): [string, string][] {
  const t = text.replace(/\s+/g, ' ');
  const out: [string, string][] = [];
  const stop = String.raw`(?=\s*[,.;:()]|\s+y\s+(?:otra|otro|entre)\b|\s+(?:los|las|se|por|con|donde|debido|a causa|que|para|provoca|provocando|afecta|durante|hasta)\b|\s*$)`;
  const rx = new RegExp(String.raw`\bentre\s+(?:las\s+estaciones\s+de\s+|las\s+estaciones\s+|la\s+estaci[oó]n\s+de\s+|estaciones\s+de\s+)?(.+?)\s+[ye]\s+(?:la\s+estaci[oó]n\s+de\s+)?(.+?)${stop}`, 'gi');
  for (const m of t.matchAll(rx)) {
    const a = m[1].trim(), b = m[2].trim();
    if (a && b && a.length <= 45 && b.length <= 45) out.push([a, b]);
  }
  const rx2 = new RegExp(String.raw`\bde\s+([A-ZÁÉÍÓÚÑÀÈÒÇ][\p{L}.'·\- ]{2,40}?)\s+a\s+([A-ZÁÉÍÓÚÑÀÈÒÇ][\p{L}.'·\- ]{2,40}?)${stop}`, 'gu');
  for (const m of t.matchAll(rx2)) out.push([m[1].trim(), m[2].trim()]);
  const seen = new Set<string>();
  return out.filter(([a, b]) => { const k = normName(a) + '|' + normName(b); if (seen.has(k)) return false; seen.add(k); return true; });
}

export class StopIndex {
  private byName = new Map<string, NamedStop[]>();
  private all: [string, NamedStop][] = [];
  constructor(stops: Iterable<NamedStop>) {
    for (const s of stops) {
      const n = normName(s.name);
      if (!n) continue;
      (this.byName.get(n) ?? this.byName.set(n, []).get(n)!).push(s);
      this.all.push([n, s]);
    }
  }
  find(name: string): NamedStop[] {
    const n = normName(name);
    if (!n) return [];
    const exact = this.byName.get(n);
    if (exact?.length) return exact;
    const l = loose(n);
    const looseHits = this.all.filter(([k]) => loose(k) === l).map(([, s]) => s);
    if (looseHits.length) return looseHits;
    if (n.length < 5) return [];
    // El texto abrevia a veces ("Sant Adrià" por "Sant Adrià de Besòs"): empieza igual o lo contiene como palabras.
    return this.all.filter(([k]) => k.startsWith(n + ' ') || k.endsWith(' ' + n) || k.includes(' ' + n + ' ')).map(([, s]) => s);
  }
}

/** Entre los candidatos de cada extremo, la pareja más cercana (descarta homónimos de otras regiones). */
function bestPair(as: NamedStop[], bs: NamedStop[], maxKm: number): [NamedStop, NamedStop] | null {
  let best: [NamedStop, NamedStop] | null = null, bd = Infinity;
  for (const a of as) for (const b of bs) {
    if (a.id === b.id) continue;
    const d = km([a.lat, a.lon], [b.lat, b.lon]);
    if (d > 0.05 && d < bd) { bd = d; best = [a, b]; }
  }
  return best && bd <= maxKm ? best : null;
}

function nearestIndex(line: LatLon[], p: LatLon): { i: number; d: number } {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = (line[i][0] - p[0]) ** 2 + ((line[i][1] - p[1]) * Math.cos(rad(p[0]))) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return { i: bi, d: Math.sqrt(bd) * 111.2 };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Recorta el trazado entre las dos estaciones; null si ninguno de los trazados pasa cerca de ambas. */
export function cutShape(shapes: LatLon[][], a: LatLon, b: LatLon, maxOffKm = 1.5): LatLon[] | null {
  let best: { path: LatLon[]; score: number } | null = null;
  for (const line of shapes) {
    if (line.length < 2) continue;
    const ia = nearestIndex(line, a), ib = nearestIndex(line, b);
    if (ia.d > maxOffKm || ib.d > maxOffKm || ia.i === ib.i) continue;
    const lo = Math.min(ia.i, ib.i), hi = Math.max(ia.i, ib.i);
    let path = line.slice(lo, hi + 1);
    if (ia.i > ib.i) path = path.reverse();
    const score = ia.d + ib.d;
    if (!best || score < best.score) best = { path, score };
  }
  if (!best) return null;
  const p = best.path;
  if (p.length > 160) { const step = Math.ceil(p.length / 160); const q = p.filter((_, i) => i % step === 0); if (q[q.length - 1] !== p[p.length - 1]) q.push(p[p.length - 1]); return q.map(([x, y]) => [round5(x), round5(y)]); }
  return p.map(([x, y]) => [round5(x), round5(y)]);
}

/**
 * Tramos citados por el texto de un aviso. `shapesOf` devuelve los trazados de las líneas del aviso para seguirlos.
 * Máximo 6 tramos y 120 km cada uno (un par mal emparejado no debe dibujar media España).
 */
export function segmentsFromText(text: string, index: StopIndex, shapes: LatLon[][]): Segment[] {
  const out: Segment[] = [];
  for (const [na, nb] of extractPairs(text)) {
    const pair = bestPair(index.find(na), index.find(nb), 120);
    if (!pair) continue;
    const [a, b] = pair;
    const pa: LatLon = [a.lat, a.lon], pb: LatLon = [b.lat, b.lon];
    const cut = cutShape(shapes, pa, pb);
    out.push({ from: a.name, to: b.name, path: cut ?? [pa, pb].map(([x, y]) => [round5(x), round5(y)] as LatLon), basis: cut ? 'shape' : 'straight' });
    if (out.length >= 6) break;
  }
  return out;
}

/** Segmento de una sola recta entre dos puntos (p. ej. tren que se acerca → tren detenido). */
export function lineSegment(from: string, to: string, a: LatLon, b: LatLon): Segment {
  return { from, to, basis: 'straight', path: [[round5(a[0]), round5(a[1])], [round5(b[0]), round5(b[1])]] };
}

/** Punto medio del primer tramo (o de la polilínea) para centrar el mapa. */
export function centroid(segments: Segment[]): LatLon | undefined {
  const s = segments[0];
  if (!s?.path.length) return undefined;
  return s.path[Math.floor(s.path.length / 2)];
}

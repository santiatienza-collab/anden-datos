// Localización de puntos en áreas (comunidades, provincias) por polígonos.
type Ring = [number, number][];

export interface Area {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // oeste, sur, este, norte
  polys: Ring[][]; // cada polígono: [anillo exterior, ...huecos]
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (x: number, y: number, p: Ring[]) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));

function contains(a: Area, lon: number, lat: number): boolean {
  const [w, s, e, n] = a.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n && a.polys.some((p) => inPolygon(lon, lat, p));
}

/** Distancia² (grados) al vértice más cercano del área: solo para puntos fuera de todo polígono. */
function nearest(a: Area, lon: number, lat: number): number {
  let best = Infinity;
  for (const p of a.polys) for (const [x, y] of p[0]) best = Math.min(best, (x - lon) ** 2 + (y - lat) ** 2);
  return best;
}

/**
 * Área que contiene el punto. Si cae fuera de todas (costa, simplificación del contorno) se asigna la más
 * cercana, siempre que esté a menos de ~0,1° (≈ 10 km); si no, undefined.
 */
export function locate(areas: Area[], lat: number, lon: number, tolerance = 0.01): Area | undefined {
  for (const a of areas) if (contains(a, lon, lat)) return a;
  let best: Area | undefined, bestD = tolerance;
  for (const a of areas) {
    const d = nearest(a, lon, lat);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

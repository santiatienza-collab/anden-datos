// Compañía y tipo de servicio de cada tren, deducidos del nombre de su línea.
// Solo hay datos abiertos de Renfe y de SFM (Mallorca): Ouigo, Iryo, FGC o Euskotren no publican un feed
// equivalente en el que se apoye esta app, así que no aparecen.
import type { Network } from './model.ts';

export type Service = 'av' | 'ld' | 'avant' | 'md' | 'cercanias' | 'rodalies' | 'sfm' | 'euskotren' | 'metrobilbao' | 'fgc';

export const SERVICE_COMPANY: Record<Service, string> = {
  av: 'Renfe', ld: 'Renfe', avant: 'Renfe', md: 'Renfe', cercanias: 'Renfe', rodalies: 'Renfe', sfm: 'SFM',
  euskotren: 'Euskotren', metrobilbao: 'Metro Bilbao', fgc: 'FGC',
};

/**
 * - av: Alta Velocidad (AVE, AVLO)
 * - ld: Larga Distancia (Alvia, Euromed, Intercity, Talgo…)
 * - avant: Avant (alta velocidad de media distancia)
 * - md: Media Distancia (MD, Regional, Regional Exprés, Proximidad)
 * - cercanias: Cercanías (C1, C2…)
 * - rodalies: Rodalies de Catalunya (R1, R2S, RG1, RL4, T1…)
 * - sfm: Serveis Ferroviaris de Mallorca (tren T1–T3 y metro M1)
 * - euskotren, metrobilbao, fgc: operadores con feed propio (Euskadi y Cataluña)
 */
export function classifyService(network: Network, line: string | undefined): Service {
  if (network === 'mallorca') return 'sfm';
  if (network === 'euskotren') return 'euskotren';
  if (network === 'metrobilbao') return 'metrobilbao';
  if (network === 'fgc') return 'fgc';
  const l = (line ?? '').trim().toUpperCase();
  if (network === 'cercanias') {
    // En Cercanías, "C…" son Cercanías y "R…"/"T…" las líneas de Rodalies; lo demás (MD, Regional) es Media Distancia.
    if (/^R[A-Z]?\d/.test(l) || /^T\d/.test(l)) return 'rodalies';
    if (/^C\d/.test(l)) return 'cercanias';
    if (/^(MD|REG|PROX)/.test(l)) return 'md';
    return 'cercanias';
  }
  if (/^(AVE|AVLO)/.test(l)) return 'av';
  if (/^AVANT/.test(l)) return 'avant';
  if (/^(MD|REG|PROX)/.test(l)) return 'md';
  return 'ld'; // Alvia, Euromed, Intercity, Talgo, Trenhotel…
}

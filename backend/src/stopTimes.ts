// Índice de horarios en SQLite. stop_times.txt (>250 MB) se procesa en streaming y nunca se
// carga entero en memoria; el resultado (índice por parada) es compacto y se consulta bajo demanda.
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Unzip, UnzipInflate } from 'fflate';

const DIR = join(import.meta.dirname, '..', 'data', 'cache');
export const dbPath = (id: string) => join(DIR, `times-${id}.db`);

const toSec = (t: string): number | null => {
  const m = t.match(/^(\d+):(\d\d):(\d\d)$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export function openIndex(id: string): DatabaseSync | null {
  try {
    const db = new DatabaseSync(dbPath(id), { readOnly: true });
    db.prepare('SELECT 1 FROM meta LIMIT 1').get();
    return db;
  } catch {
    return null;
  }
}

function indexedHash(id: string): string | null {
  const db = openIndex(id);
  try {
    return (db?.prepare("SELECT v FROM meta WHERE k = 'hash'").get() as { v: string } | undefined)?.v ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** Construye (o reutiliza, si el zip no cambió) el índice de horarios. Devuelve true si lo reconstruyó. */
export async function ensureIndex(
  id: string,
  zipPath: string,
  zipHash: string,
  opts: { prefix?: string; tripFilter?: Set<string> } = {},
): Promise<boolean> {
  if (indexedHash(id) === zipHash) return false;
  await mkdir(DIR, { recursive: true });
  const tmp = dbPath(id) + '.tmp';
  await rm(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
    CREATE TABLE st (stop_id TEXT NOT NULL, dep INTEGER NOT NULL, trip_id TEXT NOT NULL, arr INTEGER, seq INTEGER,
      PRIMARY KEY (stop_id, dep, trip_id)) WITHOUT ROWID;
    CREATE TABLE trip_ends (trip_id TEXT PRIMARY KEY, first_stop TEXT, last_stop TEXT) WITHOUT ROWID;
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
  const ins = db.prepare('INSERT OR IGNORE INTO st VALUES (?, ?, ?, ?, ?)');
  const insEnd = db.prepare('INSERT OR REPLACE INTO trip_ends VALUES (?, ?, ?)');

  let cols: Record<string, number> | null = null;
  let carry = '';
  let curTrip = '', firstStop = '', lastStop = '';
  const dec = new TextDecoder();
  db.exec('BEGIN');
  const flushTrip = () => { if (curTrip) insEnd.run(curTrip, firstStop, lastStop); };
  const onLine = (line: string) => {
    if (!line) return;
    const f = line.replace(/\r$/, '').split(',');
    if (!cols) { cols = Object.fromEntries(f.map((h, i) => [h.trim(), i])); return; }
    const rawTrip = f[cols.trip_id].trim();
    if (opts.tripFilter && !opts.tripFilter.has(rawTrip)) return;
    const px = opts.prefix ?? '';
    const trip = px + rawTrip, stop = px + f[cols.stop_id].trim();
    const arr = toSec(f[cols.arrival_time].trim()), dep = toSec(f[cols.departure_time].trim());
    if ((dep ?? arr) == null) return;
    ins.run(stop, (dep ?? arr) as number, trip, arr, Number(f[cols.stop_sequence]));
    if (trip !== curTrip) { flushTrip(); curTrip = trip; firstStop = stop; }
    lastStop = stop;
  };
  const onData = (chunk: Uint8Array, final: boolean) => {
    carry += dec.decode(chunk, { stream: !final });
    const lines = carry.split('\n');
    carry = lines.pop() ?? '';
    for (const l of lines) onLine(l);
    if (final) { onLine(carry); carry = ''; }
  };

  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((file) => {
      if (file.name !== 'stop_times.txt') return;
      file.ondata = (err, chunk, final) => { if (err) reject(err); else onData(chunk, final); };
      file.start();
    });
    unzip.register(UnzipInflate);
    const rs = createReadStream(zipPath);
    rs.on('data', (c) => unzip.push(c as Uint8Array));
    rs.on('end', () => { unzip.push(new Uint8Array(0), true); resolve(); });
    rs.on('error', reject);
  });
  flushTrip();
  db.exec('COMMIT');
  db.prepare("INSERT INTO meta VALUES ('hash', ?)").run(zipHash);
  db.exec('VACUUM');
  db.close();
  await rm(dbPath(id), { force: true });
  await rename(tmp, dbPath(id));
  return true;
}

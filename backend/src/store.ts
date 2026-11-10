import { STATIC_FEEDS, loadStatic, type ScheduledStop, type StaticData } from './gtfsStatic.ts';
import { positionNow, scheduledEpochFor, scheduledPositions } from './scheduled.ts';
import { fetchPb } from './pb.ts';
import { RT_OPERATORS, resolveUrl, type RtOperator } from './rtOperators.ts';
import { ensureIndex, openIndex } from './stopTimes.ts';
import type { Calendar } from './calendar.ts';
import type { FeedIndex } from './schedule.ts';
import type { DatabaseSync } from 'node:sqlite';
import { RT_URLS, fetchFeed, parseAlerts, parseTripUpdates, parseVehicles } from './renfeRealtime.ts';
import { routeStatus, trainLevel } from './semaphore.ts';
import { regionOf } from './regions.ts';
import { provinceOf } from './provinces.ts';
import { classifyService, SERVICE_COMPANY } from './operators.ts';
import type { Alert, Route, RouteStatus, Stop, TrainPosition, Trip, TripDelay } from './model.ts';

export interface SourceHealth {
  lastOkAt?: number;
  lastError?: string;
  /** Marca de tiempo de la cabecera del feed (edad real del dato). */
  feedTimestamp?: number;
  count?: number;
}

/** Los códigos numéricos de Renfe empiezan por el país UIC: 71 = España; 87 = Francia, 94 = Portugal… */
export const isForeignId = (id: string) => /^[0-9]+$/.test(id) && !id.startsWith('71');

const nowSec = () => Math.floor(Date.now() / 1000);

/** Estado en memoria, reconstruido por los ciclos de refresco. */
export class Store {
  stops = new Map<string, Stop>();
  routes = new Map<string, Route>();
  trips = new Map<string, Trip>();
  shapes = new Map<string, [number, number][]>();
  delays = new Map<string, TripDelay>();
  trains: TrainPosition[] = [];
  alerts: Alert[] = [];
  health: Record<string, SourceHealth> = {};
  calendars = new Map<string, Calendar>();
  /** Recorridos horarios de las redes sin tiempo real (Mallorca), por feed. */
  scheduledTrips = new Map<string, Map<string, ScheduledStop[]>>();
  private dbs = new Map<string, DatabaseSync>();
  private stopAliases = new Map<string, Map<string, string>>();
  private alertSources = new Map<string, Alert[]>();
  private operatorDelays = new Map<string, Map<string, TripDelay>>();
  private operatorTrains = new Map<string, TrainPosition[]>();
  /** Estado del índice de horarios por feed: indexing | ready | error. */
  scheduleState: Record<string, string> = {};

  /** Índices de horarios listos para consultar. */
  feedIndexes(): FeedIndex[] {
    const out: FeedIndex[] = [];
    for (const [id, feed] of Object.entries(STATIC_FEEDS)) {
      const db = this.dbs.get(id), calendar = this.calendars.get(id);
      if (db && calendar) out.push({ network: feed.network, db, calendar });
    }
    return out;
  }

  /** Indexa horarios en segundo plano; el servidor responde mientras tanto. */
  async indexSchedules(data: Map<string, StaticData>) {
    for (const [id, d] of data) {
      this.scheduleState[id] = 'indexing';
      try {
        const rebuilt = await ensureIndex(id, d.zipPath, d.zipHash, d.indexOpts);
        if (rebuilt) { this.dbs.get(id)?.close(); this.dbs.delete(id); }
        if (!this.dbs.has(id)) {
          const db = openIndex(id);
          if (!db) throw new Error('índice no disponible');
          this.dbs.set(id, db);
        }
        this.scheduleState[id] = 'ready';
      } catch (e) { this.scheduleState[id] = 'error: ' + (e as Error).message; console.error('[horarios]', id, (e as Error).message); }
    }
  }

  private mark(id: string, patch: SourceHealth | Error) {
    const h = (this.health[id] ??= {});
    if (patch instanceof Error) h.lastError = patch.message;
    else Object.assign(h, patch, { lastOkAt: nowSec(), lastError: undefined });
  }

  async refreshStatic(opts: { awaitIndex?: boolean } = {}) {
    const loaded = new Map<string, StaticData>();
    await Promise.all(Object.keys(STATIC_FEEDS).map(async (id) => {
      try {
        const d: StaticData = await loadStatic(id);
        for (const [k, v] of d.stops) this.stops.set(k, v);
        for (const [k, v] of d.routes) this.routes.set(k, v);
        for (const [k, v] of d.trips) this.trips.set(k, v);
        for (const [k, v] of d.shapes) this.shapes.set(k, v);
        this.routeShape = undefined;
        this.routeRegionCache.clear();
        this.calendars.set(id, d.calendar);
        if (d.scheduled) this.scheduledTrips.set(id, d.scheduled);
        this.stopAliases.set(id, d.stopAlias);
        loaded.set(id, d);
        this.mark(id, { count: d.routes.size });
      } catch (e) { this.mark(id, e as Error); console.error(`[static] ${id}:`, (e as Error).message); }
    }));
    // En el servidor el índice se construye en segundo plano; en las instantáneas se espera.
    const indexing = this.indexSchedules(loaded);
    if (opts.awaitIndex) await indexing;
  }

  async refreshRealtime() {
    const next = new Map<string, TripDelay>();
    const nets = [['cercanias', 'cercanias-trips'], ['ld', 'ld-trips']] as const;
    const tripFeeds = await Promise.allSettled(nets.map(([, k]) => fetchFeed(RT_URLS[k])));
    tripFeeds.forEach((r, i) => {
      const [net, key] = nets[i];
      const id = `renfe-rt-${key}`;
      if (r.status === 'rejected') { this.mark(id, r.reason); return; }
      const list = parseTripUpdates(r.value, net, this.trips);
      for (const d of list) next.set(d.tripId, d);
      this.mark(id, { feedTimestamp: r.value.timestamp, count: list.length });
    });
    // Si un feed falló, conservar sus retrasos anteriores (caducarán solos por antigüedad).
    for (const [k, d] of this.delays) {
      const failed = tripFeeds[d.network === 'ld' ? 1 : 0].status === 'rejected';
      if (failed && !next.has(k)) next.set(k, d);
    }
    this.delays = next;

    const vnets = [['cercanias', 'cercanias-vehicles'], ['ld', 'ld-vehicles']] as const;
    const vFeeds = await Promise.allSettled(vnets.map(([, k]) => fetchFeed(RT_URLS[k])));
    const trains: TrainPosition[] = [];
    vFeeds.forEach((r, i) => {
      const [net, key] = vnets[i];
      const id = `renfe-rt-${key}`;
      if (r.status === 'rejected') { this.mark(id, r.reason); return; }
      const list = parseVehicles(r.value, net, this.trips, this.stops, this.delays);
      trains.push(...list);
      this.mark(id, { feedTimestamp: r.value.timestamp, count: list.length });
    });
    // Larga distancia: Renfe publica el retraso de muchos trenes que no traen GPS. Se colocan con el horario desplazado
    // por su retraso (posición estimada). Los viajes que aún no han salido no aparecen: no están en circulación.
    const ldSched = this.scheduledTrips.get('renfe-gtfs-ld'), ldCal = this.calendars.get('renfe-gtfs-ld');
    if (ldSched && ldCal) {
      const at = nowSec(), have = new Set(trains.map((t) => t.tripId));
      for (const d of this.delays.values()) {
        if (d.network !== 'ld' || have.has(d.tripId) || d.measured === false || at - d.updatedAt > 600) continue;
        const trip = this.trips.get(d.tripId), list = ldSched.get(d.tripId);
        if (!trip || !list) continue;
        const spot = positionNow(at, list, trip, ldCal, this.stops, d.cancelled ? 0 : d.delaySec);
        if (!spot) continue;
        trains.push({
          tripId: d.tripId, routeId: trip.routeId,
          // El id de viaje de larga distancia es "<nº de tren><fecha AAAA-MM-DD>": el número es la etiqueta del tren.
          label: d.tripId.replace(/\d{4}-\d{2}-\d{2}$/, ''),
          lat: spot.lat, lon: spot.lon, positionBasis: 'interpolated', stopId: spot.stopId,
          status: spot.atStop ? 'STOPPED_AT' : 'IN_TRANSIT_TO', delaySec: d.delaySec, updatedAt: d.updatedAt, network: 'ld',
        });
      }
    }
    this.trains = trains;

    try {
      const a = await fetchFeed(RT_URLS.alerts);
      const list = parseAlerts(a);
      this.alertSources.set('renfe', list);
      this.mark('renfe-alerts', { feedTimestamp: a.timestamp, count: list.length });
    } catch (e) { this.mark('renfe-alerts', e as Error); }

    // Otros operadores (Euskotren, Metro Bilbao, FGC) y fusión con lo de Renfe
    await this.refreshOperators();
    for (const m of this.operatorDelays.values()) for (const [k, d] of m) this.delays.set(k, d);
    this.trains = [...this.trains, ...[...this.operatorTrains.values()].flat()];
    this.alerts = [...this.alertSources.values()].flat();
  }

  /** Descarga el tiempo real de cada operador. Un operador que falla no afecta a los demás: se conserva su último dato. */
  private async refreshOperators() {
    await Promise.all(RT_OPERATORS.map((op) => this.refreshOperator(op)));
  }

  private async refreshOperator(op: RtOperator) {
    const sched = this.scheduledTrips.get(op.feedId);
    const cal = this.calendars.get(op.feedId);
    if (!sched || !cal) { this.mark(`${op.id}-rt-trips`, new Error('horarios no cargados')); return; }
    const opts = {
      prefix: op.prefix,
      stopAlias: this.stopAliases.get(op.feedId),
      scheduledEpoch: (trip: string, stop: string, start: string | undefined, predicted: number) =>
        scheduledEpochFor(sched.get(trip), stop, start, predicted),
    };
    try {
      const feed = await fetchPb(await resolveUrl(op.trips));
      const list = parseTripUpdates(feed, op.network, this.trips, opts);
      this.operatorDelays.set(op.id, new Map(list.map((d) => [d.tripId, d])));
      this.mark(`${op.id}-rt-trips`, { feedTimestamp: feed.timestamp, count: list.length });
    } catch (e) { this.mark(`${op.id}-rt-trips`, e as Error); }
    const delays = this.operatorDelays.get(op.id) ?? new Map<string, TripDelay>();

    if (op.vehicles) {
      try {
        const feed = await fetchPb(await resolveUrl(op.vehicles));
        const list = parseVehicles(feed, op.network, this.trips, this.stops, delays, opts).filter((t) => t.positionBasis !== 'none');
        this.operatorTrains.set(op.id, list);
        this.mark(`${op.id}-rt-vehicles`, { feedTimestamp: feed.timestamp, count: list.length });
      } catch (e) { this.mark(`${op.id}-rt-vehicles`, e as Error); }
    } else {
      // Sin posiciones propias: se interpola la posición con el horario desplazado por el retraso medido.
      const at = nowSec();
      const list: TrainPosition[] = [];
      for (const d of delays.values()) {
        if (d.cancelled || d.measured === false || at - d.updatedAt > 600) continue;
        const trip = this.trips.get(d.tripId), stops = sched.get(d.tripId);
        if (!trip || !stops) continue;
        const spot = positionNow(at, stops, trip, cal, this.stops, d.delaySec);
        if (!spot) continue;
        const route = this.routes.get(trip.routeId);
        list.push({
          tripId: d.tripId, routeId: trip.routeId, label: route?.shortName ?? d.tripId,
          lat: spot.lat, lon: spot.lon, positionBasis: 'interpolated', stopId: spot.stopId,
          status: spot.atStop ? 'STOPPED_AT' : 'IN_TRANSIT_TO', delaySec: d.delaySec, updatedAt: d.updatedAt, network: op.network,
        });
      }
      this.operatorTrains.set(op.id, list);
      this.mark(`${op.id}-rt-positions`, { count: list.length });
    }

    if (op.alerts) {
      try {
        const feed = await fetchPb(await resolveUrl(op.alerts));
        const list = parseAlerts(feed, opts);
        this.alertSources.set(op.id, list);
        this.mark(`${op.id}-rt-alerts`, { feedTimestamp: feed.timestamp, count: list.length });
      } catch (e) { this.mark(`${op.id}-rt-alerts`, e as Error); }
    }
  }

  /** Semáforo de todas las líneas con algún dato (tren o aviso). */
  statuses(at = nowSec()): RouteStatus[] {
    const byRoute = new Map<string, TripDelay[]>();
    for (const d of this.delays.values()) {
      if (!d.routeId) continue;
      (byRoute.get(d.routeId) ?? byRoute.set(d.routeId, []).get(d.routeId)!).push(d);
    }
    const alertsByRoute = new Map<string, Alert[]>();
    for (const a of this.alerts) for (const r of a.routeIds) (alertsByRoute.get(r) ?? alertsByRoute.set(r, []).get(r)!).push(a);
    const ids = new Set([...byRoute.keys(), ...alertsByRoute.keys()]);
    return [...ids].map((id) => routeStatus(id, byRoute.get(id) ?? [], alertsByRoute.get(id) ?? [], at));
  }

  private stopRegions = new Map<string, string | undefined>();

  /** Comunidad autónoma de una estación (en caché: las estaciones no se mueven). */
  stopRegion(s: Stop): string | undefined {
    if (!this.stopRegions.has(s.id)) this.stopRegions.set(s.id, regionOf(s.lat, s.lon) ?? (isForeignId(s.id) ? undefined : regionOf(s.lat, s.lon, 0.3)));
    return this.stopRegions.get(s.id);
  }

  private routeShape?: Map<string, string>; // routeId -> un shapeId representativo
  private routeRegionCache = new Map<string, string[]>();

  /** Comunidades que recorre una línea: muestreando su trazado; si no hay (larga distancia), por sus trenes actuales. */
  routeRegions(routeId: string): string[] {
    const cached = this.routeRegionCache.get(routeId);
    if (cached) return cached;
    if (!this.routeShape) {
      this.routeShape = new Map();
      for (const t of this.trips.values()) if (t.shapeId && !this.routeShape.has(t.routeId)) this.routeShape.set(t.routeId, t.shapeId);
    }
    const out = new Set<string>();
    const line = this.routeShape.get(routeId) ? this.shapes.get(this.routeShape.get(routeId)!) : undefined;
    if (line?.length) {
      const step = Math.max(1, Math.floor(line.length / 30));
      for (let i = 0; i < line.length; i += step) { const r = regionOf(line[i][0], line[i][1]); if (r) out.add(r); }
    } else {
      for (const t of this.trains) if (t.routeId === routeId && t.lat != null && t.lon != null) { const r = regionOf(t.lat, t.lon); if (r) out.add(r); }
      // Sin trazado ni trenes no se cachea: puede resolverse más tarde.
      if (!out.size) return [];
    }
    const res = [...out];
    this.routeRegionCache.set(routeId, res);
    return res;
  }

  /** Aviso enriquecido para los clientes: comunidades, líneas y estaciones afectadas. */
  describeAlert(a: Alert, at = nowSec()) {
    const regions = new Set<string>();
    const stops = a.stopIds.map((id) => this.stops.get(id)).filter((s): s is Stop => !!s);
    for (const s of stops) { const r = this.stopRegion(s); if (r) regions.add(r); }
    for (const id of a.routeIds) for (const r of this.routeRegions(id)) regions.add(r);
    const lines = [...new Set(a.routeIds.map((id) => this.routes.get(id)?.shortName).filter((x): x is string => !!x))];
    return {
      ...a,
      active: (a.activeFrom ?? 0) <= at && (a.activeTo == null || a.activeTo >= at),
      regions: [...regions],
      lines: lines.slice(0, 8),
      stationNames: stops.slice(0, 3).map((s) => s.name),
      stops,
    };
  }

  private stopProvinces = new Map<string, string | undefined>();

  /** Provincia de una estación (en caché). */
  stopProvince(s: Stop): string | undefined {
    if (!this.stopProvinces.has(s.id)) this.stopProvinces.set(s.id, provinceOf(s.lat, s.lon) ?? (isForeignId(s.id) ? undefined : provinceOf(s.lat, s.lon, 0.3)));
    return this.stopProvinces.get(s.id);
  }

  /** Avisos activos que afectan a una estación. */
  alertsForStop(stopId: string, at = nowSec()): Alert[] {
    return this.alerts.filter((a) => a.stopIds.includes(stopId) && (a.activeFrom ?? 0) <= at && (a.activeTo == null || a.activeTo >= at));
  }

  /** Resumen de accesibilidad de una estación a partir de sus avisos. */
  accessibilitySummary(stopId: string, at = nowSec()) {
    const items = this.alertsForStop(stopId, at).filter((a) => a.category === 'accessibility' && a.accessibility?.state === 'out');
    return {
      stationInaccessible: items.some((a) => a.accessibility?.stationInaccessible),
      elevatorsOut: items.filter((a) => a.accessibility?.element === 'elevator').length,
      escalatorsOut: items.filter((a) => a.accessibility?.element === 'escalator').length,
      otherOut: items.filter((a) => !['elevator', 'escalator'].includes(a.accessibility?.element ?? '')).length,
    };
  }

  /** Trenes con posición y color de semáforo según su retraso. */
  trainsWithLevel(at = nowSec()) {
    return [...this.liveTrains(at), ...this.estimatedTrains(at)];
  }

  /**
   * Trenes de redes sin tiempo real (Mallorca): posición estimada según el horario. No hay retraso
   * medido, así que su nivel es gris ("sin datos") y se marcan como estimados.
   */
  private estimatedTrains(at: number) {
    const out = [];
    for (const [feedId, sched] of this.scheduledTrips) {
      if (!STATIC_FEEDS[feedId]?.railOnly) continue; // solo las redes sin ningún tiempo real (Mallorca)
      const cal = this.calendars.get(feedId);
      if (!cal) continue;
      for (const p of scheduledPositions(at, sched, this.trips, cal, this.stops)) {
        const trip = this.trips.get(p.tripId);
        const route = trip ? this.routes.get(trip.routeId) : undefined;
        const list = sched.get(p.tripId);
        const last = list && this.stops.get(list[list.length - 1].stopId);
        const here = p.stopId ? this.stops.get(p.stopId) : undefined;
        out.push({
          tripId: p.tripId,
          routeId: trip?.routeId,
          label: route?.shortName ?? p.tripId,
          lat: p.lat, lon: p.lon,
          positionBasis: 'schedule' as const,
          stopId: p.stopId,
          status: p.atStop ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
          updatedAt: at,
          network: 'mallorca' as const,
          level: 'gray' as const,
          region: regionOf(p.lat, p.lon),
          delayMin: null,
          cancelled: false,
          line: route?.shortName,
          service: 'sfm' as const,
          company: 'SFM',
          route: last ? `${route?.longName ?? ''} → ${last.name}`.trim() : route?.longName,
          stopName: here?.name,
          delayAgeSec: null,
        });
      }
    }
    return out;
  }

  private liveTrains(at: number) {
    return this.trains
      .filter((t) => t.positionBasis !== 'none')
      .map((t) => {
        const d = this.delays.get(t.tripId);
        const route = t.routeId ? this.routes.get(t.routeId) : undefined;
        const stop = t.stopId ? this.stops.get(t.stopId) : undefined;
        return {
          ...t,
          level: trainLevel(d, at),
          region: t.lat != null && t.lon != null ? regionOf(t.lat, t.lon) : undefined,
          delayMin: d ? Math.round(d.delaySec / 60) : null,
          cancelled: d?.cancelled ?? false,
          line: route?.shortName,
          service: classifyService(t.network, route?.shortName),
          company: SERVICE_COMPANY[classifyService(t.network, route?.shortName)],
          route: route?.longName,
          stopName: stop?.name,
          // Antigüedad del dato de retraso (la cabecera de posiciones LD no es fiable).
          delayAgeSec: d ? at - d.updatedAt : null,
        };
      });
  }

  /** Diagnóstico de calidad de unión de datos (¿encajan los IDs entre feeds?). */
  joinQuality() {
    const d = [...this.delays.values()];
    const withRoute = d.filter((x) => x.routeId && this.routes.has(x.routeId)).length;
    const aStops = new Set(this.alerts.flatMap((a) => a.stopIds));
    const aRoutes = new Set(this.alerts.flatMap((a) => a.routeIds));
    return {
      tripUpdatesWithKnownRoute: `${withRoute}/${d.length}`,
      trainsWithPosition: `${this.trains.filter((t) => t.positionBasis !== 'none').length}/${this.trains.length}`,
      alertStopsKnown: `${[...aStops].filter((s) => this.stops.has(s)).length}/${aStops.size}`,
      alertRoutesKnown: `${[...aRoutes].filter((r) => this.routes.has(r)).length}/${aRoutes.size}`,
    };
  }
}

import type { transit_realtime } from 'gtfs-realtime-bindings';

import { agencyConfig } from './gtfsAgencies';
import { fetchFeedEntities } from './gtfsRealtime';
import { loadAgencyStaticData } from './gtfsStaticData';
import type { LegConnection, LegLive, TransitStep, WalkStep } from './tripPlanning';
import { liveTripRefs, type LiveTripRef } from './tripStops';

/**
 * Checks a planned trip against the agencies' live feeds, which Google's plan (timetables, plus
 * live data for only some agencies) can miss: a leg whose trip is cancelled or won't stop where
 * the rider boards or gets off, live departure and arrival times, and connections the rider will
 * likely miss once those live times are in. Only legs matched to one scheduled trip
 * (tripStops.ts) are checked; any leg not answered within the budget simply goes without.
 */

/** Feeds carry trips about to run (and running): a leg further out has nothing to check yet. */
const LOOKAHEAD_MS = 90 * 60 * 1000;
const LOOKBACK_MS = 30 * 60 * 1000;
/** Without a scheduled trip id, the live trip leaving the boarding stop nearest Google's time, within this. */
const LIVE_MATCH_WINDOW_MS = 6 * 60 * 1000;
/** Less spare time than this between legs, after the walk, is a tight connection. */
export const TIGHT_CONNECTION_SECONDS = 120;

/** GTFS-RT schedule relationships: a trip CANCELED, a stop SKIPPED. */
const TRIP_CANCELED = 3;
const STOP_SKIPPED = 1;

/** True when a live trip_id names the timetable's: the same, or (NYC subway) its id's tail. */
export function isSameTrip(staticTripId: string, liveTripId: string): boolean {
  return liveTripId !== '' && (staticTripId === liveTripId || staticTripId.endsWith(`_${liveTripId}`));
}

type StopEvent = transit_realtime.StopTimeEvent | null | undefined;

/** An event's time: its absolute time, else the scheduled time moved by its delay. */
function eventTime(event: StopEvent, scheduledIso: string): string | undefined {
  if (!event) return undefined;
  const time = event.time != null ? Number(event.time) : 0;
  if (time > 0) return new Date(time * 1000).toISOString();
  // protobufjs reads an absent delay as 0, so only a delay the feed actually sent counts.
  if (Object.prototype.hasOwnProperty.call(event, 'delay') && event.delay != null) {
    const scheduled = Date.parse(scheduledIso);
    if (!Number.isNaN(scheduled)) return new Date(scheduled + event.delay * 1000).toISOString();
  }
  return undefined;
}

type FeedLookups = {
  /** A stop's station, so a live update at another platform of the same station still counts. */
  stationOf?: (stopId: string) => string;
  /** A live trip's route when its update leaves route_id out (from the timetable's trips). */
  routeOf?: (tripId: string) => string | undefined;
};

/**
 * The leg's trip in the feed: by its scheduled trip id when known; else, among the line's live
 * trips calling at the boarding stop and then the alighting one, the one leaving nearest Google's
 * departure (within LIVE_MATCH_WINDOW_MS). Google times many legs from this same live data.
 */
function findLiveTrip(
  entities: readonly transit_realtime.FeedEntity[],
  ref: LiveTripRef,
  step: Pick<TransitStep, 'from' | 'to'>,
  stationOf: (stopId: string) => string,
  routeOf: (tripId: string) => string | undefined,
): transit_realtime.TripUpdate | undefined {
  const updates = entities.flatMap((entity) => (entity.tripUpdate ? [entity.tripUpdate] : []));
  const { tripId } = ref;
  if (tripId) return updates.find((update) => isSameTrip(tripId, update.trip.tripId ?? ''));
  const planned = Date.parse(step.from.time);
  let best: { update: transit_realtime.TripUpdate; offset: number } | undefined;
  for (const update of updates) {
    const liveTripId = update.trip.tripId ?? '';
    if ((update.trip.routeId || routeOf(liveTripId)) !== ref.routeId) continue;
    const stops = update.stopTimeUpdate ?? [];
    const boardIndex = stops.findIndex((stop) => stop.stopId && stationOf(stop.stopId) === stationOf(ref.boardStopId));
    if (boardIndex < 0 || !stops.slice(boardIndex + 1).some((stop) => stop.stopId && stationOf(stop.stopId) === stationOf(ref.alightStopId))) continue;
    const departs = eventTime(stops[boardIndex]?.departure ?? stops[boardIndex]?.arrival, step.from.time);
    if (!departs) continue;
    const offset = Math.abs(Date.parse(departs) - planned);
    if (offset <= LIVE_MATCH_WINDOW_MS && (!best || offset < best.offset)) best = { update, offset };
  }
  return best?.update;
}

/** What the feed's entities say about a leg, or undefined when they don't carry its trip (or carry it without either of its stops). */
export function legLiveFrom(
  entities: readonly transit_realtime.FeedEntity[],
  ref: LiveTripRef,
  step: Pick<TransitStep, 'from' | 'to'>,
  { stationOf = (stopId) => stopId, routeOf = () => undefined }: FeedLookups = {},
): LegLive | undefined {
  const update = findLiveTrip(entities, ref, step, stationOf, routeOf);
  if (!update) return undefined;
  if (update.trip.scheduleRelationship === TRIP_CANCELED) return { status: 'cancelled' };

  const updateAt = (stopId: string) => (update.stopTimeUpdate ?? []).find((stop) => stop.stopId && stationOf(stop.stopId) === stationOf(stopId));
  const board = updateAt(ref.boardStopId);
  const alight = updateAt(ref.alightStopId);
  if (board?.scheduleRelationship === STOP_SKIPPED || alight?.scheduleRelationship === STOP_SKIPPED) return { status: 'skips-stop' };

  const departs = eventTime(board?.departure ?? board?.arrival, step.from.time);
  const arrives = eventTime(alight?.arrival ?? alight?.departure, step.to.time);
  if (!departs && !arrives) return undefined;
  const planned = departs ? Date.parse(step.from.time) : Date.parse(step.to.time);
  const delaySeconds = Math.round((Date.parse((departs ?? arrives) as string) - planned) / 1000);
  return {
    status: 'tracked',
    ...(departs ? { departs } : {}),
    ...(arrives ? { arrives } : {}),
    ...(Number.isFinite(delaySeconds) ? { delaySeconds } : {}),
  };
}

/** A leg's live status from its agency's feed (shared with route status through the feed cache). */
export async function liveTripStatus(ref: LiveTripRef, step: TransitStep): Promise<LegLive | undefined> {
  const config = agencyConfig(ref.agencyId);
  if (config.liveFeedSecret !== undefined && !process.env[config.liveFeedSecret]) return undefined;
  const requests = config.feedRequestsForRoute(ref.routeId);
  const entities = (await Promise.all(requests.map((request) => fetchFeedEntities(request.url, request.headers)))).flat();
  const { stopsById, tripsById } = loadAgencyStaticData(ref.agencyId);
  return legLiveFrom(entities, ref, step, {
    stationOf: (stopId) => stopsById.get(stopId)?.parentStation ?? stopId,
    // Live subway trip ids are the timetable's tails; a bare lookup misses those, but the
    // subway feed carries route_id itself.
    routeOf: (tripId) => tripsById.get(tripId)?.routeId,
  });
}

/**
 * How each connection holds up: the spare time between arriving on one leg and the next leg
 * leaving, after the walk between them, using live times where known. Set on the later leg when
 * it's tight or already missed; a cancelled leg's connections aren't judged (the leg is the problem).
 */
export function addConnections(steps: readonly { kind: string }[]): void {
  let previous: TransitStep | undefined;
  let walkSeconds = 0;
  for (const step of steps) {
    if (step.kind === 'walk') {
      walkSeconds += (step as WalkStep).durationSeconds;
      continue;
    }
    if (step.kind !== 'transit') continue;
    const next = step as TransitStep;
    delete next.connection;
    const judged = previous && ![previous.live?.status, next.live?.status].some((status) => status === 'cancelled' || status === 'skips-stop');
    if (previous && judged) {
      const arrives = Date.parse(previous.live?.arrives ?? previous.to.time);
      const departs = Date.parse(next.live?.departs ?? next.from.time);
      const spareSeconds = Math.round((departs - arrives) / 1000 - walkSeconds);
      const connection: LegConnection | undefined = spareSeconds < 0
        ? { status: 'missed', spareSeconds }
        : spareSeconds < TIGHT_CONNECTION_SECONDS ? { status: 'tight', spareSeconds } : undefined;
      if (connection && Number.isFinite(spareSeconds)) next.connection = connection;
    }
    previous = next;
    walkSeconds = 0;
  }
}

/** Adds live status to every checkable leg, then judges each itinerary's connections. */
export async function addLiveStatus<T extends { steps: { kind: string }[] }>(
  itineraries: T[],
  budgetMs: number,
  nowMs = Date.now(),
  lookup: (ref: LiveTripRef, step: TransitStep) => Promise<LegLive | undefined> = liveTripStatus,
  refFor: (step: TransitStep) => LiveTripRef | undefined = (step) => liveTripRefs.get(step),
): Promise<T[]> {
  const checks = itineraries.flatMap((itinerary) => itinerary.steps
    .filter((step): step is TransitStep => step.kind === 'transit')
    .flatMap((step) => {
      const ref = refFor(step);
      const departs = Date.parse(step.from.time);
      return ref && departs >= nowMs - LOOKBACK_MS && departs <= nowMs + LOOKAHEAD_MS ? [{ ref, step }] : [];
    }));
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), budgetMs);
  });
  await Promise.all(checks.map(async ({ ref, step }) => {
    const live = await Promise.race([lookup(ref, step).catch(() => undefined), deadline]);
    if (live && live !== 'timeout') step.live = live;
  }));
  if (timer) clearTimeout(timer);
  for (const itinerary of itineraries) addConnections(itinerary.steps);
  return itineraries;
}

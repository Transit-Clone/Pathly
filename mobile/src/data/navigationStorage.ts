import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  NavigationCheckpointKind,
  NavigationCursor,
  NavigationPhase,
  TripEndpointReference,
  TripSelectionIdentity,
} from './enrouteNavigation';
import type { ResumePlanRequest, TripMode } from './tripPlanning';

export const NAVIGATION_STORAGE_VERSION = 1 as const;
export const NAVIGATION_STORAGE_PREFIX = 'pathly.navigation.';
export const MAX_RECENT_TRIPS = 20;
export const ACTIVE_TRIP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const TEMPORARY_COORDINATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type RecentTripOutcome = 'arrived' | 'ended-early';

export type PersistedLineSummaryV1 = {
  mode: TripMode | 'ferry' | 'other';
  name: string;
  shortName?: string;
  color?: string;
  tripId?: string;
};

export type NavigationProgressAnchorV1 = {
  kind: NavigationCheckpointKind;
  stepIndex: number;
  phase: NavigationPhase;
  point: { lat: number; lng: number };
};

export type ActiveTripResumeV1 = {
  version: 1;
  sessionId: string;
  uid: string;
  startedAt: number;
  updatedAt: number;
  origin: TripEndpointReference;
  destination: TripEndpointReference;
  request: ResumePlanRequest;
  selection: TripSelectionIdentity;
  cursor: NavigationCursor;
  /** Optional so active records written before anchors were introduced still validate safely. */
  progressAnchor?: NavigationProgressAnchorV1;
  lines: PersistedLineSummaryV1[];
};

export type RecentTripV1 = {
  version: 1;
  sessionId: string;
  uid: string;
  origin: TripEndpointReference;
  destination: TripEndpointReference;
  startedAt: number;
  endedAt: number;
  outcome: RecentTripOutcome;
  lines: PersistedLineSummaryV1[];
};

export type NavigationDocumentV1 = {
  version: 1;
  uid: string;
  active: ActiveTripResumeV1 | null;
  recents: RecentTripV1[];
};

const phases = new Set(['walking', 'waiting-to-board', 'riding', 'transferring', 'arrived']);
const checkpointKinds = new Set(['start', 'walk', 'board', 'transit-stop', 'alight', 'destination']);
const tripModes = new Set(['subway', 'bus', 'rail']);
const lineModes = new Set(['subway', 'bus', 'rail', 'ferry', 'other']);
const writeQueues = new Map<string, Promise<unknown>>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isIsoTime = (value: unknown): value is string => isString(value) && Number.isFinite(Date.parse(value));

function isPoint(value: unknown): value is { lat: number; lng: number } {
  return isRecord(value)
    && isNumber(value.lat) && value.lat >= -90 && value.lat <= 90
    && isNumber(value.lng) && value.lng >= -180 && value.lng <= 180;
}

function isEndpoint(value: unknown): value is TripEndpointReference {
  if (!isRecord(value) || !isString(value.label)) return false;
  if (value.kind === 'place') return isString(value.placeId);
  return value.kind === 'coordinate' && isPoint(value.point) && isNumber(value.savedAt);
}

function sameEndpoint(left: TripEndpointReference, right: TripEndpointReference): boolean {
  if (left.kind !== right.kind || left.label !== right.label) return false;
  if (left.kind === 'place' && right.kind === 'place') return left.placeId === right.placeId;
  return left.kind === 'coordinate' && right.kind === 'coordinate'
    && left.point.lat === right.point.lat
    && left.point.lng === right.point.lng
    && left.savedAt === right.savedAt;
}

function isSelection(value: unknown): value is TripSelectionIdentity {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return false;
  const common = isString(value.itineraryId)
    && isIsoTime(value.departureTime)
    && isIsoTime(value.arrivalTime)
    && isString(value.fingerprint)
    && (value.tripIds === undefined
      || (Array.isArray(value.tripIds) && value.tripIds.every((tripId) => tripId === null || isString(tripId))));
  if (!common || value.version === 1) return common;
  return Array.isArray(value.walks)
    && value.walks.every((walk) => isRecord(walk)
      && isInteger(walk.stepIndex)
      && isNumber(walk.durationSeconds) && walk.durationSeconds >= 0
      && isNumber(walk.distanceMeters) && walk.distanceMeters >= 0)
    && isRecord(value.legacy)
    && isIsoTime(value.legacy.departureTime)
    && isIsoTime(value.legacy.arrivalTime)
    && isString(value.legacy.fingerprint);
}

function isCursor(value: unknown): value is NavigationCursor {
  return isRecord(value)
    && isInteger(value.checkpointOrdinal)
    && isInteger(value.stepIndex)
    && isString(value.phase) && phases.has(value.phase)
    && (value.nextStopIndex === undefined || isInteger(value.nextStopIndex))
    && isNumber(value.lastAdvancedAt);
}

function isProgressAnchor(value: unknown): value is NavigationProgressAnchorV1 {
  return isRecord(value)
    && isString(value.kind) && checkpointKinds.has(value.kind)
    && isInteger(value.stepIndex)
    && isString(value.phase) && phases.has(value.phase)
    && isPoint(value.point);
}

function isResumeRequest(value: unknown): value is ResumePlanRequest {
  return isRecord(value)
    && isEndpoint(value.origin)
    && isEndpoint(value.destination)
    && isRecord(value.time)
    && (value.time.mode === 'depart' || value.time.mode === 'arrive')
    && isIsoTime(value.time.at)
    && (value.preference === 'fastest' || value.preference === 'transfers')
    && (value.lessWalking === undefined || value.lessWalking === true)
    && Array.isArray(value.modes)
    && value.modes.length > 0
    && value.modes.every((mode) => typeof mode === 'string' && tripModes.has(mode));
}

function isLine(value: unknown): value is PersistedLineSummaryV1 {
  return isRecord(value)
    && typeof value.mode === 'string' && lineModes.has(value.mode)
    && isString(value.name)
    && (value.shortName === undefined || typeof value.shortName === 'string')
    && (value.color === undefined || typeof value.color === 'string')
    && (value.tripId === undefined || typeof value.tripId === 'string');
}

function parseActive(value: unknown, uid: string): ActiveTripResumeV1 | null {
  if (!isRecord(value)
    || value.version !== NAVIGATION_STORAGE_VERSION
    || value.uid !== uid
    || !isString(value.sessionId)
    || !isNumber(value.startedAt)
    || !isNumber(value.updatedAt)
    || !isEndpoint(value.origin)
    || !isEndpoint(value.destination)
    || !isResumeRequest(value.request)
    || !isSelection(value.selection)
    || !isCursor(value.cursor)
    || (value.progressAnchor !== undefined && !isProgressAnchor(value.progressAnchor))
    || !Array.isArray(value.lines)
    || !value.lines.every(isLine)) return null;
  if (!sameEndpoint(value.origin, value.request.origin) || !sameEndpoint(value.destination, value.request.destination)) return null;
  return value as ActiveTripResumeV1;
}

function parseRecent(value: unknown, uid: string): RecentTripV1 | null {
  if (!isRecord(value)
    || value.version !== NAVIGATION_STORAGE_VERSION
    || value.uid !== uid
    || !isString(value.sessionId)
    || !isEndpoint(value.origin)
    || !isEndpoint(value.destination)
    || !isNumber(value.startedAt)
    || !isNumber(value.endedAt)
    || (value.outcome !== 'arrived' && value.outcome !== 'ended-early')
    || !Array.isArray(value.lines)
    || !value.lines.every(isLine)) return null;
  return value as RecentTripV1;
}

function endpointCurrent(endpoint: TripEndpointReference, now: number): boolean {
  return endpoint.kind === 'place' || (now >= endpoint.savedAt && now - endpoint.savedAt <= TEMPORARY_COORDINATE_MAX_AGE_MS);
}

function emptyDocument(uid: string): NavigationDocumentV1 {
  return { version: NAVIGATION_STORAGE_VERSION, uid, active: null, recents: [] };
}

function normalizeDocument(value: unknown, uid: string, now: number): NavigationDocumentV1 | null {
  if (!isRecord(value) || value.version !== NAVIGATION_STORAGE_VERSION || value.uid !== uid || !Array.isArray(value.recents)) return null;

  const parsedActive = value.active === null ? null : parseActive(value.active, uid);
  const active = parsedActive
    && now >= parsedActive.updatedAt
    && now - parsedActive.updatedAt <= ACTIVE_TRIP_MAX_AGE_MS
    && endpointCurrent(parsedActive.origin, now)
    && endpointCurrent(parsedActive.destination, now)
      ? parsedActive
      : null;
  const bySession = new Map<string, RecentTripV1>();
  for (const candidate of value.recents) {
    const recent = parseRecent(candidate, uid);
    if (!recent || !endpointCurrent(recent.origin, now) || !endpointCurrent(recent.destination, now)) continue;
    const previous = bySession.get(recent.sessionId);
    if (!previous || recent.endedAt > previous.endedAt) bySession.set(recent.sessionId, recent);
  }
  const recents = [...bySession.values()].sort((left, right) => right.endedAt - left.endedAt).slice(0, MAX_RECENT_TRIPS);
  return { version: NAVIGATION_STORAGE_VERSION, uid, active, recents };
}

export function navigationStorageKey(uid: string): string {
  return `${NAVIGATION_STORAGE_PREFIX}${encodeURIComponent(uid)}.v1`;
}

type StorageRepair = 'none' | 'remove' | 'rewrite';

async function readRaw(uid: string, now: number): Promise<{ document: NavigationDocumentV1; repair: StorageRepair }> {
  const key = navigationStorageKey(uid);
  let text: string | null;
  try {
    text = await AsyncStorage.getItem(key);
  } catch {
    throw new Error('Navigation storage could not be read');
  }
  if (text === null) return { document: emptyDocument(uid), repair: 'none' };
  try {
    const parsed = JSON.parse(text) as unknown;
    const document = normalizeDocument(parsed, uid, now);
    if (!document) return { document: emptyDocument(uid), repair: 'remove' };
    return { document, repair: JSON.stringify(document) !== text ? 'rewrite' : 'none' };
  } catch {
    return { document: emptyDocument(uid), repair: 'remove' };
  }
}

function enqueueStorageOperation<Result>(uid: string, operation: (key: string) => Promise<Result>): Promise<Result> {
  const key = navigationStorageKey(uid);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => operation(key));
  writeQueues.set(key, pending);
  void pending.finally(() => {
    if (writeQueues.get(key) === pending) writeQueues.delete(key);
  }).catch(() => undefined);
  return pending;
}

/** Reads, validates, expires, sorts, and bounds one account's local navigation document. */
export async function readNavigationDocument(uid: string, now = Date.now()): Promise<NavigationDocumentV1> {
  return enqueueStorageOperation(uid, async (key) => {
    const { document, repair } = await readRaw(uid, now);
    if (repair === 'remove') await AsyncStorage.removeItem(key);
    if (repair === 'rewrite') await AsyncStorage.setItem(key, JSON.stringify(document));
    return document;
  });
}

/**
 * Serializes every read-modify-write for a UID. Completion and active removal therefore share
 * one AsyncStorage write, and a stale cursor write cannot race behind them.
 */
export function updateNavigationDocument(
  uid: string,
  update: (current: NavigationDocumentV1) => NavigationDocumentV1,
  now = Date.now(),
): Promise<NavigationDocumentV1> {
  return enqueueStorageOperation(uid, async (key) => {
    const { document } = await readRaw(uid, now);
    const next = normalizeDocument(update(document), uid, now);
    if (!next) throw new Error('Invalid navigation storage update');
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return next;
  });
}

export function recentFromActive(active: ActiveTripResumeV1, outcome: RecentTripOutcome, endedAt: number): RecentTripV1 {
  return {
    version: NAVIGATION_STORAGE_VERSION,
    sessionId: active.sessionId,
    uid: active.uid,
    origin: active.origin,
    destination: active.destination,
    startedAt: active.startedAt,
    endedAt,
    outcome,
    lines: active.lines,
  };
}

/** Inserts completion once by session id and clears only the matching active session. */
export async function completeNavigationSession(
  uid: string,
  sessionId: string,
  outcome: RecentTripOutcome,
  endedAt = Date.now(),
): Promise<{ document: NavigationDocumentV1; inserted: boolean }> {
  let inserted = false;
  const document = await updateNavigationDocument(uid, (current) => {
    const active = current.active?.sessionId === sessionId ? current.active : null;
    if (!active || current.recents.some((recent) => recent.sessionId === sessionId)) {
      return active ? { ...current, active: null } : current;
    }
    inserted = true;
    return { ...current, active: null, recents: [recentFromActive(active, outcome, endedAt), ...current.recents] };
  }, endedAt);
  return { document, inserted };
}

/** Test isolation only. */
export function resetNavigationStorageForTests(): void {
  writeQueues.clear();
}

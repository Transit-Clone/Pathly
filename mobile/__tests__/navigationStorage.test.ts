import AsyncStorage from '@react-native-async-storage/async-storage';

import { createTripSelectionIdentity, initialNavigationCursor, normalizeItinerary } from '../src/data/enrouteNavigation';
import { rideGuideItinerary, type RideGuideRequest } from '../src/data/rideGuide';
import type { TransitStep } from '../src/data/tripPlanning';

import {
  ACTIVE_TRIP_MAX_AGE_MS,
  MAX_RECENT_TRIPS,
  NAVIGATION_STORAGE_VERSION,
  TEMPORARY_COORDINATE_MAX_AGE_MS,
  completeNavigationSession,
  navigationStorageKey,
  readNavigationDocument,
  resetNavigationStorageForTests,
  updateNavigationDocument,
  type ActiveTripResumeV1,
  type NavigationDocumentV1,
  type RecentTripV1,
} from '../src/data/navigationStorage';

const NOW = Date.parse('2026-10-15T16:00:00.000Z');
const place = (label: string, placeId = 'ChIJhRwB-yFawokR5Phil-QQ3zM') => ({ kind: 'place' as const, label, placeId });
const coordinate = (label: string, savedAt = NOW) => ({ kind: 'coordinate' as const, label, point: { lat: 40.9, lng: -73.1 }, savedAt });

function active(uid = 'alice', overrides: Partial<ActiveTripResumeV1> = {}): ActiveTripResumeV1 {
  const origin = place('Stony Brook University', 'ChIJ-origin-abcdefghijkl');
  const destination = place('Penn Station');
  return {
    version: NAVIGATION_STORAGE_VERSION,
    sessionId: 'session-1',
    uid,
    startedAt: NOW - 10_000,
    updatedAt: NOW - 1_000,
    origin,
    destination,
    request: { origin, destination, time: { mode: 'depart', at: '2026-10-15T16:15:00.000Z' }, preference: 'fastest', modes: ['rail'] },
    selection: {
      version: 1,
      itineraryId: 'itinerary-1',
      departureTime: '2026-10-15T16:15:00.000Z',
      arrivalTime: '2026-10-15T18:00:00.000Z',
      fingerprint: 'exact-departure-fingerprint',
    },
    cursor: { checkpointOrdinal: 2, stepIndex: 1, phase: 'riding', nextStopIndex: 1, lastAdvancedAt: NOW - 1_000 },
    lines: [{ mode: 'rail', name: 'Port Jefferson Branch', shortName: 'PJ', color: '#0039A6', tripId: 'gtfs-1' }],
    ...overrides,
  };
}

function recent(index: number, uid = 'alice', overrides: Partial<RecentTripV1> = {}): RecentTripV1 {
  return {
    version: NAVIGATION_STORAGE_VERSION,
    sessionId: `recent-${index}`,
    uid,
    origin: place('Stony Brook University', 'ChIJ-origin-abcdefghijkl'),
    destination: place('Penn Station'),
    startedAt: NOW - index * 2_000,
    endedAt: NOW - index * 1_000,
    outcome: index % 2 === 0 ? 'arrived' : 'ended-early',
    lines: [{ mode: 'rail', name: 'Port Jefferson Branch', shortName: 'PJ' }],
    ...overrides,
  };
}

function document(uid: string, overrides: Partial<NavigationDocumentV1> = {}): NavigationDocumentV1 {
  return { version: NAVIGATION_STORAGE_VERSION, uid, active: null, recents: [], ...overrides };
}

function rideActive(uid = 'alice', overrides: Partial<RideGuideRequest> = {}): ActiveTripResumeV1 {
  const itinerary = rideGuideItinerary({
    routeId: 'suffolk:51', directionIndex: 0, agency: 'Suffolk County Transit',
    agencyId: 'suffolk', routeIdAtAgency: '51', directionId: 0,
    mode: 'bus', routeName: 'Route 51', shortName: '51', color: '#C43D4B', headsign: 'Port Jefferson',
    stops: [
      { name: 'Main St', stopId: 'a', lat: 40.8, lon: -73.1, offsetMinutes: 10 },
      { name: 'Elm Ave', stopId: 'b', lat: 40.81, lon: -73.1, offsetMinutes: 14 },
      { name: 'Harbor', stopId: 'c', lat: 40.83, lon: -73.1, offsetMinutes: 30 },
    ],
    departures: [{ minutes: 6, live: true, delayMinutes: 0 }, { minutes: 26, live: false }], selectedDeparture: 0,
    walk: { minutes: 3, path: [{ lat: 40.799, lon: -73.101 }, { lat: 40.8, lon: -73.1 }] },
    notices: [], capturedAt: NOW,
    ...overrides,
  }, 2)!;
  const transit = itinerary.steps.find((step): step is TransitStep => step.kind === 'transit')!;
  const first = itinerary.steps[0]!;
  const origin = { kind: 'coordinate' as const, label: first.kind === 'walk' ? 'Current location' : transit.from.name, point: first.kind === 'walk' ? first.path[0]! : transit.from.location, savedAt: NOW };
  const destination = { kind: 'coordinate' as const, label: transit.to.name, point: transit.to.location, savedAt: NOW };
  return {
    ...active(uid), origin, destination,
    request: { origin, destination, time: { mode: 'depart', at: itinerary.departureTime }, preference: 'fastest', modes: ['bus'] },
    selection: createTripSelectionIdentity(itinerary),
    cursor: initialNavigationCursor(normalizeItinerary(itinerary), NOW),
    rideSnapshot: { version: 1, itinerary },
  };
}

beforeEach(async () => {
  resetNavigationStorageForTests();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

it('fails corrupt, unsupported, and wrong-account documents safely', async () => {
  await AsyncStorage.setItem(navigationStorageKey('alice'), '{bad json');
  expect(await readNavigationDocument('alice', NOW)).toEqual(document('alice'));
  expect(await AsyncStorage.getItem(navigationStorageKey('alice'))).toBeNull();

  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify({ ...document('alice'), version: 2 }));
  expect(await readNavigationDocument('alice', NOW)).toEqual(document('alice'));

  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('bob', { active: active('bob') })));
  expect(await readNavigationDocument('alice', NOW)).toEqual(document('alice'));
});

it('accepts optional trip-id evidence only when every entry is a string or null', async () => {
  const withTripIds = active('alice', {
    selection: { ...active('alice').selection, tripIds: ['gtfs-1', null] },
  });
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: withTripIds })));
  expect((await readNavigationDocument('alice', NOW)).active?.selection.tripIds).toEqual(['gtfs-1', null]);

  const invalid = JSON.parse(JSON.stringify(withTripIds)) as Record<string, unknown>;
  (invalid.selection as Record<string, unknown>).tripIds = ['gtfs-1', 42];
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: invalid as unknown as ActiveTripResumeV1 })));
  expect((await readNavigationDocument('alice', NOW)).active).toBeNull();
});

it('accepts version-2 bounded walk evidence and rejects malformed evidence', async () => {
  const previous = active('alice').selection;
  const modern = active('alice', {
    selection: {
      ...previous,
      version: 2,
      fingerprint: 'v2-current-fingerprint',
      walks: [{ stepIndex: 0, durationSeconds: 90, distanceMeters: 120 }],
      legacy: {
        departureTime: previous.departureTime,
        arrivalTime: previous.arrivalTime,
        fingerprint: previous.fingerprint,
      },
    },
  });
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: modern })));
  expect((await readNavigationDocument('alice', NOW)).active?.selection.version).toBe(2);

  const malformed = structuredClone(modern) as unknown as Record<string, unknown>;
  (malformed.selection as Record<string, unknown>).walks = [{ stepIndex: 0, durationSeconds: -1, distanceMeters: 120 }];
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: malformed as unknown as ActiveTripResumeV1 })));
  expect((await readNavigationDocument('alice', NOW)).active).toBeNull();
});

it('isolates accounts even when their writes overlap', async () => {
  await Promise.all([
    updateNavigationDocument('alice', (current) => ({ ...current, active: active('alice') }), NOW),
    updateNavigationDocument('bob', (current) => ({ ...current, active: active('bob', { sessionId: 'bob-session' }) }), NOW),
  ]);
  expect((await readNavigationDocument('alice', NOW)).active?.uid).toBe('alice');
  expect((await readNavigationDocument('bob', NOW)).active?.sessionId).toBe('bob-session');
});

it('does not overwrite durable state after a transient read failure', async () => {
  const key = navigationStorageKey('alice');
  await AsyncStorage.setItem(key, JSON.stringify(document('alice', { active: active('alice') })));
  const getItem = AsyncStorage.getItem as jest.Mock;
  const setItem = AsyncStorage.setItem as jest.Mock;
  getItem.mockRejectedValueOnce(new Error('device busy'));
  setItem.mockClear();

  await expect(updateNavigationDocument('alice', (current) => ({ ...current, recents: [recent(1)] }), NOW)).rejects.toThrow('could not be read');
  expect(setItem).not.toHaveBeenCalled();

  expect((await readNavigationDocument('alice', NOW)).active?.sessionId).toBe('session-1');
});

it('expires a 24-hour active reference and 30-day temporary-coordinate history', async () => {
  const expiredActive = active('alice', { updatedAt: NOW - ACTIVE_TRIP_MAX_AGE_MS - 1 });
  const expiredCoordinate = coordinate('Pinned spot', NOW - TEMPORARY_COORDINATE_MAX_AGE_MS - 1);
  const staleRecent = recent(1, 'alice', { origin: expiredCoordinate });
  const freshRecent = recent(2, 'alice', { origin: coordinate('Pinned spot', NOW - TEMPORARY_COORDINATE_MAX_AGE_MS) });
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: expiredActive, recents: [staleRecent, freshRecent] })));

  const stored = await readNavigationDocument('alice', NOW);
  expect(stored.active).toBeNull();
  expect(stored.recents.map((trip) => trip.sessionId)).toEqual([freshRecent.sessionId]);
  expect(JSON.parse((await AsyncStorage.getItem(navigationStorageKey('alice')))!).recents).toHaveLength(1);
});

it('serializes concurrent updates, orders newest first, deduplicates, and caps history', async () => {
  await Promise.all(Array.from({ length: MAX_RECENT_TRIPS + 5 }, (_, index) => (
    updateNavigationDocument('alice', (current) => ({ ...current, recents: [...current.recents, recent(index)] }), NOW)
  )));
  await updateNavigationDocument('alice', (current) => ({ ...current, recents: [...current.recents, recent(0, 'alice', { endedAt: NOW + 1 })] }), NOW + 1);
  const stored = await readNavigationDocument('alice', NOW + 1);
  expect(stored.recents).toHaveLength(MAX_RECENT_TRIPS);
  expect(stored.recents[0]).toEqual(expect.objectContaining({ sessionId: 'recent-0', endedAt: NOW + 1 }));
  expect(new Set(stored.recents.map((trip) => trip.sessionId)).size).toBe(MAX_RECENT_TRIPS);
});

it('serializes a hydration repair before a concurrent progress update', async () => {
  const key = navigationStorageKey('alice');
  await AsyncStorage.setItem(key, JSON.stringify(document('alice', { recents: [recent(2), recent(1)] })));
  const setItem = AsyncStorage.setItem as jest.Mock;
  const originalSetItem = setItem.getMockImplementation()!;
  let releaseRepair!: () => void;
  let repairStarted!: () => void;
  const repairGate = new Promise<void>((resolve) => { releaseRepair = resolve; });
  const started = new Promise<void>((resolve) => { repairStarted = resolve; });
  setItem.mockImplementationOnce(async (storageKey, value) => {
    repairStarted();
    await repairGate;
    return originalSetItem(storageKey, value);
  });
  setItem.mockClear();

  const hydration = readNavigationDocument('alice', NOW);
  await started;
  const update = updateNavigationDocument('alice', (current) => ({ ...current, active: active('alice') }), NOW);
  await Promise.resolve();
  expect(setItem).toHaveBeenCalledTimes(1);

  releaseRepair();
  await Promise.all([hydration, update]);
  expect((await readNavigationDocument('alice', NOW)).active?.sessionId).toBe('session-1');
});

it('completes once atomically and never serializes an itinerary or route geometry', async () => {
  await updateNavigationDocument('alice', (current) => ({ ...current, active: active('alice') }), NOW);
  const first = await completeNavigationSession('alice', 'session-1', 'arrived', NOW + 1);
  const duplicate = await completeNavigationSession('alice', 'session-1', 'arrived', NOW + 2);
  expect(first.inserted).toBe(true);
  expect(duplicate.inserted).toBe(false);
  expect(duplicate.document.active).toBeNull();
  expect(duplicate.document.recents).toHaveLength(1);
  const serialized = (await AsyncStorage.getItem(navigationStorageKey('alice')))!;
  expect(serialized).not.toMatch(/"itinerary"|"steps"|"path"|"geometry"/);
});

it('round-trips a selected line ride but removes alternatives and stale provider status', async () => {
  const saved = rideActive();
  const itinerary = saved.rideSnapshot!.itinerary;
  const transit = itinerary.steps.find((step): step is TransitStep => step.kind === 'transit')!;
  itinerary.fare = { text: '$3', cents: 300, currency: 'USD', estimated: true };
  transit.connection = { status: 'tight', spareSeconds: 30 };
  transit.alerts = [{ id: 'old-alert', header: 'Old service alert', description: 'Do not persist mutable notices.' }];
  transit.tripId = 'selected-service-1';
  saved.selection = createTripSelectionIdentity(itinerary);

  await updateNavigationDocument('alice', (current) => ({ ...current, active: saved }), NOW);
  const restored = (await readNavigationDocument('alice', NOW)).active!;
  const selected = restored.rideSnapshot!.itinerary;
  const selectedTransit = selected.steps.find((step): step is TransitStep => step.kind === 'transit')!;
  expect(selected).toEqual(expect.objectContaining({ id: itinerary.id, departureTime: itinerary.departureTime, arrivalTime: itinerary.arrivalTime }));
  expect(selectedTransit).toEqual(expect.objectContaining({ from: transit.from, to: transit.to, path: transit.path, stops: transit.stops, tripId: 'selected-service-1', liveRoute: transit.liveRoute }));
  expect(selectedTransit.departures).toBeUndefined();
  expect(selectedTransit.live).toBeUndefined();
  expect(selectedTransit.connection).toBeUndefined();
  expect(selectedTransit.alerts).toBeUndefined();
  expect(selected.fare).toBeUndefined();
});

it.each([
  ['unsupported version', (saved: ActiveTripResumeV1) => { (saved.rideSnapshot as unknown as { version: number }).version = 2; }],
  ['another selected ride', (saved: ActiveTripResumeV1) => { saved.rideSnapshot!.itinerary.id = 'ride:another-service'; }],
  ['another departure', (saved: ActiveTripResumeV1) => { (saved.rideSnapshot!.itinerary.steps.at(-1) as TransitStep).from.time = new Date(NOW + 7 * 60_000).toISOString(); }],
  ['another exit', (saved: ActiveTripResumeV1) => { (saved.rideSnapshot!.itinerary.steps.at(-1) as TransitStep).to.location.lat += 0.01; }],
  ['coordinate endpoint mismatch', (saved: ActiveTripResumeV1) => { if (saved.destination.kind === 'coordinate') saved.destination.point = { lat: 40.9, lng: -73.1 }; }],
  ['invalid path point', (saved: ActiveTripResumeV1) => { saved.rideSnapshot!.itinerary.steps[0]!.path[0]!.lat = 91; }],
  ['negative walking distance', (saved: ActiveTripResumeV1) => { const walk = saved.rideSnapshot!.itinerary.steps[0]!; if (walk.kind === 'walk') walk.distanceMeters = -1; }],
  ['backward stop time', (saved: ActiveTripResumeV1) => { (saved.rideSnapshot!.itinerary.steps.at(-1) as TransitStep).stops![0]!.time = new Date(NOW - 60_000).toISOString(); }],
  ['invalid live direction', (saved: ActiveTripResumeV1) => { (saved.rideSnapshot!.itinerary.steps.at(-1) as TransitStep).liveRoute!.directionId = 9; }],
  ['extra transit leg', (saved: ActiveTripResumeV1) => { saved.rideSnapshot!.itinerary.steps.push(structuredClone(saved.rideSnapshot!.itinerary.steps.at(-1)!)); }],
] as const)('rejects a present line snapshot with %s', async (_name, mutate) => {
  const saved = structuredClone(rideActive());
  mutate(saved);
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('alice', { active: saved })));
  expect((await readNavigationDocument('alice', NOW)).active).toBeNull();
});

it('accepts a line ride without a walk and preserves ferry mode', async () => {
  const saved = rideActive('alice', { walk: null, mode: 'ferry' });
  await updateNavigationDocument('alice', (current) => ({ ...current, active: saved }), NOW);
  const restored = (await readNavigationDocument('alice', NOW)).active!;
  expect(restored.rideSnapshot?.itinerary.steps).toHaveLength(1);
  expect(restored.rideSnapshot?.itinerary.steps[0]).toMatchObject({ kind: 'transit', mode: 'ferry' });
});

it('applies account and expiry checks to line snapshots and leaves completed history lightweight', async () => {
  await AsyncStorage.setItem(navigationStorageKey('alice'), JSON.stringify(document('bob', { active: rideActive('bob') })));
  expect((await readNavigationDocument('alice', NOW)).active).toBeNull();

  await updateNavigationDocument('alice', (current) => ({ ...current, active: rideActive() }), NOW);
  expect((await readNavigationDocument('alice', NOW + ACTIVE_TRIP_MAX_AGE_MS + 1)).active).toBeNull();

  await updateNavigationDocument('alice', (current) => ({ ...current, active: rideActive() }), NOW);
  await completeNavigationSession('alice', 'session-1', 'ended-early', NOW + 1);
  const completed = (await readNavigationDocument('alice', NOW + 1));
  expect(completed.active).toBeNull();
  expect(completed.recents).toHaveLength(1);
  expect((await AsyncStorage.getItem(navigationStorageKey('alice')))).not.toMatch(/"rideSnapshot"|"itinerary"|"steps"|"path"/);
});

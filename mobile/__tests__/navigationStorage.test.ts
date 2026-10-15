import AsyncStorage from '@react-native-async-storage/async-storage';

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

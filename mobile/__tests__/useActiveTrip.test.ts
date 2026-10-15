import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { httpsCallable } from 'firebase/functions';

import { createActiveTripRuntime, useActiveTrip, type StartActiveTripInput } from '../src/hooks/useActiveTrip';
import { navigationStorageKey, readNavigationDocument, resetNavigationStorageForTests, updateNavigationDocument } from '../src/data/navigationStorage';
import type { Itinerary } from '../src/data/tripPlanning';
import realItineraries from './fixtures/itineraries-sbu-penn.json';

const fixtures = realItineraries as unknown as Itinerary[];
const planTripMock = () => (httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock;
const getItemMock = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const defaultGetItemImplementation = getItemMock.getMockImplementation()!;

function input(itinerary = fixtures[0]!): StartActiveTripInput {
  const origin = { kind: 'place' as const, label: 'Stony Brook University', placeId: 'ChIJ-origin-abcdefghijkl' };
  const destination = { kind: 'place' as const, label: 'Penn Station', placeId: 'ChIJhRwB-yFawokR5Phil-QQ3zM' };
  return {
    itinerary,
    origin,
    destination,
    resumeRequest: {
      origin,
      destination,
      time: { mode: 'depart', at: itinerary.departureTime },
      preference: 'fastest',
      modes: ['subway', 'bus', 'rail'],
    },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function idleHook(uid = 'alice') {
  const hook = renderHook(() => useActiveTrip(uid));
  await waitFor(() => expect(hook.result.current.status).toBe('idle'));
  return hook;
}

beforeEach(async () => {
  resetNavigationStorageForTests();
  await AsyncStorage.clear();
  planTripMock().mockClear();
});

it('gates initial hydration, then restores only the same account at the exact cursor', async () => {
  const first = renderHook(() => useActiveTrip('alice'));
  expect(first.result.current.status).toBe('hydrating');
  await waitFor(() => expect(first.result.current.status).toBe('idle'));
  await act(async () => {
    expect(await first.result.current.start(input())).toBe('started');
  });
  const board = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!;
  for (const checkpoint of first.result.current.active!.plan.checkpoints.slice(1, board.ordinal + 1)) {
    await act(async () => {
      await first.result.current.advance({ point: checkpoint.point, accuracyMeters: 0, capturedAt: Date.now() + checkpoint.ordinal, source: 'mock' });
    });
  }
  const savedCursor = first.result.current.active!.cursor;
  expect((await readNavigationDocument('alice')).active?.cursor).toEqual(savedCursor);
  first.unmount();

  const restored = renderHook(() => useActiveTrip('alice'));
  expect(restored.result.current.status).toBe('hydrating');
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect(restored.result.current.active?.cursor).toEqual(savedCursor);
  expect(restored.result.current.active?.uid).toBe('alice');

  const other = renderHook(() => useActiveTrip('bob'));
  await waitFor(() => expect(other.result.current.status).toBe('idle'));
  expect(other.result.current.active).toBeNull();
  expect(other.result.current.recents).toEqual([]);
  restored.unmount();
  other.unmount();
});

it('restores a version-1 trip at its unambiguous initial walking cursor without an anchor', async () => {
  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input())).toBe('started');
  });
  const stored = (await readNavigationDocument('alice')).active!;
  expect(stored.cursor.checkpointOrdinal).toBe(0);
  expect(stored.selection.version).toBe(2);
  await updateNavigationDocument('alice', (document) => ({
    ...document,
    active: document.active ? {
      ...document.active,
      progressAnchor: undefined,
      selection: {
        version: 1,
        itineraryId: stored.selection.itineraryId,
        departureTime: stored.selection.legacy!.departureTime,
        arrivalTime: stored.selection.legacy!.arrivalTime,
        fingerprint: stored.selection.legacy!.fingerprint,
      },
    } : null,
  }));
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [structuredClone(fixtures[0]!)] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect(restored.result.current.active?.cursor.checkpointOrdinal).toBe(0);
  expect(restored.result.current.active?.plan.checkpoints[0]?.kind).toBe('start');
  const migrated = (await readNavigationDocument('alice')).active!;
  expect(migrated.selection.version).toBe(2);
  expect(migrated.progressAnchor?.kind).toBe('start');
  restored.unmount();

  const providerDrift = structuredClone(fixtures[0]!);
  for (const step of providerDrift.steps) {
    if (step.kind === 'walk') {
      step.durationSeconds += 1;
      step.distanceMeters += 1;
    } else {
      delete step.tripId;
      delete step.stops;
      delete step.departures;
    }
  }
  planTripMock().mockResolvedValueOnce({ data: { itineraries: [providerDrift] } });
  const secondReload = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(secondReload.result.current.status).toBe('active'));
  expect(secondReload.result.current.active?.cursor.checkpointOrdinal).toBe(0);
  secondReload.unmount();
});

it('preserves stored line summaries while migrating a version-1 trip', async () => {
  const providerLight = structuredClone(fixtures[0]!);
  for (const step of providerLight.steps) {
    if (step.kind === 'transit') {
      delete step.tripId;
      delete step.stops;
      delete step.departures;
    }
  }
  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(providerLight))).toBe('started');
  });
  const stored = (await readNavigationDocument('alice')).active!;
  const preservedLines = [{ mode: 'rail' as const, name: 'Stored LIRR', shortName: 'LIRR' }];
  await updateNavigationDocument('alice', (document) => ({
    ...document,
    active: document.active ? {
      ...document.active,
      lines: preservedLines,
      progressAnchor: undefined,
      selection: {
        version: 1,
        itineraryId: stored.selection.itineraryId,
        departureTime: stored.selection.legacy!.departureTime,
        arrivalTime: stored.selection.legacy!.arrivalTime,
        fingerprint: stored.selection.legacy!.fingerprint,
      },
    } : null,
  }));
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [structuredClone(providerLight)] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect((await readNavigationDocument('alice')).active).toEqual(expect.objectContaining({
    selection: expect.objectContaining({ version: 2 }),
    lines: preservedLines,
  }));
  await act(async () => {
    expect(await restored.result.current.end()).toBe(true);
  });
  expect(restored.result.current.recents[0]?.lines).toEqual(preservedLines);
  restored.unmount();
});

it('restores byte-identical mid-walk progress from one provider-light anchor', async () => {
  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input())).toBe('started');
  });
  const midWalk = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'walk')!;
  await act(async () => {
    await first.result.current.advance({ point: midWalk.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  const savedCursor = first.result.current.active!.cursor;
  const stored = (await readNavigationDocument('alice')).active!;
  expect(stored.progressAnchor).toEqual({
    kind: midWalk.kind,
    stepIndex: midWalk.stepIndex,
    phase: savedCursor.phase,
    point: midWalk.point,
  });
  const serialized = (await AsyncStorage.getItem(navigationStorageKey('alice')))!;
  expect(serialized.match(/"progressAnchor"/g)).toHaveLength(1);
  expect(serialized).not.toMatch(/"path"|"steps"|"geometry"/);
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [structuredClone(fixtures[0]!)] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect(restored.result.current.active?.cursor).toEqual(savedCursor);
  restored.unmount();
});

it('safely rebases a uniquely shifted mid-walk anchor without reusing its ordinal', async () => {
  const original = structuredClone(fixtures[0]!);
  const fresh = structuredClone(original);
  const originalWalk = original.steps[0];
  const freshWalk = fresh.steps[0];
  if (originalWalk?.kind !== 'walk' || freshWalk?.kind !== 'walk') throw new Error('Expected initial walk fixture');

  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(original))).toBe('started');
  });
  const midWalk = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'walk')!;
  await act(async () => {
    await first.result.current.advance({ point: midWalk.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  const savedOrdinal = first.result.current.active!.cursor.checkpointOrdinal;
  const pathIndex = originalWalk.path.findIndex((point) => point.lat === midWalk.point.lat && point.lng === midWalk.point.lng);
  if (pathIndex < 1) throw new Error('Expected a mid-walk path point');
  const before = freshWalk.path[pathIndex - 1]!;
  const shifted = { lat: midWalk.point.lat + 0.00004, lng: midWalk.point.lng };
  freshWalk.path.splice(pathIndex, 1,
    { lat: (before.lat + midWalk.point.lat) / 2, lng: (before.lng + midWalk.point.lng) / 2 },
    shifted);
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [fresh] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect(restored.result.current.active?.cursor.checkpointOrdinal).not.toBe(savedOrdinal);
  expect(restored.result.current.active?.plan.checkpoints[restored.result.current.active.cursor.checkpointOrdinal]?.point).toEqual(shifted);
  const next = restored.result.current.active!.plan.checkpoints[restored.result.current.active!.cursor.checkpointOrdinal + 1]!;
  await act(async () => {
    await restored.result.current.advance({ point: next.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  expect(restored.result.current.active?.cursor.checkpointOrdinal).toBe(next.ordinal);
  expect((await readNavigationDocument('alice')).active).toEqual(expect.objectContaining({
    cursor: expect.objectContaining({ checkpointOrdinal: next.ordinal }),
    progressAnchor: expect.objectContaining({ kind: next.kind, point: next.point }),
  }));
  restored.unmount();
});

it('enters recovery instead of applying a saved ordinal when a shifted walk has no anchor', async () => {
  const original = structuredClone(fixtures[0]!);
  const fresh = structuredClone(original);
  const originalWalk = original.steps[0];
  const freshWalk = fresh.steps[0];
  if (originalWalk?.kind !== 'walk' || freshWalk?.kind !== 'walk') throw new Error('Expected initial walk fixture');
  freshWalk.path = [originalWalk.path[0]!, originalWalk.path.at(-1)!];

  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(original))).toBe('started');
  });
  const board = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!;
  await act(async () => {
    await first.result.current.advance({ point: board.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  expect(first.result.current.active!.cursor.checkpointOrdinal).toBeGreaterThan(0);
  await updateNavigationDocument('alice', (document) => ({
    ...document,
    active: document.active ? { ...document.active, progressAnchor: undefined } : null,
  }));
  expect((await readNavigationDocument('alice')).active?.progressAnchor).toBeUndefined();
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [fresh] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('recovery'));
  expect(restored.result.current.active).toBeNull();
  expect(restored.result.current.recoveryError).toBe('no-exact-match');
  restored.unmount();
});

it('enters recovery when a mid-walk anchor matches multiple fresh checkpoints', async () => {
  const original = structuredClone(fixtures[0]!);
  const fresh = structuredClone(original);
  const originalWalk = original.steps[0];
  const freshWalk = fresh.steps[0];
  if (originalWalk?.kind !== 'walk' || freshWalk?.kind !== 'walk') throw new Error('Expected initial walk fixture');

  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(original))).toBe('started');
  });
  const midWalk = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'walk')!;
  await act(async () => {
    await first.result.current.advance({ point: midWalk.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  const pathIndex = originalWalk.path.findIndex((point) => point.lat === midWalk.point.lat && point.lng === midWalk.point.lng);
  if (pathIndex < 1) throw new Error('Expected a mid-walk path point');
  freshWalk.path.splice(pathIndex, 1,
    { lat: midWalk.point.lat + 0.00016, lng: midWalk.point.lng },
    { lat: midWalk.point.lat - 0.00016, lng: midWalk.point.lng });
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [fresh] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('recovery'));
  expect(restored.result.current.active).toBeNull();
  expect(restored.result.current.recoveryError).toBe('no-exact-match');
  restored.unmount();
});

it('rebases a named transit checkpoint when earlier walking geometry shifts', async () => {
  const original = structuredClone(fixtures[0]!);
  const fresh = structuredClone(original);
  const originalWalk = original.steps[0];
  const freshWalk = fresh.steps[0];
  if (originalWalk?.kind !== 'walk' || freshWalk?.kind !== 'walk') throw new Error('Expected initial walk fixture');
  freshWalk.path = [originalWalk.path[0]!, originalWalk.path.at(-1)!];

  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(original))).toBe('started');
  });
  const transitStop = first.result.current.active!.plan.checkpoints.find((checkpoint) => checkpoint.kind === 'transit-stop')!;
  for (const checkpoint of first.result.current.active!.plan.checkpoints.slice(1, transitStop.ordinal + 1)) {
    await act(async () => {
      await first.result.current.advance({ point: checkpoint.point, accuracyMeters: 0, capturedAt: Date.now() + checkpoint.ordinal, source: 'mock' });
    });
  }
  const savedOrdinal = first.result.current.active!.cursor.checkpointOrdinal;
  const savedNextStop = first.result.current.active!.cursor.nextStopIndex;
  expect((await readNavigationDocument('alice')).active?.cursor.checkpointOrdinal).toBe(savedOrdinal);
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [fresh] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  expect(restored.result.current.active?.cursor).toEqual(expect.objectContaining({ phase: 'riding', nextStopIndex: savedNextStop }));
  expect(restored.result.current.active?.cursor.checkpointOrdinal).not.toBe(savedOrdinal);
  expect(restored.result.current.active?.plan.checkpoints[restored.result.current.active.cursor.checkpointOrdinal]).toEqual(
    expect.objectContaining({ kind: 'transit-stop', transitStopIndex: (savedNextStop ?? 1) - 1 }),
  );
  restored.unmount();
});

it('restores a riding checkpoint by its anchor when fresh stop enrichment is reindexed', async () => {
  const original = structuredClone(fixtures[0]!);
  const fresh = structuredClone(original);
  const transitStepIndex = original.steps.findIndex((step) => step.kind === 'transit' && (step.stops?.length ?? 0) >= 2);
  const freshTransit = fresh.steps[transitStepIndex];
  if (transitStepIndex < 0 || freshTransit?.kind !== 'transit' || !freshTransit.stops?.[0]) {
    throw new Error('Expected enriched transit fixture');
  }
  const firstKnownStop = freshTransit.stops[0];
  freshTransit.stops.unshift({
    ...firstKnownStop,
    name: 'New provider enrichment stop',
    location: {
      lat: (freshTransit.from.location.lat + firstKnownStop.location.lat) / 2,
      lng: (freshTransit.from.location.lng + firstKnownStop.location.lng) / 2,
    },
    time: new Date((Date.parse(freshTransit.from.time) + Date.parse(firstKnownStop.time)) / 2).toISOString(),
  });

  const first = await idleHook();
  await act(async () => {
    expect(await first.result.current.start(input(original))).toBe('started');
  });
  const anchoredStop = first.result.current.active!.plan.checkpoints.filter((checkpoint) => checkpoint.kind === 'transit-stop'
    && checkpoint.stepIndex === transitStepIndex)[1]!;
  for (const checkpoint of first.result.current.active!.plan.checkpoints.slice(1, anchoredStop.ordinal + 1)) {
    await act(async () => {
      await first.result.current.advance({ point: checkpoint.point, accuracyMeters: 0, capturedAt: Date.now() + checkpoint.ordinal, source: 'mock' });
    });
  }
  expect(first.result.current.active?.cursor).toEqual(expect.objectContaining({
    phase: 'riding',
    nextStopIndex: anchoredStop.transitStopIndex! + 1,
  }));
  expect((await readNavigationDocument('alice')).active?.progressAnchor).toEqual(expect.objectContaining({
    kind: 'transit-stop',
    point: anchoredStop.point,
  }));
  first.unmount();

  planTripMock().mockResolvedValueOnce({ data: { itineraries: [fresh] } });
  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('active'));
  const restoredCheckpoint = restored.result.current.active!.plan.checkpoints[restored.result.current.active!.cursor.checkpointOrdinal]!;
  expect(restoredCheckpoint).toEqual(expect.objectContaining({
    kind: 'transit-stop',
    point: anchoredStop.point,
    transitStopIndex: anchoredStop.transitStopIndex! + 1,
  }));
  expect(restored.result.current.active?.cursor.nextStopIndex).toBe(restoredCheckpoint.transitStopIndex! + 1);
  restored.unmount();
});

it('retains recovery metadata and the resume reference across failed retries', async () => {
  const first = await idleHook();
  await act(async () => {
    await first.result.current.start(input());
  });
  first.unmount();
  await updateNavigationDocument('alice', (document) => ({
    ...document,
    active: document.active ? { ...document.active, selection: { ...document.active.selection, fingerprint: 'not-an-exact-match' } } : null,
  }));

  const restored = renderHook(() => useActiveTrip('alice'));
  await waitFor(() => expect(restored.result.current.status).toBe('recovery'));
  expect(restored.result.current.recovery?.destination.label).toBe('Penn Station');
  expect(restored.result.current.recoveryError).toBe('no-exact-match');
  await act(async () => {
    expect(await restored.result.current.retry()).toBe(false);
  });
  expect(restored.result.current.status).toBe('recovery');
  expect((await readNavigationDocument('alice')).active?.selection.fingerprint).toBe('not-an-exact-match');
  restored.unmount();
});

it('cancels replacement without changes, then confirms replacement and records the old trip once', async () => {
  const hook = await idleHook();
  await act(async () => {
    await hook.result.current.start(input(fixtures[0]!));
  });
  const originalId = hook.result.current.active!.sessionId;
  await act(async () => {
    expect(await hook.result.current.start(input(fixtures[1]!))).toBe('replacement-required');
  });
  expect(hook.result.current.pendingReplacement?.itinerary.id).toBe(fixtures[1]!.id);
  act(() => hook.result.current.cancelReplacement());
  expect(hook.result.current.active?.sessionId).toBe(originalId);
  expect(hook.result.current.recents).toEqual([]);

  await act(async () => {
    await hook.result.current.start(input(fixtures[1]!));
  });
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () => {
    expect(await hook.result.current.confirmReplacement()).toBe(false);
  });
  expect(hook.result.current.active?.sessionId).toBe(originalId);
  expect(hook.result.current.pendingReplacement?.itinerary.id).toBe(fixtures[1]!.id);
  expect(hook.result.current.recents).toEqual([]);
  expect((await readNavigationDocument('alice')).active?.sessionId).toBe(originalId);

  await act(async () => {
    expect(await hook.result.current.confirmReplacement()).toBe(true);
  });
  expect(hook.result.current.active?.itinerary.id).toBe(fixtures[1]!.id);
  expect(hook.result.current.active?.sessionId).not.toBe(originalId);
  expect(hook.result.current.recents).toEqual([expect.objectContaining({ sessionId: originalId, outcome: 'ended-early' })]);
  hook.unmount();
});

it('treats rapid identical starts as one successful trip start', async () => {
  const hook = await idleHook();
  const pendingRead = deferred<void>();
  getItemMock.mockClear();
  const storageRead = getItemMock.mockImplementationOnce(async (...args) => {
    await pendingRead.promise;
    return defaultGetItemImplementation(...args);
  });
  const selected = input();
  let first!: ReturnType<typeof hook.result.current.start>;
  let second!: ReturnType<typeof hook.result.current.start>;

  act(() => {
    first = hook.result.current.start(selected);
    second = hook.result.current.start(selected);
  });
  await waitFor(() => expect(storageRead).toHaveBeenCalledTimes(1));

  let results: Awaited<ReturnType<typeof hook.result.current.start>>[] = [];
  await act(async () => {
    pendingRead.resolve(undefined);
    results = await Promise.all([first, second]);
  });

  expect(results).toEqual(['started', 'started']);
  expect(hook.result.current.status).toBe('active');
  expect(hook.result.current.pendingReplacement).toBeNull();
  expect((await readNavigationDocument('alice')).active?.sessionId).toBe(hook.result.current.active?.sessionId);
  hook.unmount();
});

it('shares one in-flight replacement confirmation across rapid confirm actions', async () => {
  const hook = await idleHook();
  await act(async () => {
    expect(await hook.result.current.start(input(fixtures[0]!))).toBe('started');
    expect(await hook.result.current.start(input(fixtures[1]!))).toBe('replacement-required');
  });
  const originalId = hook.result.current.active!.sessionId;
  const pendingRead = deferred<void>();
  getItemMock.mockClear();
  const storageRead = getItemMock.mockImplementationOnce(async (...args) => {
    await pendingRead.promise;
    return defaultGetItemImplementation(...args);
  });
  let first!: ReturnType<typeof hook.result.current.confirmReplacement>;
  let second!: ReturnType<typeof hook.result.current.confirmReplacement>;

  act(() => {
    first = hook.result.current.confirmReplacement();
    second = hook.result.current.confirmReplacement();
  });
  await waitFor(() => expect(storageRead).toHaveBeenCalledTimes(1));

  let results: boolean[] = [];
  await act(async () => {
    pendingRead.resolve(undefined);
    results = await Promise.all([first, second]);
  });

  expect(results).toEqual([true, true]);
  expect(hook.result.current.active?.itinerary.id).toBe(fixtures[1]!.id);
  expect(hook.result.current.pendingReplacement).toBeNull();
  expect(hook.result.current.recents.filter((recent) => recent.sessionId === originalId)).toHaveLength(1);
  expect((await readNavigationDocument('alice')).active?.sessionId).toBe(hook.result.current.active?.sessionId);
  hook.unmount();
});

it('persists monotonic progress, supports admin reset, and completes arrival idempotently', async () => {
  const hook = await idleHook();
  await act(async () => {
    await hook.result.current.start(input());
  });
  const active = hook.result.current.active!;
  expect((await readNavigationDocument('alice')).active?.progressAnchor).toEqual(expect.objectContaining({
    kind: active.plan.checkpoints[0]!.kind,
    point: active.plan.checkpoints[0]!.point,
  }));
  const later = active.plan.checkpoints[Math.min(2, active.plan.checkpoints.length - 2)]!;
  await act(async () => {
    await hook.result.current.advance({ point: later.point, accuracyMeters: 0, capturedAt: Date.now(), source: 'mock' });
  });
  const advancedOrdinal = hook.result.current.active!.cursor.checkpointOrdinal;
  expect(advancedOrdinal).toBeGreaterThan(0);
  const first = active.plan.checkpoints[0]!;
  await act(async () => {
    await hook.result.current.advance({ point: first.point, accuracyMeters: 0, capturedAt: Date.now() + 1, source: 'mock' });
  });
  expect(hook.result.current.active?.cursor.checkpointOrdinal).toBe(advancedOrdinal);
  expect((await readNavigationDocument('alice')).active?.cursor.checkpointOrdinal).toBe(advancedOrdinal);
  expect((await readNavigationDocument('alice')).active?.progressAnchor).toEqual(expect.objectContaining({
    kind: hook.result.current.active!.plan.checkpoints[advancedOrdinal]!.kind,
    point: hook.result.current.active!.plan.checkpoints[advancedOrdinal]!.point,
  }));

  await act(async () => {
    expect(await hook.result.current.resetForAdmin()).toBe(true);
  });
  expect(hook.result.current.active?.cursor.checkpointOrdinal).toBe(0);
  expect((await readNavigationDocument('alice')).active?.cursor.checkpointOrdinal).toBe(0);
  expect((await readNavigationDocument('alice')).active?.progressAnchor).toEqual(expect.objectContaining({
    kind: active.plan.checkpoints[0]!.kind,
    point: active.plan.checkpoints[0]!.point,
  }));

  const sessionId = hook.result.current.active!.sessionId;
  const destination = hook.result.current.active!.plan.checkpoints.at(-1)!;
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () => {
    expect(await hook.result.current.advance({ point: destination.point, accuracyMeters: 0, capturedAt: Date.now() + 2, source: 'mock' })).toBeNull();
  });
  expect(hook.result.current.status).toBe('active');
  expect(hook.result.current.recents).toEqual([]);
  expect((await readNavigationDocument('alice')).active?.sessionId).toBe(sessionId);

  await act(async () => {
    const result = await hook.result.current.advance({ point: destination.point, accuracyMeters: 0, capturedAt: Date.now() + 3, source: 'mock' });
    expect(result?.arrived).toBe(true);
  });
  expect(hook.result.current.status).toBe('idle');
  expect(hook.result.current.recents).toEqual([expect.objectContaining({ sessionId, outcome: 'arrived' })]);
  await act(async () => {
    expect(await hook.result.current.advance({ point: destination.point, accuracyMeters: 0, capturedAt: Date.now() + 4, source: 'mock' })).toBeNull();
  });
  expect(hook.result.current.recents).toHaveLength(1);
  hook.unmount();
});

it('ends early once, clears active state in the same stored document, and strips alternatives', async () => {
  const withAlternatives = structuredClone(fixtures[0]!);
  const leg = withAlternatives.steps.find((step) => step.kind === 'transit')!;
  leg.departures = [{ departs: leg.from.time, arrives: leg.to.time }];
  const runtime = createActiveTripRuntime(input(withAlternatives), 'alice');
  expect(runtime.itinerary.steps.every((step) => step.kind === 'walk' || step.departures === undefined)).toBe(true);

  const hook = await idleHook();
  await act(async () => {
    await hook.result.current.start(input(withAlternatives));
  });
  const id = hook.result.current.active!.sessionId;
  await act(async () => {
    expect(await hook.result.current.end()).toBe(true);
    expect(await hook.result.current.end()).toBe(false);
  });
  const stored = await readNavigationDocument('alice');
  expect(stored.active).toBeNull();
  expect(stored.recents.filter((recent) => recent.sessionId === id)).toHaveLength(1);
  const serialized = await AsyncStorage.getItem(navigationStorageKey('alice'));
  expect(serialized).not.toContain('departures');
  expect(serialized).not.toContain('\\"steps\\"');
  expect(serialized).not.toContain('progressAnchor');
  hook.unmount();
});

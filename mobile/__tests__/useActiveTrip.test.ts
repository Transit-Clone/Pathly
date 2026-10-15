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

it('enters recovery instead of applying a saved ordinal to shifted fresh geometry', async () => {
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

  await act(async () => {
    expect(await hook.result.current.resetForAdmin()).toBe(true);
  });
  expect(hook.result.current.active?.cursor.checkpointOrdinal).toBe(0);
  expect((await readNavigationDocument('alice')).active?.cursor.checkpointOrdinal).toBe(0);

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
  hook.unmount();
});

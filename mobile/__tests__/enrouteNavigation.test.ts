import {
  NAVIGATION_THRESHOLDS,
  advanceNavigation,
  createTripSelectionIdentity,
  distanceMeters,
  guidanceForNavigation,
  initialNavigationCursor,
  normalizeItinerary,
  projectPointToPath,
  sameTripSelection,
  type NavigationCursor,
  type NavigationFix,
  type NormalizedNavigationPlan,
} from '../src/data/enrouteNavigation';
import type { Itinerary, LatLng, TransitStep, WalkStep } from '../src/data/tripPlanning';

const baseTime = Date.UTC(2026, 9, 15, 13);
const at = (minutes: number) => new Date(baseTime + minutes * 60_000).toISOString();
const p = (latOffset: number, lngOffset = 0): LatLng => ({ lat: 40.7 + latOffset, lng: -73.9 + lngOffset });
const stop = (name: string, point: LatLng, minute: number) => ({ name, location: point, time: at(minute) });
const walk = (toName: string, path: LatLng[], minutes = 5): WalkStep => ({
  kind: 'walk', durationSeconds: minutes * 60, distanceMeters: minutes * 80, toName, path,
});
const transit = (
  name: string,
  fromPoint: LatLng,
  toPoint: LatLng,
  fromMinute: number,
  toMinute: number,
  intermediate: { name: string; point: LatLng; minute: number }[] | undefined,
  path: LatLng[] = [fromPoint, toPoint],
): TransitStep => ({
  kind: 'transit',
  mode: 'bus',
  agency: { name: 'Demo Transit' },
  line: { name, shortName: name, color: name === '10' ? '#D33A2C' : '#2457C5' },
  headsign: `Toward ${toMinute}`,
  from: stop(`${name} origin`, fromPoint, fromMinute),
  to: stop(`${name} terminal`, toPoint, toMinute),
  stopCount: (intermediate?.length ?? 0) + 1,
  durationSeconds: (toMinute - fromMinute) * 60,
  path,
  ...(intermediate ? { stops: intermediate.map((item) => stop(item.name, item.point, item.minute)) } : {}),
  tripId: `trip-${name}-${fromMinute}`,
});

const origin = p(0);
const boardOne = p(0.001);
const stopOne = p(0.003);
const transferOne = p(0.005);
const boardTwo = p(0.006);
const stopTwo = p(0.008);
const alightTwo = p(0.01);
const destination = p(0.011);

const fullTrip: Itinerary = {
  id: 'shared-itinerary-id',
  departureTime: at(0),
  arrivalTime: at(45),
  durationSeconds: 45 * 60,
  transfers: 1,
  steps: [
    walk('10 origin', [origin, p(0.0005), boardOne]),
    transit('10', boardOne, transferOne, 5, 20, [{ name: 'First Street', point: stopOne, minute: 12 }], [boardOne, stopOne, transferOne]),
    walk('20 origin', [transferOne, boardTwo], 4),
    transit('20', boardTwo, alightTwo, 25, 40, [{ name: 'Second Street', point: stopTwo, minute: 33 }], [boardTwo, stopTwo, alightTwo]),
    walk('Demo destination', [alightTwo, destination], 5),
  ],
};

const mockFix = (point: LatLng, capturedAt = baseTime): NavigationFix => ({ point, accuracyMeters: 0, capturedAt, source: 'mock' });
const realFix = (point: LatLng, capturedAt: number, accuracyMeters = 8): NavigationFix => ({ point, accuracyMeters, capturedAt, source: 'real' });

function moveMock(plan: NormalizedNavigationPlan, cursor: NavigationCursor, ordinal: number, now = baseTime) {
  return advanceNavigation(plan, cursor, mockFix(plan.checkpoints[ordinal]!.point, now), null, now);
}

describe('enroute itinerary normalization', () => {
  it('orders walking, boarding, known stops, transfers, trailing walking, and arrival', () => {
    const plan = normalizeItinerary(fullTrip);
    expect(plan.checkpoints.map((checkpoint) => checkpoint.kind)).toEqual([
      'start', 'walk', 'board', 'transit-stop', 'alight', 'board', 'transit-stop', 'alight', 'destination',
    ]);
    expect(plan.checkpoints.map((checkpoint) => checkpoint.phase)).toEqual([
      'walking', 'walking', 'waiting-to-board', 'riding', 'transferring', 'waiting-to-board', 'riding', 'walking', 'arrived',
    ]);
    expect(plan.segments.map((segment) => segment.kind)).toEqual(['walk', 'transit', 'walk', 'transit', 'walk']);
    expect(plan.destinationName).toBe('Demo destination');
  });

  it('does not invent intermediate stops for a sparse transit leg', () => {
    const sparse: Itinerary = {
      ...fullTrip,
      id: 'sparse',
      transfers: 0,
      steps: [transit('S', origin, destination, 0, 20, undefined, [])],
    };
    const plan = normalizeItinerary(sparse);
    expect(plan.checkpoints.map((checkpoint) => checkpoint.kind)).toEqual(['board', 'destination']);
    expect(plan.segments[0]!.path).toEqual([origin, destination]);
    const guidance = guidanceForNavigation(plan, initialNavigationCursor(plan, baseTime));
    expect(guidance.remainingStops).toBeNull();
    expect(guidance.nextStopName).toBe('S terminal');
  });

  it('derives honest walking, boarding, riding, transfer, and arrival guidance', () => {
    const plan = normalizeItinerary(fullTrip);
    const initial = guidanceForNavigation(plan, initialNavigationCursor(plan, baseTime));
    expect(initial).toEqual(expect.objectContaining({ phase: 'walking', currentAction: 'Walk to 10 origin', line: null }));

    const board = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!;
    const boarding = guidanceForNavigation(plan, {
      checkpointOrdinal: board.ordinal, stepIndex: board.stepIndex, phase: board.phase, nextStopIndex: 0, lastAdvancedAt: baseTime,
    });
    expect(boarding).toEqual(expect.objectContaining({ phase: 'waiting-to-board', currentAction: 'Board 10 at 10 origin', remainingStops: 2 }));

    const knownStop = plan.checkpoints.find((checkpoint) => checkpoint.label === 'First Street')!;
    const riding = guidanceForNavigation(plan, {
      checkpointOrdinal: knownStop.ordinal, stepIndex: knownStop.stepIndex, phase: knownStop.phase, nextStopIndex: 1, lastAdvancedAt: baseTime,
    });
    expect(riding).toEqual(expect.objectContaining({ phase: 'riding', currentAction: 'Ride 10 toward Toward 20', nextStopName: '10 terminal', remainingStops: 1 }));

    const transfer = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'alight' && checkpoint.phase === 'transferring')!;
    const transferring = guidanceForNavigation(plan, {
      checkpointOrdinal: transfer.ordinal, stepIndex: transfer.stepIndex, phase: transfer.phase, lastAdvancedAt: baseTime,
    });
    expect(transferring.phase).toBe('transferring');
    expect(transferring.currentAction).toBe('Transfer toward 20 origin');
    expect(transferring.line).toBeNull();

    const final = plan.checkpoints.at(-1)!;
    const arrived = guidanceForNavigation(plan, {
      checkpointOrdinal: final.ordinal, stepIndex: final.stepIndex, phase: final.phase, lastAdvancedAt: baseTime,
    });
    expect(arrived).toEqual(expect.objectContaining({ phase: 'arrived', currentAction: 'You’ve arrived at Demo destination', nextAction: null }));
  });

  it('distinguishes retimed departures that share one provider itinerary id', () => {
    const later: Itinerary = {
      ...fullTrip,
      departureTime: at(10),
      arrivalTime: at(55),
      steps: fullTrip.steps.map((step) => step.kind === 'walk' ? step : {
        ...step,
        from: { ...step.from, time: at(Date.parse(step.from.time) / 60_000 - baseTime / 60_000 + 10) },
        to: { ...step.to, time: at(Date.parse(step.to.time) / 60_000 - baseTime / 60_000 + 10) },
      }),
    };
    const firstIdentity = createTripSelectionIdentity(fullTrip);
    const laterIdentity = createTripSelectionIdentity(later);
    expect(firstIdentity.itineraryId).toBe(laterIdentity.itineraryId);
    expect(firstIdentity.fingerprint).not.toBe(laterIdentity.fingerprint);
    expect(firstIdentity.fingerprint).toMatch(/^v1-[0-9a-f]{32}$/);
    expect(firstIdentity.fingerprint).not.toContain('Demo Transit');
    expect(sameTripSelection(firstIdentity, laterIdentity)).toBe(false);
    expect(sameTripSelection(firstIdentity, createTripSelectionIdentity(fullTrip))).toBe(true);
  });
});

describe('navigation geometry', () => {
  it('measures and projects points along a route', () => {
    expect(distanceMeters(origin, p(0.001))).toBeGreaterThan(100);
    const projection = projectPointToPath(p(0.005, 0.001), [origin, p(0.01)]);
    expect(projection).not.toBeNull();
    expect(projection!.fraction).toBeCloseTo(0.5, 1);
    expect(projection!.distanceMeters).toBeGreaterThan(80);
  });
});

describe('monotonic navigation evidence', () => {
  const plan = normalizeItinerary(fullTrip);

  it('requires two consistent real fixes but one authoritative admin fix', () => {
    const initial = initialNavigationCursor(plan, baseTime);
    const boardOrdinal = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!.ordinal;
    const first = advanceNavigation(plan, initial, realFix(boardOne, baseTime + 1_000), null, baseTime + 1_000);
    expect(first.advanced).toBe(false);
    expect(first.evidence?.confirmations).toBe(1);
    const second = advanceNavigation(plan, first.cursor, realFix(boardOne, baseTime + 2_000), first.evidence, baseTime + 2_000);
    expect(second.cursor.checkpointOrdinal).toBe(boardOrdinal);
    expect(second.cursor.phase).toBe('waiting-to-board');

    const admin = advanceNavigation(plan, initial, mockFix(boardOne, baseTime + 1_000), null, baseTime + 1_000);
    expect(admin.cursor.checkpointOrdinal).toBe(boardOrdinal);
    expect(admin.advanced).toBe(true);
  });

  it('can skip missed forward checkpoints when a later checkpoint is unambiguous', () => {
    const initial = initialNavigationCursor(plan, baseTime);
    const firstBoard = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!;
    const waiting = moveMock(plan, initial, firstBoard.ordinal, baseTime + 1_000);
    const firstAlight = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'alight')!;
    const advanced = advanceNavigation(plan, waiting.cursor, mockFix(firstAlight.point, baseTime + 5_000), null, baseTime + 5_000);
    expect(advanced.cursor.checkpointOrdinal).toBe(firstAlight.ordinal);
    expect(advanced.cursor.phase).toBe('transferring');
  });

  it('can catch up to a later transit stop on a dense non-overlapping path', () => {
    const firstStop = p(0.005);
    const secondStop = p(0.01);
    const densePath = Array.from({ length: 61 }, (_, index) => p(index * 0.0002));
    const denseTrip: Itinerary = {
      id: 'dense-transit-catch-up',
      departureTime: at(0),
      arrivalTime: at(20),
      durationSeconds: 20 * 60,
      transfers: 0,
      steps: [transit('D', origin, p(0.012), 0, 20, [
        { name: 'Dense first', point: firstStop, minute: 7 },
        { name: 'Dense second', point: secondStop, minute: 14 },
      ], densePath)],
    };
    const densePlan = normalizeItinerary(denseTrip);
    const initial = initialNavigationCursor(densePlan, baseTime);
    const secondStopCheckpoint = densePlan.checkpoints.find((checkpoint) => checkpoint.label === 'Dense second')!;

    const first = advanceNavigation(densePlan, initial, realFix(secondStop, baseTime + 1_000), null, baseTime + 1_000);
    const second = advanceNavigation(densePlan, first.cursor, realFix(secondStop, baseTime + 2_000), first.evidence, baseTime + 2_000);

    expect(second.cursor.checkpointOrdinal).toBe(secondStopCheckpoint.ordinal);
    expect(second.cursor.phase).toBe('riding');
  });

  it('does not jump past an earlier checkpoint when one fix is close to both', () => {
    const closeStop = p(0.0015);
    const closeTrip: Itinerary = {
      ...fullTrip,
      id: 'close-board-and-stop',
      transfers: 0,
      steps: [
        walk('10 origin', [origin, boardOne]),
        transit('10', boardOne, transferOne, 5, 20, [{ name: 'Close stop', point: closeStop, minute: 8 }], [boardOne, closeStop, transferOne]),
      ],
    };
    const closePlan = normalizeItinerary(closeTrip);
    const board = closePlan.checkpoints.find((checkpoint) => checkpoint.kind === 'board')!;
    const result = advanceNavigation(closePlan, initialNavigationCursor(closePlan, baseTime), mockFix(closeStop, baseTime + 1_000), null, baseTime + 1_000);

    expect(result.cursor.checkpointOrdinal).toBe(board.ordinal);
    expect(result.cursor.phase).toBe('waiting-to-board');
  });

  it('does not treat a later walking-route crossing as movement from the current checkpoint', () => {
    const loopTrip: Itinerary = {
      id: 'walking-route-crossing',
      departureTime: at(0),
      arrivalTime: at(12),
      durationSeconds: 12 * 60,
      transfers: 0,
      steps: [walk('Loop destination', [origin, p(0.001), origin, p(0.002)], 12)],
    };
    const loopPlan = normalizeItinerary(loopTrip);
    const initial = initialNavigationCursor(loopPlan, baseTime);

    const first = advanceNavigation(loopPlan, initial, realFix(origin, baseTime + 1_000), null, baseTime + 1_000);
    const second = advanceNavigation(loopPlan, first.cursor, realFix(origin, baseTime + 2_000), first.evidence, baseTime + 2_000);

    expect(first.cursor.checkpointOrdinal).toBe(initial.checkpointOrdinal);
    expect(second.cursor.checkpointOrdinal).toBe(initial.checkpointOrdinal);
    expect(second.advanced).toBe(false);
  });

  it('does not revisit an already completed checkpoint at a later route crossing', () => {
    const repeatedPoint = p(0.001);
    const crossingTrip: Itinerary = {
      id: 'completed-checkpoint-crossing',
      departureTime: at(0),
      arrivalTime: at(12),
      durationSeconds: 12 * 60,
      transfers: 0,
      steps: [walk('Crossing destination', [origin, repeatedPoint, p(0.002), p(0.003), repeatedPoint, p(0.004)], 12)],
    };
    const crossingPlan = normalizeItinerary(crossingTrip);
    const atThirdCheckpoint = moveMock(crossingPlan, initialNavigationCursor(crossingPlan, baseTime), 2, baseTime + 500);

    const first = advanceNavigation(crossingPlan, atThirdCheckpoint.cursor, realFix(repeatedPoint, baseTime + 1_000), null, baseTime + 1_000);
    const second = advanceNavigation(crossingPlan, first.cursor, realFix(repeatedPoint, baseTime + 2_000), first.evidence, baseTime + 2_000);

    expect(second.cursor.checkpointOrdinal).toBe(atThirdCheckpoint.cursor.checkpointOrdinal);
    expect(second.advanced).toBe(false);
  });

  it('does not treat a future checkpoint on completed between-checkpoint geometry as forward progress', () => {
    const completedPathCrossing = p(0.001);
    const crossingTrip: Itinerary = {
      id: 'completed-geometry-crossing',
      departureTime: at(0),
      arrivalTime: at(12),
      durationSeconds: 12 * 60,
      transfers: 0,
      steps: [walk('Geometry crossing destination', [origin, p(0.002), p(0.002, 0.002), completedPathCrossing, p(0.003)], 12)],
    };
    const crossingPlan = normalizeItinerary(crossingTrip);
    const afterCompletedSegment = moveMock(crossingPlan, initialNavigationCursor(crossingPlan, baseTime), 1, baseTime + 500);

    const first = advanceNavigation(crossingPlan, afterCompletedSegment.cursor, realFix(completedPathCrossing, baseTime + 1_000), null, baseTime + 1_000);
    const second = advanceNavigation(crossingPlan, first.cursor, realFix(completedPathCrossing, baseTime + 2_000), first.evidence, baseTime + 2_000);

    expect(second.cursor.checkpointOrdinal).toBe(afterCompletedSegment.cursor.checkpointOrdinal);
    expect(second.advanced).toBe(false);
  });

  it('does not skip to a future checkpoint that also lies on intervening route geometry', () => {
    const routeStart = { lat: 40, lng: -73 };
    const firstTurn = { lat: 40.001, lng: -72.999 };
    const secondTurn = { lat: 40.001, lng: -73 };
    const crossing = { lat: 40.0005, lng: -72.9995 };
    const routeEnd = { lat: 40.002, lng: -72.9995 };
    const crossingTrip: Itinerary = {
      id: 'intervening-geometry-crossing',
      departureTime: at(0),
      arrivalTime: at(12),
      durationSeconds: 12 * 60,
      transfers: 0,
      steps: [walk('Intervening crossing destination', [routeStart, firstTurn, secondTurn, crossing, routeEnd], 12)],
    };
    const crossingPlan = normalizeItinerary(crossingTrip);
    const initial = initialNavigationCursor(crossingPlan, baseTime);

    const first = advanceNavigation(crossingPlan, initial, realFix(crossing, baseTime + 1_000), null, baseTime + 1_000);
    const second = advanceNavigation(crossingPlan, first.cursor, realFix(crossing, baseTime + 2_000), first.evidence, baseTime + 2_000);

    expect(second.cursor.checkpointOrdinal).toBe(initial.checkpointOrdinal);
    expect(second.advanced).toBe(false);
  });

  it('holds confirmed progress through jitter and backward fixes', () => {
    const knownStop = plan.checkpoints.find((checkpoint) => checkpoint.label === 'First Street')!;
    const atStop = moveMock(plan, initialNavigationCursor(plan, baseTime), knownStop.ordinal, baseTime + 1_000);
    const backward = advanceNavigation(plan, atStop.cursor, mockFix(origin, baseTime + 2_000), null, baseTime + 2_000);
    expect(backward.cursor).toBe(atStop.cursor);
    expect(backward.cursor.checkpointOrdinal).toBe(knownStop.ordinal);
  });

  it('does not skip overlapping transfer boundaries', () => {
    const overlap = p(0.01);
    const trip: Itinerary = {
      id: 'overlap', departureTime: at(0), arrivalTime: at(30), durationSeconds: 1_800, transfers: 1,
      steps: [
        transit('A', origin, overlap, 0, 15, undefined),
        transit('B', overlap, destination, 16, 30, undefined),
      ],
    };
    const overlapPlan = normalizeItinerary(trip);
    const alight = overlapPlan.checkpoints.find((checkpoint) => checkpoint.kind === 'alight')!;
    const nextBoard = overlapPlan.checkpoints.find((checkpoint) => checkpoint.kind === 'board' && checkpoint.stepIndex === 1)!;
    const first = advanceNavigation(overlapPlan, initialNavigationCursor(overlapPlan, baseTime), mockFix(overlap, baseTime + 1_000), null, baseTime + 1_000);
    expect(first.cursor.checkpointOrdinal).toBe(alight.ordinal);
    const second = advanceNavigation(overlapPlan, first.cursor, mockFix(overlap, baseTime + 2_000), null, baseTime + 2_000);
    expect(second.cursor.checkpointOrdinal).toBe(nextBoard.ordinal);
  });

  it('holds on stale, poor, and off-route fixes', () => {
    const initial = initialNavigationCursor(plan, baseTime);
    const stale = advanceNavigation(plan, initial, realFix(boardOne, baseTime), null, baseTime + NAVIGATION_THRESHOLDS.maxRealFixAgeMs + 1);
    expect(stale.locationState).toBe('stale');
    const poor = advanceNavigation(plan, initial, realFix(boardOne, baseTime + 1, NAVIGATION_THRESHOLDS.maxUsableAccuracyMeters + 1), null, baseTime + 1);
    expect(poor.locationState).toBe('poor-accuracy');
    const offRoute = advanceNavigation(plan, initial, mockFix(p(1, 1), baseTime + 1), null, baseTime + 1);
    expect(offRoute.locationState).toBe('off-route');
    expect(stale.cursor).toBe(initial);
    expect(poor.cursor).toBe(initial);
    expect(offRoute.cursor).toBe(initial);
  });

  it('arrives once and remains arrived on repeated fixes', () => {
    const initial = initialNavigationCursor(plan, baseTime);
    const destinationCheckpoint = plan.checkpoints.at(-1)!;
    const arrived = advanceNavigation(plan, initial, mockFix(destinationCheckpoint.point, baseTime + 1), null, baseTime + 1);
    expect(arrived.arrived).toBe(true);
    expect(arrived.cursor.phase).toBe('arrived');
    const repeated = advanceNavigation(plan, arrived.cursor, mockFix(destinationCheckpoint.point, baseTime + 2), null, baseTime + 2);
    expect(repeated.advanced).toBe(false);
    expect(repeated.cursor).toBe(arrived.cursor);
    expect(repeated.arrived).toBe(true);
  });
});

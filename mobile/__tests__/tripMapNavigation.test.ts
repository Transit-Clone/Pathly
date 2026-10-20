import { initialNavigationCursor, normalizeItinerary, type NavigationCursor } from '../src/data/enrouteNavigation';
import { navigationMapProgress } from '../src/data/tripMap';
import type { Itinerary, LatLng, TransitStep, WalkStep } from '../src/data/tripPlanning';

const time = (minute: number) => new Date(Date.UTC(2026, 9, 15, 13, minute)).toISOString();
const p = (offset: number): LatLng => ({ lat: 40.7 + offset, lng: -73.9 });
const walk = (toName: string, path: LatLng[]): WalkStep => ({ kind: 'walk', toName, path, durationSeconds: 300, distanceMeters: 400 });
const ride = (line: string, from: LatLng, via: LatLng | null, to: LatLng, color: string, start: number): TransitStep => ({
  kind: 'transit', mode: 'bus', agency: { name: 'Demo' }, line: { name: line, color }, headsign: 'Downtown',
  from: { name: `${line} origin`, location: from, time: time(start) },
  to: { name: `${line} terminal`, location: to, time: time(start + 10) },
  stopCount: via ? 2 : 1, durationSeconds: 600, path: via ? [from, via, to] : [],
  ...(via ? { stops: [{ name: `${line} via`, location: via, time: time(start + 5) }] } : {}),
});

const origin = p(0);
const board = p(0.001);
const via = p(0.003);
const transfer = p(0.005);
const secondBoard = p(0.006);
const destination = p(0.01);
const trip: Itinerary = {
  id: 'map-trip', departureTime: time(0), arrivalTime: time(30), durationSeconds: 1_800, transfers: 1,
  steps: [
    walk('Red origin', [origin, board]),
    ride('Red', board, via, transfer, '#DD3322', 5),
    walk('Blue origin', [transfer, secondBoard]),
    ride('Blue', secondBoard, null, destination, '#2255CC', 20),
  ],
};

const cursorAt = (plan: ReturnType<typeof normalizeItinerary>, ordinal: number): NavigationCursor => {
  const checkpoint = plan.checkpoints[ordinal]!;
  return {
    checkpointOrdinal: ordinal,
    stepIndex: checkpoint.stepIndex,
    phase: checkpoint.phase,
    lastAdvancedAt: Date.UTC(2026, 9, 15, 13),
  };
};

describe('active trip map progress', () => {
  const plan = normalizeItinerary(trip);

  it('keeps walking/transit identity and line colors across progress states', () => {
    const progress = navigationMapProgress(plan, initialNavigationCursor(plan, 0));
    expect(progress.segments.some((segment) => segment.walk && segment.state === 'current')).toBe(true);
    expect(progress.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ walk: false, color: '#DD3322', state: 'upcoming' }),
      expect.objectContaining({ walk: false, color: '#2255CC', state: 'upcoming' }),
    ]));
    expect(progress.followTarget).toEqual(board);
  });

  it('changes route portions and stop states as the cursor advances', () => {
    const knownStop = plan.checkpoints.find((checkpoint) => checkpoint.label === 'Red via')!;
    const progress = navigationMapProgress(plan, cursorAt(plan, knownStop.ordinal));
    const redSegments = progress.segments.filter((segment) => segment.color === '#DD3322');
    expect(redSegments.map((segment) => segment.state)).toEqual(['completed', 'current']);
    expect(progress.stops.find((stop) => stop.label?.startsWith('Red origin'))?.state).toBe('completed');
    expect(progress.stops.find((stop) => stop.label?.startsWith('Red via'))?.state).toBe('current');
    expect(progress.stops.every((stop) => stop.visible)).toBe(true);
    expect(progress.followTarget).toEqual(transfer);
  });

  it('treats the completed ride and transfer walk as separate boundary states', () => {
    const alight = plan.checkpoints.find((checkpoint) => checkpoint.kind === 'alight' && checkpoint.stepIndex === 1)!;
    const progress = navigationMapProgress(plan, cursorAt(plan, alight.ordinal));
    expect(progress.segments.find((segment) => segment.color === '#DD3322')?.state).toBe('completed');
    expect(progress.segments.find((segment) => segment.stepIndex === 2)?.state).toBe('current');
    expect(progress.segments.find((segment) => segment.color === '#2255CC')?.state).toBe('upcoming');
    expect(progress.followTarget).toEqual(secondBoard);
  });

  it('creates drawable endpoint geometry for sparse transit and retains its stops', () => {
    const sparseTrip: Itinerary = {
      id: 'sparse-map', departureTime: time(0), arrivalTime: time(10), durationSeconds: 600, transfers: 0,
      steps: [ride('Sparse', origin, null, destination, '#773399', 0)],
    };
    const sparsePlan = normalizeItinerary(sparseTrip);
    const progress = navigationMapProgress(sparsePlan, initialNavigationCursor(sparsePlan, 0));
    expect(progress.segments).toEqual([
      expect.objectContaining({ path: [origin, destination], color: '#773399', state: 'current' }),
    ]);
    expect(progress.stops.map((stop) => stop.kind)).toEqual(['stop', 'end']);
    expect(progress.stops.map((stop) => stop.visible)).toEqual([true, true]);
  });

  it('marks every route portion complete at arrival', () => {
    const destinationCheckpoint = plan.checkpoints.at(-1)!;
    const progress = navigationMapProgress(plan, cursorAt(plan, destinationCheckpoint.ordinal));
    expect(progress.segments.every((segment) => segment.state === 'completed')).toBe(true);
    expect(progress.followTarget).toEqual(destinationCheckpoint.point);
  });
});

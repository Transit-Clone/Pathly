import type { Itinerary, LatLng, TransitStep, TripStep } from './tripPlanning';

export type NavigationPhase = 'walking' | 'waiting-to-board' | 'riding' | 'transferring' | 'arrived';
export type NavigationCheckpointKind = 'start' | 'walk' | 'board' | 'transit-stop' | 'alight' | 'destination';

export type TripWalkEvidence = {
  stepIndex: number;
  durationSeconds: number;
  distanceMeters: number;
};

export type LegacyTripSelectionEvidence = {
  departureTime: string;
  arrivalTime: string;
  fingerprint: string;
};

export type TripSelectionIdentity = {
  /** Version 1 records were written by the first enroute build; new records use version 2. */
  version: 1 | 2;
  itineraryId: string;
  departureTime: string;
  arrivalTime: string;
  /** Canonical schedule/endpoint data. This intentionally excludes route geometry and instructions. */
  fingerprint: string;
  /** Optional Pathly timetable evidence. Missing enrichment never makes the same provider trip different. */
  tripIds?: (string | null)[];
  /** Provider walking estimates, compared with a bounded tolerance and never route geometry. */
  walks?: TripWalkEvidence[];
  /** Exact v1 evidence lets an in-progress trip survive an app update when the provider reply is unchanged. */
  legacy?: LegacyTripSelectionEvidence;
};

export type TripEndpointReference =
  | { kind: 'place'; label: string; placeId: string }
  | { kind: 'coordinate'; label: string; point: LatLng; savedAt: number };

export type NavigationCheckpoint = {
  ordinal: number;
  key: string;
  kind: NavigationCheckpointKind;
  point: LatLng;
  label: string;
  stepIndex: number;
  phase: NavigationPhase;
  time?: string;
  transitLegIndex?: number;
  /** Zero-based index in the known intermediate-stop list. */
  transitStopIndex?: number;
  /** The nearest point in this checkpoint's own step geometry. */
  pathIndex: number;
};

export type NavigationLine = {
  name: string;
  shortName?: string;
  color?: string;
  textColor?: string;
};

export type NavigationRouteSegment = {
  stepIndex: number;
  kind: 'walk' | 'transit';
  path: LatLng[];
  color?: string;
  startCheckpointOrdinal: number;
  endCheckpointOrdinal: number;
  transitLegIndex?: number;
  line?: NavigationLine;
  headsign?: string;
  departureTime?: string;
  arrivalTime?: string;
  fromName?: string;
  toName: string;
  /** Present only when the provider supplied the actual intermediate-stop sequence. */
  knownStopCount?: number;
  durationSeconds: number;
  distanceMeters?: number;
};

export type NormalizedNavigationPlan = {
  itineraryId: string;
  selection: TripSelectionIdentity;
  checkpoints: NavigationCheckpoint[];
  segments: NavigationRouteSegment[];
  departureTime: string;
  arrivalTime: string;
  destinationName: string;
};

export type NavigationCursor = {
  checkpointOrdinal: number;
  stepIndex: number;
  phase: NavigationPhase;
  nextStopIndex?: number;
  lastAdvancedAt: number;
};

export type NavigationFix = {
  point: LatLng;
  accuracyMeters: number | null;
  capturedAt: number;
  source: 'real' | 'mock';
};

export type NavigationEvidence = {
  candidateKey: string;
  confirmations: number;
  lastFixAt: number;
  lastPoint: LatLng;
};

export type NavigationLocationState = 'current' | 'stale' | 'poor-accuracy' | 'off-route';

export type NavigationAdvanceResult = {
  cursor: NavigationCursor;
  evidence: NavigationEvidence | null;
  locationState: NavigationLocationState;
  advanced: boolean;
  arrived: boolean;
};

export type NavigationGuidance = {
  phase: NavigationPhase;
  currentAction: string;
  nextAction: string | null;
  currentStopName: string | null;
  nextStopName: string | null;
  remainingStops: number | null;
  line: NavigationLine | null;
  headsign: string | null;
  departureTime: string | null;
  arrivalTime: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
};

export type StartTripInput = {
  itinerary: Itinerary;
  origin: TripEndpointReference;
  destination: TripEndpointReference;
};

export type ActiveTripRuntime = StartTripInput & {
  sessionId: string;
  uid: string;
  plan: NormalizedNavigationPlan;
  startedAt: number;
  updatedAt: number;
  cursor: NavigationCursor;
  evidence: NavigationEvidence | null;
  selection: TripSelectionIdentity;
};

export type NormalizeItineraryOptions = { origin?: LatLng | null; destination?: LatLng | null };

export const NAVIGATION_THRESHOLDS = Object.freeze({
  walkingCheckpointMeters: 45,
  transitCheckpointMeters: 100,
  routeCorridorMeters: 120,
  maxAccuracyExpansionMeters: 50,
  maxUsableAccuracyMeters: 120,
  maxRealFixAgeMs: 60_000,
  realConfirmations: 2,
  mockConfirmations: 1,
  transitDepartureProgressMeters: 60,
  overlapAmbiguityMeters: 20,
  walkingDemoSpacingMeters: 35,
});

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => degrees * Math.PI / 180;
const usablePoint = (point: LatLng | null | undefined): point is LatLng => Boolean(
  point
  && Number.isFinite(point.lat)
  && Number.isFinite(point.lng)
  && Math.abs(point.lat) <= 90
  && Math.abs(point.lng) <= 180,
);

export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export type PathProjection = {
  point: LatLng;
  distanceMeters: number;
  alongMeters: number;
  totalMeters: number;
  fraction: number;
  segmentIndex: number;
};

/** Nearest projection on a path using a local equirectangular plane, suitable for trip-scale paths. */
export function projectPointToPath(point: LatLng, path: readonly LatLng[]): PathProjection | null {
  const usable = path.filter(usablePoint);
  if (usable.length === 0) return null;
  if (usable.length === 1) {
    return { point: usable[0]!, distanceMeters: distanceMeters(point, usable[0]!), alongMeters: 0, totalMeters: 0, fraction: 0, segmentIndex: 0 };
  }

  const referenceLat = toRadians(point.lat);
  const xScale = Math.cos(referenceLat) * EARTH_RADIUS_METERS;
  const yScale = EARTH_RADIUS_METERS;
  const xy = (value: LatLng) => ({ x: toRadians(value.lng - point.lng) * xScale, y: toRadians(value.lat - point.lat) * yScale });
  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < usable.length - 1; index += 1) {
    const length = distanceMeters(usable[index]!, usable[index + 1]!);
    lengths.push(length);
    total += length;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let bestPoint = usable[0]!;
  let bestSegment = 0;
  let before = 0;
  for (let index = 0; index < usable.length - 1; index += 1) {
    const start = xy(usable[index]!);
    const end = xy(usable[index + 1]!);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const squared = dx * dx + dy * dy;
    const t = squared === 0 ? 0 : Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / squared));
    const projectedX = start.x + t * dx;
    const projectedY = start.y + t * dy;
    const candidateDistance = Math.hypot(projectedX, projectedY);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestAlong = before + (lengths[index] ?? 0) * t;
      bestPoint = {
        lat: usable[index]!.lat + (usable[index + 1]!.lat - usable[index]!.lat) * t,
        lng: usable[index]!.lng + (usable[index + 1]!.lng - usable[index]!.lng) * t,
      };
      bestSegment = index;
    }
    before += lengths[index] ?? 0;
  }
  return {
    point: bestPoint,
    distanceMeters: bestDistance,
    alongMeters: bestAlong,
    totalMeters: total,
    fraction: total > 0 ? bestAlong / total : 0,
    segmentIndex: bestSegment,
  };
}

function canonicalPoint(point: LatLng): [number, number] {
  return [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))];
}

function canonicalStop(stop: TransitStep['from']) {
  return { name: stop.name, point: canonicalPoint(stop.location), time: stop.time };
}

/** Stable non-reversible 128-bit token; raw provider fields never leave this function. */
function digestSelection(value: string, version: 1 | 2): string {
  const word = (seed: number) => {
    let hash = (1779033703 ^ value.length ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^ (hash >>> 16)) >>> 0).toString(16).padStart(8, '0');
  };
  return `v${version}-${[0, 1, 2, 3].map(word).join('')}`;
}

const WALK_DURATION_TOLERANCE_SECONDS = 120;
const WALK_DISTANCE_TOLERANCE_METERS = 150;

function legacySelectionEvidence(itinerary: Itinerary): LegacyTripSelectionEvidence {
  const canonical = {
    itineraryId: itinerary.id,
    departureTime: itinerary.departureTime,
    arrivalTime: itinerary.arrivalTime,
    steps: itinerary.steps.map((step) => step.kind === 'walk'
      ? { kind: 'walk', durationSeconds: step.durationSeconds, distanceMeters: step.distanceMeters, toName: step.toName }
      : {
        kind: 'transit',
        mode: step.mode,
        agency: step.agency.name,
        line: step.line.shortName ?? step.line.name,
        tripId: step.tripId ?? null,
        from: canonicalStop(step.from),
        to: canonicalStop(step.to),
        stops: step.stops?.map(canonicalStop) ?? null,
      }),
  };
  return {
    departureTime: itinerary.departureTime,
    arrivalTime: itinerary.arrivalTime,
    fingerprint: digestSelection(JSON.stringify(canonical), 1),
  };
}

function compatibleTripIds(a: TripSelectionIdentity, b: TripSelectionIdentity): boolean {
  return !a.tripIds || !b.tripIds
    || (a.tripIds.length === b.tripIds.length && a.tripIds.every((tripId, index) => {
      const other = b.tripIds?.[index];
      return !tripId || !other || tripId === other;
    }));
}

function compatibleWalks(a: TripSelectionIdentity, b: TripSelectionIdentity): boolean {
  if (!a.walks || !b.walks || a.walks.length !== b.walks.length) return false;
  return a.walks.every((walk, index) => {
    const other = b.walks?.[index];
    if (!other) return false;
    return walk.stepIndex === other.stepIndex
      && Math.abs(walk.durationSeconds - other.durationSeconds) <= WALK_DURATION_TOLERANCE_SECONDS
      && Math.abs(walk.distanceMeters - other.distanceMeters) <= WALK_DISTANCE_TOLERANCE_METERS;
  });
}

/** Exact schedule identity for the selected departure, excluding provider route geometry. */
export function createTripSelectionIdentity(itinerary: Itinerary): TripSelectionIdentity {
  const transits = itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');
  const walks = itinerary.steps.flatMap((step, stepIndex) => step.kind === 'walk'
    ? [{ stepIndex, durationSeconds: step.durationSeconds, distanceMeters: step.distanceMeters }]
    : []);
  // First/last walking estimates and Pathly timetable enrichment can vary across otherwise
  // identical fresh provider calls. Transit stop times are the stable selected-departure core;
  // walking-only trips use their request time plus the bounded evidence above.
  const departureTime = transits[0]?.from.time ?? itinerary.departureTime;
  const arrivalTime = transits.at(-1)?.to.time ?? itinerary.arrivalTime;
  const canonical = transits.length > 0
    ? {
      itineraryId: itinerary.id,
      transits: transits.map((step) => ({
        mode: step.mode,
        agency: step.agency.name,
        line: step.line.shortName ?? step.line.name,
        headsign: step.headsign ?? null,
        from: canonicalStop(step.from),
        to: canonicalStop(step.to),
        stopCount: step.stopCount,
      })),
    }
    : {
      itineraryId: itinerary.id,
      departureTime,
      kind: 'walking-only',
    };
  return {
    version: 2,
    itineraryId: itinerary.id,
    departureTime,
    arrivalTime,
    fingerprint: digestSelection(JSON.stringify(canonical), 2),
    ...(transits.length > 0 ? { tripIds: transits.map((step) => step.tripId ?? null) } : {}),
    walks,
    legacy: legacySelectionEvidence(itinerary),
  };
}

export function sameTripSelection(a: TripSelectionIdentity, b: TripSelectionIdentity): boolean {
  if (!compatibleTripIds(a, b) || a.itineraryId !== b.itineraryId) return false;
  if (a.version === 1 && b.version === 1) {
    return a.departureTime === b.departureTime
      && a.arrivalTime === b.arrivalTime
      && a.fingerprint === b.fingerprint;
  }
  if (a.version !== b.version) {
    const older = a.version === 1 ? a : b;
    const current = a.version === 2 ? a : b;
    return current.legacy?.departureTime === older.departureTime
      && current.legacy.arrivalTime === older.arrivalTime
      && current.legacy.fingerprint === older.fingerprint;
  }
  const arrivalMatches = a.tripIds === undefined && b.tripIds === undefined
    ? Math.abs(Date.parse(a.arrivalTime) - Date.parse(b.arrivalTime)) <= WALK_DURATION_TOLERANCE_SECONDS * 1000
    : a.arrivalTime === b.arrivalTime;
  return a.departureTime === b.departureTime
    && arrivalMatches
    && a.fingerprint === b.fingerprint
    && compatibleWalks(a, b);
}

function samePoint(a: LatLng, b: LatLng, toleranceMeters = 1): boolean {
  return distanceMeters(a, b) <= toleranceMeters;
}

function withoutAdjacentDuplicates(points: readonly (LatLng | null | undefined)[]): LatLng[] {
  const result: LatLng[] = [];
  for (const point of points) {
    if (!usablePoint(point)) continue;
    if (!result.at(-1) || !samePoint(result.at(-1)!, point)) result.push(point);
  }
  return result;
}

function walkPhase(steps: readonly TripStep[], stepIndex: number): NavigationPhase {
  const hasTransitBefore = steps.slice(0, stepIndex).some((step) => step.kind === 'transit');
  const hasTransitAfter = steps.slice(stepIndex + 1).some((step) => step.kind === 'transit');
  return hasTransitBefore && hasTransitAfter ? 'transferring' : 'walking';
}

function geometryForStep(itinerary: Itinerary, stepIndex: number, options: NormalizeItineraryOptions): LatLng[] {
  const step = itinerary.steps[stepIndex];
  if (!step) return [];
  if (step.kind === 'transit') return withoutAdjacentDuplicates([step.from.location, ...step.path, step.to.location]);

  const previous = itinerary.steps[stepIndex - 1];
  const next = itinerary.steps[stepIndex + 1];
  const inferredStart = stepIndex === 0 ? options.origin : previous?.kind === 'transit' ? previous.to.location : undefined;
  const inferredEnd = stepIndex === itinerary.steps.length - 1 ? options.destination : next?.kind === 'transit' ? next.from.location : undefined;
  return withoutAdjacentDuplicates([inferredStart, ...step.path, inferredEnd]);
}

function nearestPathIndex(path: readonly LatLng[], point: LatLng): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  path.forEach((candidate, index) => {
    const distance = distanceMeters(candidate, point);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Builds one ordered checkpoint/geometry model shared by guidance, maps, GPS, and admin demo. */
export function normalizeItinerary(itinerary: Itinerary, options: NormalizeItineraryOptions = {}): NormalizedNavigationPlan {
  const checkpoints: NavigationCheckpoint[] = [];
  const segments: NavigationRouteSegment[] = [];
  const geometries = itinerary.steps.map((_, index) => geometryForStep(itinerary, index, options));
  let transitLegIndex = 0;

  const addCheckpoint = (checkpoint: Omit<NavigationCheckpoint, 'ordinal' | 'key'>): NavigationCheckpoint => {
    const ordinal = checkpoints.length;
    const value = { ...checkpoint, ordinal, key: `${checkpoint.kind}:${checkpoint.stepIndex}:${ordinal}` };
    checkpoints.push(value);
    return value;
  };

  for (let stepIndex = 0; stepIndex < itinerary.steps.length; stepIndex += 1) {
    const step = itinerary.steps[stepIndex]!;
    const path = geometries[stepIndex]!;
    if (step.kind === 'walk') {
      const phase = walkPhase(itinerary.steps, stepIndex);
      const startPoint = path[0];
      let start = checkpoints.at(-1);
      if (!start && startPoint) {
        start = addCheckpoint({
          kind: 'start', point: startPoint, label: 'Start', stepIndex, phase, pathIndex: 0,
        });
      }
      if (!start || path.length === 0) continue;

      let lastDemoPoint = start.point;
      for (let pathIndex = 1; pathIndex < path.length - 1; pathIndex += 1) {
        const point = path[pathIndex]!;
        if (distanceMeters(lastDemoPoint, point) < NAVIGATION_THRESHOLDS.walkingDemoSpacingMeters) continue;
        addCheckpoint({ kind: 'walk', point, label: step.toName, stepIndex, phase, pathIndex });
        lastDemoPoint = point;
      }

      const endPoint = path.at(-1);
      let end = checkpoints.at(-1)!;
      if (endPoint && stepIndex === itinerary.steps.length - 1) {
        end = addCheckpoint({
          kind: 'destination', point: endPoint, label: step.toName || 'Destination', stepIndex, phase: 'arrived', pathIndex: path.length - 1,
        });
      } else if (endPoint) {
        const next = itinerary.steps[stepIndex + 1];
        if (next?.kind === 'transit') {
          end = addCheckpoint({
            kind: 'board', point: next.from.location, label: next.from.name, time: next.from.time,
            stepIndex: stepIndex + 1, phase: 'waiting-to-board', transitLegIndex,
            pathIndex: 0,
          });
        } else if (!samePoint(end.point, endPoint)) {
          end = addCheckpoint({ kind: 'walk', point: endPoint, label: step.toName, stepIndex, phase, pathIndex: path.length - 1 });
        }
      }
      segments.push({
        stepIndex, kind: 'walk', path, startCheckpointOrdinal: start.ordinal, endCheckpointOrdinal: end.ordinal,
        toName: step.toName, durationSeconds: step.durationSeconds, distanceMeters: step.distanceMeters,
      });
      continue;
    }

    const leg = transitLegIndex;
    transitLegIndex += 1;
    let board = checkpoints.at(-1);
    if (!board || board.kind !== 'board' || board.stepIndex !== stepIndex) {
      board = addCheckpoint({
        kind: 'board', point: step.from.location, label: step.from.name, time: step.from.time,
        stepIndex, phase: 'waiting-to-board', transitLegIndex: leg, pathIndex: nearestPathIndex(path, step.from.location),
      });
    }

    const knownStops = (step.stops ?? []).filter((stop) => !samePoint(stop.location, step.from.location) && !samePoint(stop.location, step.to.location));
    knownStops.forEach((stop, stopIndex) => addCheckpoint({
      kind: 'transit-stop', point: stop.location, label: stop.name, time: stop.time,
      stepIndex, phase: 'riding', transitLegIndex: leg, transitStopIndex: stopIndex,
      pathIndex: nearestPathIndex(path, stop.location),
    }));

    const isLastStep = stepIndex === itinerary.steps.length - 1;
    const nextStep = itinerary.steps[stepIndex + 1];
    const nextPhase: NavigationPhase = isLastStep
      ? 'arrived'
      : nextStep?.kind === 'walk'
        ? walkPhase(itinerary.steps, stepIndex + 1)
        : 'transferring';
    const end = addCheckpoint({
      kind: isLastStep ? 'destination' : 'alight',
      point: step.to.location,
      label: step.to.name,
      time: step.to.time,
      stepIndex,
      phase: nextPhase,
      transitLegIndex: leg,
      pathIndex: nearestPathIndex(path, step.to.location),
    });
    segments.push({
      stepIndex,
      kind: 'transit',
      path,
      color: step.line.color,
      startCheckpointOrdinal: board.ordinal,
      endCheckpointOrdinal: end.ordinal,
      transitLegIndex: leg,
      line: { ...step.line },
      headsign: step.headsign,
      departureTime: step.from.time,
      arrivalTime: step.to.time,
      fromName: step.from.name,
      toName: step.to.name,
      ...(step.stops ? { knownStopCount: knownStops.length } : {}),
      durationSeconds: step.durationSeconds,
    });
  }

  const finalStep = itinerary.steps.at(-1);
  const destinationName = checkpoints.at(-1)?.label
    ?? (finalStep?.kind === 'walk' ? finalStep.toName : finalStep?.to.name)
    ?? 'Destination';
  return {
    itineraryId: itinerary.id,
    selection: createTripSelectionIdentity(itinerary),
    checkpoints,
    segments,
    departureTime: itinerary.departureTime,
    arrivalTime: itinerary.arrivalTime,
    destinationName,
  };
}

function cursorAt(plan: NormalizedNavigationPlan, checkpointOrdinal: number, at: number, phase?: NavigationPhase): NavigationCursor {
  const checkpoint = plan.checkpoints[checkpointOrdinal] ?? plan.checkpoints[0];
  const resolvedPhase = phase ?? checkpoint?.phase ?? 'walking';
  const segment = checkpoint ? plan.segments.find((candidate) => candidate.stepIndex === checkpoint.stepIndex) : undefined;
  const nextStopIndex = resolvedPhase === 'riding' && checkpoint?.transitStopIndex !== undefined
    ? checkpoint.transitStopIndex + 1
    : resolvedPhase === 'waiting-to-board' && segment?.knownStopCount !== undefined && segment.knownStopCount > 0 ? 0 : undefined;
  return {
    checkpointOrdinal: checkpoint?.ordinal ?? 0,
    stepIndex: checkpoint?.stepIndex ?? 0,
    phase: resolvedPhase,
    ...(nextStopIndex === undefined ? {} : { nextStopIndex }),
    lastAdvancedAt: at,
  };
}

export function initialNavigationCursor(plan: NormalizedNavigationPlan, at = Date.now()): NavigationCursor {
  return cursorAt(plan, 0, at);
}

export function resetNavigation(plan: NormalizedNavigationPlan, at = Date.now()): NavigationAdvanceResult {
  const cursor = initialNavigationCursor(plan, at);
  return { cursor, evidence: null, locationState: 'current', advanced: false, arrived: cursor.phase === 'arrived' };
}

function checkpointThreshold(checkpoint: NavigationCheckpoint): number {
  return checkpoint.kind === 'board' || checkpoint.kind === 'transit-stop' || checkpoint.kind === 'alight'
    ? NAVIGATION_THRESHOLDS.transitCheckpointMeters
    : NAVIGATION_THRESHOLDS.walkingCheckpointMeters;
}

type Candidate = { key: string; ordinal: number; phase: NavigationPhase; stepIndex: number };

function nearestRouteDistance(plan: NormalizedNavigationPlan, point: LatLng): number {
  return Math.min(
    ...plan.segments.map((segment) => projectPointToPath(point, segment.path)?.distanceMeters ?? Number.POSITIVE_INFINITY),
    ...plan.checkpoints.map((checkpoint) => distanceMeters(point, checkpoint.point)),
  );
}

type OrderedRouteSegment = {
  segment: NavigationRouteSegment;
  segmentIndex: number;
  startMeters: number;
};

type CheckpointRoutePosition = {
  segmentIndex: number;
  pathIndex: number;
  offsetMeters: number;
};

function pathDistanceMeters(path: readonly LatLng[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += distanceMeters(path[index]!, path[index + 1]!);
  }
  return total;
}

function orderedRouteSegments(plan: NormalizedNavigationPlan): OrderedRouteSegment[] {
  let startMeters = 0;
  return plan.segments.map((segment, segmentIndex) => {
    const ordered = { segment, segmentIndex, startMeters };
    startMeters += pathDistanceMeters(segment.path);
    return ordered;
  });
}

function checkpointRoutePosition(
  orderedSegments: readonly OrderedRouteSegment[],
  checkpoint: NavigationCheckpoint,
): CheckpointRoutePosition | null {
  const ordered = orderedSegments.find(({ segment }) => segment.stepIndex === checkpoint.stepIndex
    && checkpoint.ordinal >= segment.startCheckpointOrdinal
    && checkpoint.ordinal <= segment.endCheckpointOrdinal);
  if (!ordered) return null;
  const pathIndex = Math.max(0, Math.min(checkpoint.pathIndex, ordered.segment.path.length - 1));
  return {
    segmentIndex: ordered.segmentIndex,
    pathIndex,
    offsetMeters: ordered.startMeters + pathDistanceMeters(ordered.segment.path.slice(0, pathIndex + 1)),
  };
}

function matchesEarlierRoutePosition(
  plan: NormalizedNavigationPlan,
  selected: NavigationCheckpoint,
  fix: NavigationFix,
  expansion: number,
): boolean {
  const orderedSegments = orderedRouteSegments(plan);
  const selectedPosition = checkpointRoutePosition(orderedSegments, selected);
  if (!selectedPosition) return false;
  const minimumOrderedSeparation = Math.max(
    NAVIGATION_THRESHOLDS.overlapAmbiguityMeters,
    checkpointThreshold(selected) + expansion,
  );

  const earlierCheckpointMatch = plan.checkpoints.slice(0, selected.ordinal).some((checkpoint) => {
    const position = checkpointRoutePosition(orderedSegments, checkpoint);
    return position
      && selectedPosition.offsetMeters - position.offsetMeters >= minimumOrderedSeparation
      && distanceMeters(fix.point, checkpoint.point) <= checkpointThreshold(checkpoint) + expansion;
  });
  if (earlierCheckpointMatch) return true;

  return orderedSegments.some((ordered) => {
    if (ordered.segmentIndex > selectedPosition.segmentIndex) return false;
    const path = ordered.segmentIndex === selectedPosition.segmentIndex
      ? ordered.segment.path.slice(0, selectedPosition.pathIndex + 1)
      : ordered.segment.path;
    const segmentThreshold = ordered.segment.kind === 'transit'
      ? NAVIGATION_THRESHOLDS.routeCorridorMeters
      : NAVIGATION_THRESHOLDS.walkingCheckpointMeters;
    const threshold = Math.min(segmentThreshold, checkpointThreshold(selected)) + expansion;
    let beforeEdgeMeters = 0;
    for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
      const edge = path.slice(pathIndex, pathIndex + 2);
      const projection = projectPointToPath(fix.point, edge);
      if (projection) {
        const projectionOffset = ordered.startMeters + beforeEdgeMeters + projection.alongMeters;
        const materiallyEarlier = selectedPosition.offsetMeters - projectionOffset
          >= minimumOrderedSeparation;
        if (materiallyEarlier && projection.distanceMeters <= threshold) return true;
      }
      if (edge.length === 2) beforeEdgeMeters += distanceMeters(edge[0]!, edge[1]!);
    }
    return false;
  });
}

function checkpointCandidate(plan: NormalizedNavigationPlan, cursor: NavigationCursor, fix: NavigationFix, expansion: number): Candidate | null {
  const selected = plan.checkpoints
    .slice(cursor.checkpointOrdinal + 1)
    .find((checkpoint) => distanceMeters(fix.point, checkpoint.point) <= checkpointThreshold(checkpoint) + expansion);
  // If one fix falls inside several checkpoint radii, spatial proximity alone cannot prove the
  // intervening checkpoints were crossed. Confirm the earliest; unique later matches can catch up.
  if (!selected) return null;
  const skipsCheckpoint = selected.ordinal > cursor.checkpointOrdinal + 1;
  // A self-crossing route can put a later checkpoint on earlier completed or intervening geometry.
  // Spatial proximity is not ordered evidence when another plausible occurrence is materially
  // earlier along the trip, so it cannot justify skipping intervening checkpoints.
  if (skipsCheckpoint && matchesEarlierRoutePosition(plan, selected, fix, expansion)) return null;
  return { key: `checkpoint:${selected.ordinal}:${selected.phase}`, ordinal: selected.ordinal, phase: selected.phase, stepIndex: selected.stepIndex };
}

function ridingCandidate(plan: NormalizedNavigationPlan, cursor: NavigationCursor, fix: NavigationFix, expansion: number): Candidate | null {
  if (cursor.phase !== 'waiting-to-board') return null;
  const segment = plan.segments.find((candidate) => candidate.kind === 'transit' && candidate.startCheckpointOrdinal === cursor.checkpointOrdinal);
  if (!segment) return null;
  const projection = projectPointToPath(fix.point, segment.path);
  if (!projection || projection.distanceMeters > NAVIGATION_THRESHOLDS.routeCorridorMeters + expansion) return null;
  if (projection.alongMeters < NAVIGATION_THRESHOLDS.transitDepartureProgressMeters) return null;
  return { key: `phase:${cursor.checkpointOrdinal}:riding`, ordinal: cursor.checkpointOrdinal, phase: 'riding', stepIndex: segment.stepIndex };
}

function unchanged(cursor: NavigationCursor, evidence: NavigationEvidence | null, locationState: NavigationLocationState): NavigationAdvanceResult {
  return { cursor, evidence, locationState, advanced: false, arrived: cursor.phase === 'arrived' };
}

/**
 * Applies credible spatial evidence without ever decreasing the confirmed ordinal. Real fixes need
 * two consistent observations; an admin mock fix is authoritative and advances in one update.
 */
export function advanceNavigation(
  plan: NormalizedNavigationPlan,
  cursor: NavigationCursor,
  fix: NavigationFix,
  evidence: NavigationEvidence | null = null,
  now = Date.now(),
): NavigationAdvanceResult {
  if (cursor.phase === 'arrived') return unchanged(cursor, null, 'current');
  if (fix.source === 'real' && now - fix.capturedAt > NAVIGATION_THRESHOLDS.maxRealFixAgeMs) return unchanged(cursor, null, 'stale');
  if (fix.source === 'real' && (fix.accuracyMeters === null || fix.accuracyMeters > NAVIGATION_THRESHOLDS.maxUsableAccuracyMeters)) {
    return unchanged(cursor, null, 'poor-accuracy');
  }
  if (!usablePoint(fix.point)) return unchanged(cursor, null, 'poor-accuracy');

  const expansion = fix.source === 'mock' ? 0 : Math.min(fix.accuracyMeters ?? 0, NAVIGATION_THRESHOLDS.maxAccuracyExpansionMeters);
  const checkpoint = checkpointCandidate(plan, cursor, fix, expansion);
  const riding = ridingCandidate(plan, cursor, fix, expansion);
  // Reaching an explicit checkpoint is stronger than a path projection.
  const candidate = checkpoint ?? riding;
  if (!candidate) {
    const offRoute = nearestRouteDistance(plan, fix.point) > NAVIGATION_THRESHOLDS.routeCorridorMeters + expansion;
    return unchanged(cursor, null, offRoute ? 'off-route' : 'current');
  }

  const required = fix.source === 'mock' ? NAVIGATION_THRESHOLDS.mockConfirmations : NAVIGATION_THRESHOLDS.realConfirmations;
  const confirmations = evidence?.candidateKey === candidate.key && fix.capturedAt > evidence.lastFixAt
    ? evidence.confirmations + 1
    : 1;
  const nextEvidence: NavigationEvidence = {
    candidateKey: candidate.key,
    confirmations,
    lastFixAt: fix.capturedAt,
    lastPoint: fix.point,
  };
  if (confirmations < required) return unchanged(cursor, nextEvidence, 'current');

  const nextCursor = cursorAt(plan, candidate.ordinal, now, candidate.phase);
  // Same-ordinal phase changes (waiting -> riding) are forward progress too.
  const advanced = nextCursor.checkpointOrdinal > cursor.checkpointOrdinal || nextCursor.phase !== cursor.phase;
  return {
    cursor: advanced ? nextCursor : cursor,
    evidence: null,
    locationState: 'current',
    advanced,
    arrived: (advanced ? nextCursor : cursor).phase === 'arrived',
  };
}

function segmentForCursor(plan: NormalizedNavigationPlan, cursor: NavigationCursor): NavigationRouteSegment | undefined {
  if (cursor.phase === 'walking' || cursor.phase === 'transferring') {
    return plan.segments.find((segment) => segment.kind === 'walk'
      && cursor.checkpointOrdinal >= segment.startCheckpointOrdinal
      && cursor.checkpointOrdinal < segment.endCheckpointOrdinal);
  }
  if (cursor.phase === 'waiting-to-board' || cursor.phase === 'riding') {
    return plan.segments.find((segment) => segment.kind === 'transit'
      && cursor.checkpointOrdinal >= segment.startCheckpointOrdinal
      && cursor.checkpointOrdinal < segment.endCheckpointOrdinal);
  }
  return plan.segments.at(-1);
}

function lineLabel(line: NavigationLine | undefined): string {
  return line?.shortName ?? line?.name ?? 'transit';
}

export function guidanceForNavigation(plan: NormalizedNavigationPlan, cursor: NavigationCursor): NavigationGuidance {
  const current = plan.checkpoints[cursor.checkpointOrdinal];
  const next = plan.checkpoints[cursor.checkpointOrdinal + 1];
  const segment = segmentForCursor(plan, cursor);
  const line = segment?.kind === 'transit' ? segment.line ?? null : null;
  const headsign = segment?.kind === 'transit' ? segment.headsign ?? null : null;
  const rideLabel = lineLabel(line ?? undefined);

  let currentAction: string;
  if (cursor.phase === 'arrived') currentAction = `You’ve arrived at ${plan.destinationName}`;
  else if (cursor.phase === 'waiting-to-board') currentAction = `Board ${rideLabel}${current?.label ? ` at ${current.label}` : ''}`;
  else if (cursor.phase === 'riding') currentAction = `Ride ${rideLabel}${headsign ? ` toward ${headsign}` : ''}`;
  else if (cursor.phase === 'transferring') currentAction = `Transfer toward ${next?.label ?? segment?.toName ?? plan.destinationName}`;
  else currentAction = `Walk to ${segment?.toName ?? next?.label ?? plan.destinationName}`;

  let nextAction: string | null = null;
  if (next) {
    if (next.kind === 'board') {
      const nextSegment = plan.segments.find((candidate) => candidate.stepIndex === next.stepIndex);
      nextAction = `Board ${lineLabel(nextSegment?.line)}${nextSegment?.headsign ? ` toward ${nextSegment.headsign}` : ''}`;
    } else if (next.kind === 'destination') nextAction = `Arrive at ${next.label}`;
    else if (next.kind === 'alight') nextAction = `Get off at ${next.label}`;
    else nextAction = `Continue to ${next.label}`;
  }

  let remainingStops: number | null = null;
  if (segment?.kind === 'transit' && segment.knownStopCount !== undefined) {
    remainingStops = plan.checkpoints.filter((checkpoint) => checkpoint.stepIndex === segment.stepIndex
      && checkpoint.ordinal > cursor.checkpointOrdinal
      && (checkpoint.kind === 'transit-stop' || checkpoint.kind === 'alight' || checkpoint.kind === 'destination')).length;
  }
  return {
    phase: cursor.phase,
    currentAction,
    nextAction,
    currentStopName: current?.label ?? null,
    nextStopName: next && (next.kind === 'transit-stop' || next.kind === 'alight' || next.kind === 'destination') ? next.label : null,
    remainingStops,
    line,
    headsign,
    departureTime: segment?.kind === 'transit' ? segment.departureTime ?? null : null,
    arrivalTime: plan.arrivalTime,
    distanceMeters: segment?.kind === 'walk' ? segment.distanceMeters ?? null : null,
    durationSeconds: segment?.durationSeconds ?? null,
  };
}

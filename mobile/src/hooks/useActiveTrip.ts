import { useCallback, useEffect, useRef, useState } from 'react';

import {
  advanceNavigation,
  createTripSelectionIdentity,
  initialNavigationCursor,
  normalizeItinerary,
  resetNavigation,
  type ActiveTripRuntime,
  type NavigationAdvanceResult,
  type NavigationCursor,
  type NavigationFix,
  type NavigationLocationState,
  type StartTripInput,
  type TripEndpointReference,
} from '../data/enrouteNavigation';
import {
  NAVIGATION_STORAGE_VERSION,
  completeNavigationSession,
  readNavigationDocument,
  recentFromActive,
  updateNavigationDocument,
  type ActiveTripResumeV1,
  type NavigationDocumentV1,
  type PersistedLineSummaryV1,
  type RecentTripV1,
} from '../data/navigationStorage';
import {
  planTripForResume,
  type Itinerary,
  type ResumePlanRequest,
  type TransitStep,
} from '../data/tripPlanning';

export type StartActiveTripInput = StartTripInput & { resumeRequest: ResumePlanRequest };
export type StartActiveTripResult = 'started' | 'replacement-required' | 'not-ready' | 'failed';
export type ActiveTripStatus = 'hydrating' | 'idle' | 'active' | 'recovery';

export type ActiveTripState = {
  uid: string | null;
  status: ActiveTripStatus;
  active: ActiveTripRuntime | null;
  /** Persisted metadata remains usable by Home and End trip when fresh planning cannot recover. */
  recovery: ActiveTripResumeV1 | null;
  recoveryError: 'unavailable' | 'no-exact-match' | null;
  retrying: boolean;
  recents: RecentTripV1[];
  pendingReplacement: StartActiveTripInput | null;
  locationState: NavigationLocationState | null;
};

export type ActiveTripCoordinator = ActiveTripState & {
  start: (input: StartActiveTripInput) => Promise<StartActiveTripResult>;
  confirmReplacement: () => Promise<boolean>;
  cancelReplacement: () => void;
  retry: () => Promise<boolean>;
  advance: (fix: NavigationFix) => Promise<NavigationAdvanceResult | null>;
  end: () => Promise<boolean>;
  resetForAdmin: () => Promise<boolean>;
};

const phaseRank = new Map([
  ['walking', 0],
  ['waiting-to-board', 1],
  ['riding', 2],
  ['transferring', 3],
  ['arrived', 4],
]);

function initialState(uid: string | null): ActiveTripState {
  return {
    uid,
    status: uid ? 'hydrating' : 'idle',
    active: null,
    recovery: null,
    recoveryError: null,
    retrying: false,
    recents: [],
    pendingReplacement: null,
    locationState: null,
  };
}

function endpointPoint(endpoint: TripEndpointReference) {
  return endpoint.kind === 'coordinate' ? endpoint.point : null;
}

/** Runtime itineraries keep the selected trip, but not mutable alternative-departure menus. */
function freezeSelectedItinerary(itinerary: Itinerary): Itinerary {
  return {
    ...itinerary,
    steps: itinerary.steps.map((step) => {
      if (step.kind === 'walk') return { ...step, path: [...step.path] };
      const { departures: _departures, ...selected } = step;
      return {
        ...selected,
        agency: { ...step.agency },
        line: { ...step.line },
        from: { ...step.from, location: { ...step.from.location } },
        to: { ...step.to, location: { ...step.to.location } },
        path: [...step.path],
        ...(step.stops ? { stops: step.stops.map((stop) => ({ ...stop, location: { ...stop.location } })) } : {}),
      };
    }),
  };
}

function lineSummaries(itinerary: Itinerary): PersistedLineSummaryV1[] {
  return itinerary.steps.filter((step): step is TransitStep & { tripId: string } => step.kind === 'transit' && typeof step.tripId === 'string').map((step) => ({
    mode: step.mode,
    name: step.line.name,
    ...(step.line.shortName ? { shortName: step.line.shortName } : {}),
    ...(step.line.color ? { color: step.line.color } : {}),
    tripId: step.tripId,
  }));
}

function sessionId(): string {
  const randomUUID = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID;
  return randomUUID ? randomUUID.call(globalThis.crypto) : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createActiveTripRuntime(
  input: StartTripInput,
  uid: string,
  at = Date.now(),
  id = sessionId(),
): ActiveTripRuntime {
  const itinerary = freezeSelectedItinerary(input.itinerary);
  const plan = normalizeItinerary(itinerary, { origin: endpointPoint(input.origin), destination: endpointPoint(input.destination) });
  return {
    itinerary,
    origin: input.origin,
    destination: input.destination,
    sessionId: id,
    uid,
    plan,
    startedAt: at,
    updatedAt: at,
    cursor: initialNavigationCursor(plan, at),
    evidence: null,
    selection: createTripSelectionIdentity(itinerary),
  };
}

function resumeRecord(runtime: ActiveTripRuntime, request: ResumePlanRequest): ActiveTripResumeV1 {
  return {
    version: NAVIGATION_STORAGE_VERSION,
    sessionId: runtime.sessionId,
    uid: runtime.uid,
    startedAt: runtime.startedAt,
    updatedAt: runtime.updatedAt,
    origin: runtime.origin,
    destination: runtime.destination,
    request: { ...request, origin: runtime.origin, destination: runtime.destination },
    selection: runtime.selection,
    cursor: runtime.cursor,
    lines: lineSummaries(runtime.itinerary),
  };
}

function cursorAtLeast(left: NavigationCursor, right: NavigationCursor): NavigationCursor {
  if (left.checkpointOrdinal !== right.checkpointOrdinal) return left.checkpointOrdinal > right.checkpointOrdinal ? left : right;
  const leftRank = phaseRank.get(left.phase) ?? 0;
  const rightRank = phaseRank.get(right.phase) ?? 0;
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  return left.lastAdvancedAt >= right.lastAdvancedAt ? left : right;
}

function resumeCheckpoint(
  plan: ReturnType<typeof normalizeItinerary>,
  cursor: NavigationCursor,
  itinerary: Itinerary,
) {
  const step = itinerary.steps[cursor.stepIndex];
  if (!step) return null;
  if (cursor.phase === 'arrived') {
    return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'destination' && checkpoint.stepIndex === cursor.stepIndex) ?? null;
  }
  if (cursor.phase === 'waiting-to-board') {
    return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board' && checkpoint.stepIndex === cursor.stepIndex) ?? null;
  }
  if (cursor.phase === 'riding') {
    const nextStopIndex = cursor.nextStopIndex;
    if (nextStopIndex === undefined) {
      return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board' && checkpoint.stepIndex === cursor.stepIndex) ?? null;
    }
    return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'transit-stop'
      && checkpoint.stepIndex === cursor.stepIndex
      && checkpoint.transitStopIndex === nextStopIndex - 1) ?? null;
  }
  // Transit boundaries are structural and can be rebased even if earlier walking geometry added
  // checkpoints. Mid-walk points have no persisted spatial anchor, so guessing would risk moving
  // progress to a different point on the same step; keep those sessions in recovery instead.
  if (step.kind === 'transit') {
    return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'alight'
      && checkpoint.stepIndex === cursor.stepIndex
      && checkpoint.phase === cursor.phase) ?? null;
  }
  if (cursor.phase === 'walking' && cursor.checkpointOrdinal === 0) {
    return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'start' && checkpoint.stepIndex === cursor.stepIndex) ?? null;
  }
  return null;
}

function runtimeFromResume(resume: ActiveTripResumeV1, itinerary: Itinerary): ActiveTripRuntime | null {
  const selected = freezeSelectedItinerary(itinerary);
  const plan = normalizeItinerary(selected, { origin: endpointPoint(resume.origin), destination: endpointPoint(resume.destination) });
  const checkpoint = resumeCheckpoint(plan, resume.cursor, selected);
  // The exact schedule identity intentionally excludes provider geometry. A fresh response can
  // therefore add/remove generated walk checkpoints. Never apply a raw ordinal to a different
  // semantic step; recovery is safer than silently moving the rider forward or backward.
  if (!checkpoint) return null;
  const cursor = { ...resume.cursor, checkpointOrdinal: checkpoint.ordinal, stepIndex: checkpoint.stepIndex };
  return {
    itinerary: selected,
    origin: resume.origin,
    destination: resume.destination,
    sessionId: resume.sessionId,
    uid: resume.uid,
    plan,
    startedAt: resume.startedAt,
    updatedAt: resume.updatedAt,
    cursor,
    evidence: null,
    selection: resume.selection,
  };
}

function activeSessionId(state: ActiveTripState): string | null {
  return state.active?.sessionId ?? state.recovery?.sessionId ?? null;
}

function sameEndpoint(left: TripEndpointReference, right: TripEndpointReference): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'place' && right.kind === 'place') return left.placeId === right.placeId;
  return left.kind === 'coordinate' && right.kind === 'coordinate'
    && left.point.lat === right.point.lat
    && left.point.lng === right.point.lng
    && left.savedAt === right.savedAt;
}

function isSameActiveTrip(active: ActiveTripRuntime, input: StartActiveTripInput): boolean {
  const selection = createTripSelectionIdentity(input.itinerary);
  return active.selection.version === selection.version
    && active.selection.itineraryId === selection.itineraryId
    && active.selection.departureTime === selection.departureTime
    && active.selection.arrivalTime === selection.arrivalTime
    && active.selection.fingerprint === selection.fingerprint
    && sameEndpoint(active.origin, input.origin)
    && sameEndpoint(active.destination, input.destination);
}

/** Per-UID active-trip lifecycle; Home owns one instance and passes its state to child views. */
export function useActiveTrip(uid: string | undefined): ActiveTripCoordinator {
  const normalizedUid = uid ?? null;
  const [state, setState] = useState<ActiveTripState>(() => initialState(normalizedUid));
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const actionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const replacementConfirmationRef = useRef<Promise<boolean> | null>(null);

  const commit = useCallback((next: ActiveTripState | ((current: ActiveTripState) => ActiveTripState)) => {
    const resolved = typeof next === 'function' ? next(stateRef.current) : next;
    stateRef.current = resolved;
    setState(resolved);
  }, []);

  const enqueue = useCallback(<Result,>(action: () => Promise<Result>): Promise<Result> => {
    const next = actionQueueRef.current.catch(() => undefined).then(action);
    actionQueueRef.current = next;
    return next;
  }, []);

  const recover = useCallback(async (resume: ActiveTripResumeV1, recents: RecentTripV1[]): Promise<boolean> => {
    const result = await planTripForResume(resume.request, resume.selection);
    // An auth change can finish while the network request is in flight. Never publish the prior
    // account's runtime into the new account's hook instance.
    if (stateRef.current.uid !== resume.uid) return false;
    if (!result.ok) {
      commit({
        uid: resume.uid,
        status: 'recovery',
        active: null,
        recovery: resume,
        recoveryError: result.problem,
        retrying: false,
        recents,
        pendingReplacement: null,
        locationState: null,
      });
      return false;
    }
    const active = runtimeFromResume(resume, result.itinerary);
    if (!active) {
      commit({
        uid: resume.uid,
        status: 'recovery',
        active: null,
        recovery: resume,
        recoveryError: 'no-exact-match',
        retrying: false,
        recents,
        pendingReplacement: null,
        locationState: null,
      });
      return false;
    }
    commit({
      uid: resume.uid,
      status: 'active',
      active,
      recovery: null,
      recoveryError: null,
      retrying: false,
      recents,
      pendingReplacement: null,
      locationState: null,
    });
    return true;
  }, [commit]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    commit(initialState(normalizedUid));
    if (!normalizedUid) return undefined;
    let cancelled = false;
    void readNavigationDocument(normalizedUid).then(async (document) => {
      if (cancelled || generationRef.current !== generation) return;
      if (!document.active) {
        commit({ ...initialState(normalizedUid), status: 'idle', recents: document.recents });
        return;
      }
      await recover(document.active, document.recents);
    }, () => {
      if (!cancelled && generationRef.current === generation) commit({ ...initialState(normalizedUid), status: 'idle' });
    });
    return () => {
      cancelled = true;
    };
  }, [commit, normalizedUid, recover]);

  const install = useCallback(async (accountUid: string, input: StartActiveTripInput, now = Date.now()): Promise<boolean> => {
    const runtime = createActiveTripRuntime(input, accountUid, now);
    const persisted = resumeRecord(runtime, input.resumeRequest);
    try {
      const document = await updateNavigationDocument(accountUid, (current) => ({ ...current, active: persisted }), now);
      if (stateRef.current.uid !== accountUid) return false;
      commit({
        uid: accountUid,
        status: 'active',
        active: runtime,
        recovery: null,
        recoveryError: null,
        retrying: false,
        recents: document.recents,
        pendingReplacement: null,
        locationState: null,
      });
      return true;
    } catch {
      return false;
    }
  }, [commit]);

  const start = useCallback((input: StartActiveTripInput) => enqueue(async () => {
    const current = stateRef.current;
    if (!current.uid || current.status === 'hydrating') return 'not-ready' as const;
    // A double tap can enqueue the same GO action twice before the first storage write finishes.
    // Once that first action succeeds, treat the matching second action as the same start rather
    // than asking the rider to replace the trip that action just created.
    if (current.active && isSameActiveTrip(current.active, input)) return 'started' as const;
    if (current.active || current.recovery) {
      commit({ ...current, pendingReplacement: input });
      return 'replacement-required' as const;
    }
    return await install(current.uid, input) ? 'started' as const : 'failed' as const;
  }), [commit, enqueue, install]);

  const cancelReplacement = useCallback(() => {
    const current = stateRef.current;
    if (current.uid === normalizedUid && current.pendingReplacement) commit({ ...current, pendingReplacement: null });
  }, [commit, normalizedUid]);

  const confirmReplacement = useCallback(() => {
    if (replacementConfirmationRef.current) return replacementConfirmationRef.current;
    const confirmation = enqueue(async () => {
      const current = stateRef.current;
      const pending = current.pendingReplacement;
      const id = activeSessionId(current);
      if (!current.uid || !pending || !id) return false;
      const at = Date.now();
      const runtime = createActiveTripRuntime(pending, current.uid, at);
      const replacement = resumeRecord(runtime, pending.resumeRequest);
      try {
        let replaced = false;
        const document = await updateNavigationDocument(current.uid, (stored) => {
          const previous = stored.active?.sessionId === id ? stored.active : null;
          if (!previous) return stored;
          replaced = true;
          const recents = stored.recents.some((recent) => recent.sessionId === id)
            ? stored.recents
            : [recentFromActive(previous, 'ended-early', at), ...stored.recents];
          return { ...stored, active: replacement, recents };
        }, at);
        if (!replaced || document.active?.sessionId !== runtime.sessionId || stateRef.current.uid !== current.uid) return false;
        commit({
          uid: current.uid,
          status: 'active',
          active: runtime,
          recovery: null,
          recoveryError: null,
          retrying: false,
          recents: document.recents,
          pendingReplacement: null,
          locationState: null,
        });
        return true;
      } catch {
        return false;
      }
    });
    const tracked = confirmation.finally(() => {
      if (replacementConfirmationRef.current === tracked) replacementConfirmationRef.current = null;
    });
    replacementConfirmationRef.current = tracked;
    return tracked;
  }, [commit, enqueue]);

  const retry = useCallback(() => enqueue(async () => {
    const current = stateRef.current;
    if (!current.recovery) return false;
    commit({ ...current, retrying: true });
    return recover(current.recovery, current.recents);
  }), [commit, enqueue, recover]);

  const finish = useCallback(async (current: ActiveTripState, outcome: 'arrived' | 'ended-early', endedAt = Date.now()): Promise<boolean> => {
    const id = activeSessionId(current);
    if (!current.uid || !id) return false;
    try {
      const completed = await completeNavigationSession(current.uid, id, outcome, endedAt);
      if (stateRef.current.uid !== current.uid) return false;
      commit({
        uid: current.uid,
        status: 'idle',
        active: null,
        recovery: null,
        recoveryError: null,
        retrying: false,
        recents: completed.document.recents,
        pendingReplacement: null,
        locationState: null,
      });
      return true;
    } catch {
      return false;
    }
  }, [commit]);

  const end = useCallback(() => enqueue(async () => finish(stateRef.current, 'ended-early')), [enqueue, finish]);

  const advance = useCallback((fix: NavigationFix) => enqueue(async () => {
    const current = stateRef.current;
    const active = current.active;
    if (!current.uid || !active) return null;
    // Storage age is measured on the device clock. GPS timestamps can be a few milliseconds
    // ahead, and must not make a freshly written session look like future/corrupt data on read.
    const now = Date.now();
    const result = advanceNavigation(active.plan, active.cursor, fix, active.evidence, now);
    if (result.arrived) {
      return await finish(current, 'arrived', now) ? result : null;
    }
    const runtime = { ...active, cursor: result.cursor, evidence: result.evidence, updatedAt: result.advanced ? now : active.updatedAt };
    if (result.advanced) {
      try {
        let persisted = false;
        await updateNavigationDocument(current.uid, (stored) => {
          if (stored.active?.sessionId !== active.sessionId) return stored;
          persisted = true;
          const cursor = cursorAtLeast(stored.active.cursor, result.cursor);
          return { ...stored, active: { ...stored.active, cursor, updatedAt: Math.max(stored.active.updatedAt, now) } };
        }, now);
        if (!persisted || stateRef.current.uid !== current.uid) return null;
      } catch {
        return null;
      }
    }
    commit({ ...current, active: runtime, locationState: result.locationState });
    return result;
  }), [commit, enqueue, finish]);

  const resetForAdmin = useCallback(() => enqueue(async () => {
    const current = stateRef.current;
    const active = current.active;
    if (!current.uid || !active) return false;
    const at = Date.now();
    const result = resetNavigation(active.plan, at);
    try {
      const document = await updateNavigationDocument(current.uid, (stored): NavigationDocumentV1 => (
        stored.active?.sessionId === active.sessionId
          ? { ...stored, active: { ...stored.active, cursor: result.cursor, updatedAt: at } }
          : stored
      ), at);
      if (document.active?.sessionId !== active.sessionId || stateRef.current.uid !== current.uid) return false;
      commit({ ...current, active: { ...active, cursor: result.cursor, evidence: null, updatedAt: at }, locationState: 'current' });
      return true;
    } catch {
      return false;
    }
  }), [commit, enqueue]);

  // Never expose one account's previous render while the auth UID is switching.
  const visible = state.uid === normalizedUid ? state : initialState(normalizedUid);
  return {
    ...visible,
    start,
    confirmReplacement,
    cancelReplacement,
    retry,
    advance,
    end,
    resetForAdmin,
  };
}

import { distanceMeters, type NavigationCheckpoint, type NavigationCursor, type NormalizedNavigationPlan } from './enrouteNavigation';
import type { LatLng } from './tripPlanning';

/** An unhurried walking pace (about 2.9 mph). */
const WALK_METERS_PER_SECOND = 1.3;
/** Streets aren't straight lines: the walk is about this much longer than the crow flies. */
const STREET_DETOUR = 1.25;
/** Less spare time than this when arriving at the stop counts as cutting it close. */
const CLOSE_CALL_SECONDS = 60;
/** Close enough to the stop that there's nothing left to hurry for. */
const AT_STOP_METERS = 40;

export type HurryUp = {
  /** The boarding checkpoint this is about, so each one nudges at most once. */
  key: string;
  stopName: string;
  /** Minutes until it leaves (rounded down, never below zero). */
  minutesToDeparture: number;
  /** Minutes the walk takes at an easy pace (rounded up). */
  walkMinutes: number;
};

/** The next boarding still ahead of the rider on foot, or null once they're riding. */
function nextBoarding(plan: NormalizedNavigationPlan, cursor: NavigationCursor): NavigationCheckpoint | null {
  if (cursor.phase !== 'walking' && cursor.phase !== 'transferring') return null;
  return plan.checkpoints.find((checkpoint) => checkpoint.kind === 'board' && checkpoint.ordinal > cursor.checkpointOrdinal) ?? null;
}

/**
 * Whether the rider, walking to their next stop, is cutting it close: at an easy pace they'd
 * reach it with under a minute to spare (or after it leaves). Null when there's time, when
 * they're not on foot, or when the departure time is unknown.
 */
export function hurryUpFor(plan: NormalizedNavigationPlan, cursor: NavigationCursor, at: LatLng, now = Date.now()): HurryUp | null {
  const boarding = nextBoarding(plan, cursor);
  const departsAt = boarding?.time ? Date.parse(boarding.time) : NaN;
  if (!boarding || Number.isNaN(departsAt)) return null;
  const straight = distanceMeters(at, boarding.point);
  if (straight <= AT_STOP_METERS) return null;
  const walkSeconds = (straight * STREET_DETOUR) / WALK_METERS_PER_SECOND;
  const secondsLeft = (departsAt - now) / 1000;
  // Already gone: the trip will be replanned, not hurried.
  if (secondsLeft <= 0 || secondsLeft - walkSeconds >= CLOSE_CALL_SECONDS) return null;
  return {
    key: `${plan.itineraryId}:${boarding.key}`,
    stopName: boarding.label,
    minutesToDeparture: Math.max(0, Math.floor(secondsLeft / 60)),
    walkMinutes: Math.max(1, Math.ceil(walkSeconds / 60)),
  };
}

/** What the nudge says, in the notification and the banner alike. */
export function hurryUpMessage(hurry: HurryUp): { title: string; body: string } {
  const leaves = hurry.minutesToDeparture === 0 ? 'leaves in under a minute' : `leaves in ${hurry.minutesToDeparture} min`;
  return {
    title: 'Pick up the pace',
    body: `Your ride at ${hurry.stopName} ${leaves}, about a ${hurry.walkMinutes} min walk away.`,
  };
}

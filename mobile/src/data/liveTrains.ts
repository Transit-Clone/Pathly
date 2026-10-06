import type { RouteLiveVehicle } from './transitLive';

/** A train whose last GPS fix is older than this is parked or finished, not "live". */
export const STALE_TRAIN_MS = 5 * 60 * 1000;

/** Compact age for a train's freshness badge: `3s`, `1m`, `2h`. */
export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

/**
 * Trains to draw: only the selected GTFS direction (when given), and never stale ones. A train
 * with no timestamp (backend deployed before timestamps existed) is kept, since its age is unknown.
 */
export function visibleTrains(vehicles: readonly RouteLiveVehicle[], directionId: number | undefined, now: number): RouteLiveVehicle[] {
  return vehicles.filter(
    (vehicle) =>
      (directionId === undefined || vehicle.directionId === directionId) &&
      (vehicle.updatedAt == null || now - vehicle.updatedAt <= STALE_TRAIN_MS),
  );
}

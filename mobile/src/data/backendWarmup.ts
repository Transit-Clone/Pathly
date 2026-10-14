import { httpsCallable } from 'firebase/functions';

import { functions } from '../lib/firebase';

/** The Cloud Functions whose cold start the rider would otherwise wait on first. */
type WarmedFunction = 'findNearbyTransit' | 'getRouteGeometry';
const WARMED_FUNCTIONS: readonly WarmedFunction[] = ['findNearbyTransit', 'getRouteGeometry'];

/** How long a first real request waits for its warm-up before going out anyway. */
export const WARMUP_WAIT_CAP_MS = 8_000;

let warmedUid: string | null = null;
// Warm-ups still in flight. An entry is removed once it settles or its wait cap passes, so later
// requests never wait.
const pending = new Map<WarmedFunction, Promise<void>>();

/**
 * Starts the backend's slowest cold starts while the app is still opening (finding the rider,
 * drawing the map), once per signed-in rider per app session. Nothing is shown for it, and a
 * failure is ignored: the real requests work either way, just slower.
 */
export function warmBackend(uid: string): void {
  if (warmedUid === uid) return;
  warmedUid = uid;
  for (const name of WARMED_FUNCTIONS) {
    const warmup: Promise<void> = httpsCallable(functions, name)({ warmup: true }).then(
      () => undefined,
      () => undefined,
    );
    pending.set(name, warmup);
    void warmup.then(() => {
      if (pending.get(name) === warmup) pending.delete(name);
    });
  }
}

/**
 * Resolves once `name`'s warm-up has finished, or after `capMs`. Each function handles one
 * request at a time, so a real request sent while its warm-up is still running would start a
 * second cold instance instead of using the one being prepared.
 */
export function whenWarm(name: WarmedFunction, capMs = WARMUP_WAIT_CAP_MS): Promise<void> {
  const warmup = pending.get(name);
  if (!warmup) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      // A warm-up this slow isn't worth waiting for again.
      if (pending.get(name) === warmup) pending.delete(name);
      resolve();
    }, capMs);
  });
  return Promise.race([warmup, cap]).finally(() => clearTimeout(timer));
}

/** Test isolation only. */
export function resetBackendWarmupForTests(): void {
  warmedUid = null;
  pending.clear();
}

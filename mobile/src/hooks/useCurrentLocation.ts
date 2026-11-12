import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { NAVIGATION_THRESHOLDS, type NavigationFix } from '../data/enrouteNavigation';
import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';
import { useDebug } from '../debug/DebugContext';
import { useNow } from './useNow';

export type Coordinates = { latitude: number; longitude: number };

function navigationFixFromPosition(position: Location.LocationObject): NavigationFix {
  const reportedAccuracy = position.coords.accuracy;
  return {
    point: { lat: position.coords.latitude, lng: position.coords.longitude },
    accuracyMeters: typeof reportedAccuracy === 'number' && Number.isFinite(reportedAccuracy) && reportedAccuracy >= 0 ? reportedAccuracy : null,
    capturedAt: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
    source: 'real',
  };
}

/**
 * expo-location's web permission check relies on `navigator.permissions`, which older Safari and
 * some in-app browsers lack, so the browser prompt would never appear. Asking for a position
 * directly still shows the prompt there; a refusal then surfaces as a position error.
 */
async function requestPermission(): Promise<Location.PermissionStatus> {
  try {
    return (await Location.requestForegroundPermissionsAsync()).status;
  } catch (error) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      return Location.PermissionStatus.GRANTED;
    }
    throw error;
  }
}

/** How long a one-shot fix may take. Indoors, Android can wait for GPS indefinitely, and nothing
 * else (the GPS button, the first fix) may hang on it. */
const CURRENT_FIX_TIMEOUT_MS = 12_000;
/** How long the quick (Wi-Fi/cell) fix may take; it usually lands well under a second. */
const QUICK_FIX_TIMEOUT_MS = 5_000;
/** The cached position is read from memory; a platform call that hangs mustn't hold anything up. */
const LAST_KNOWN_TIMEOUT_MS = 2_000;
/**
 * After this long without an answer to the permission request (no prompt ever shown, a browser
 * that blocks it quietly, an Android request that's dropped), stop showing "Finding your
 * location". The answer is still awaited: a late grant goes on to locate the rider.
 */
const PERMISSION_ANSWER_MS = 6_000;
/** The phone's cached position is good enough to show the rider where they are while a fresh fix comes. */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;

/** `promise`'s value, or null once `timeoutMs` passes without one. */
function within<T>(promise: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    Promise.resolve().then(promise).then(
      (value) => { clearTimeout(timer); resolve(value ?? null); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** A fresh fix at `accuracy`, or null once `timeoutMs` passes without one. */
function currentPositionWithin(timeoutMs: number, accuracy = Location.Accuracy.High): Promise<Location.LocationObject | null> {
  return within(() => Location.getCurrentPositionAsync({ accuracy }), timeoutMs);
}

/** The phone's cached position (no GPS wait), if it has a recent one. */
async function lastKnownPosition(): Promise<Location.LocationObject | null> {
  if (Platform.OS === 'web' || typeof Location.getLastKnownPositionAsync !== 'function') return null;
  try {
    return await within(() => Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }), LAST_KNOWN_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/**
 * Two fixes asked for at once: `quick` is the first of the cached position and a Wi-Fi/cell fix
 * (fast even indoors, but coarse), `precise` is GPS. Neither rejects; each is null if it fails.
 */
type FixRequests = { quick: Promise<Location.LocationObject | null>; precise: Promise<Location.LocationObject | null> };

function requestFixes(): FixRequests {
  const precise = currentPositionWithin(CURRENT_FIX_TIMEOUT_MS).catch(() => null);
  const candidates = [lastKnownPosition(), currentPositionWithin(QUICK_FIX_TIMEOUT_MS, Location.Accuracy.Balanced).catch(() => null)];
  const quick = new Promise<Location.LocationObject | null>((resolve) => {
    let pending = candidates.length;
    for (const candidate of candidates) {
      void candidate.then((position) => {
        pending -= 1;
        if (position) resolve(position);
        else if (pending === 0) resolve(null);
      });
    }
  });
  return { quick, precise };
}

/**
 * Locating started at launch (see {@link prewarmLocation}), before Home mounts: GPS warms up
 * while fonts load and the session is restored. Taken once, and only while fresh.
 */
let prewarmed: { startedAt: number; fixes: Promise<FixRequests | null> } | null = null;
const PREWARM_MAX_AGE_MS = 30_000;

/** Starts locating at launch when location access is already granted. Never prompts. */
export function prewarmLocation() {
  if (prewarmed) return;
  prewarmed = {
    startedAt: Date.now(),
    fixes: within(() => Location.getForegroundPermissionsAsync(), LAST_KNOWN_TIMEOUT_MS)
      .then((permission) => {
        if (permission?.status !== 'granted') return null;
        // Access is settled: later automatic checks needn't ask (see askedThisSession).
        askedThisSession = true;
        return requestFixes();
      })
      .catch(() => null),
  };
}

function takePrewarmedFixes(): Promise<FixRequests | null> | null {
  const taken = prewarmed;
  prewarmed = null;
  return taken && Date.now() - taken.startedAt < PREWARM_MAX_AGE_MS ? taken.fixes : null;
}

/**
 * The permission prompt shows at most once per app session on its own. A grant the OS or browser
 * didn't keep ("Allow once", "Only this time", a browser that forgets) would otherwise re-prompt
 * on every return to the foreground and every trip start/end. After that first ask this only
 * checks; the rider can still ask again from a button (`refresh`) or Settings.
 *
 * On Android the prompt itself sends the app to the background and closing it brings the app
 * back, so asking from the return-to-foreground handler re-prompted in a loop until Android
 * killed the app (seen on a Galaxy phone).
 */
let askedThisSession = false;

/** Resets the once-per-session prompt (tests). */
export function resetLocationPromptForTests() {
  askedThisSession = false;
  prewarmed = null;
}

async function permissionStatus(mayPrompt: boolean): Promise<Location.PermissionStatus> {
  if (mayPrompt || !askedThisSession) {
    askedThisSession = true;
    return requestPermission();
  }
  try {
    return (await Location.getForegroundPermissionsAsync()).status;
  } catch {
    // No way to check without prompting (older browsers): don't ask again unprompted.
    return Location.PermissionStatus.UNDETERMINED;
  }
}

/**
 * The permission answer (a failure counts as no access). `onSlow` runs if it hasn't come within
 * {@link PERMISSION_ANSWER_MS}; it's still awaited after that.
 */
async function answeredPermission(mayPrompt: boolean, onSlow: () => void): Promise<Location.PermissionStatus | null> {
  const timer = setTimeout(onSlow, PERMISSION_ANSWER_MS);
  try {
    return await permissionStatus(mayPrompt);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// High, not Balanced: Android serves Balanced from Wi-Fi and cell towers only, never GPS, so a
// phone that can't place itself that way (Wi-Fi scanning off, or none nearby) never got a fix,
// while Google's own map dot (which uses GPS) found the rider fine.
const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.High,
  timeInterval: 10_000,
  distanceInterval: 25,
};
// During a trip, checkpoints are 45 m apart for walking and each needs two agreeing fixes:
// Balanced fixes (often 100 m+ from Wi-Fi/cell on Android) and a 25 m / 10 s cadence left
// navigation lagging a block or more behind, or stuck on "poor accuracy".
const NAVIGATION_WATCH_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3_000,
  distanceInterval: 5,
};

/**
 * - 'loading': permission hasn't resolved yet, or it's granted and the first fix hasn't landed.
 * - 'located': `location` and `navigationFix` represent a real or admin-mock fix.
 * - 'unavailable': permission was denied or a fresh fix failed. `location` remains useful to
 *   browsing screens, but `navigationFix` is null unless a prior real fix exists.
 */
export type LocationStatus = 'loading' | 'located' | 'unavailable';

/**
 * User location shared by browsing and active navigation.
 *
 * `location` preserves the product's service-area fallback for non-navigation screens.
 * `navigationFix` deliberately never contains that fallback: it carries only timestamped,
 * accuracy-aware GPS evidence or the admin's authoritative mock location. A last real fix is
 * retained when a later refresh fails so maps can show it as stale while navigation rejects it
 * using its timestamp/status.
 */
export function useCurrentLocation(navigating = false) {
  const [realFix, setRealFix] = useState<NavigationFix | null>(null);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const latestFixAtRef = useRef(Number.NEGATIVE_INFINITY);
  const fixRevisionRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const { mockLocation } = useDebug();
  const freshnessNow = useNow(10_000);
  const mocked = mockLocation !== undefined;
  const mockLatitude = mockLocation?.latitude;
  const mockLongitude = mockLocation?.longitude;
  const mockCapturedAt = mockLocation?.capturedAt;
  const mockRideAlong = mockLocation?.rideAlong === true;
  const mockFix = useMemo<NavigationFix | null>(
    () => (mockLatitude !== undefined && mockLongitude !== undefined && mockCapturedAt !== undefined
      ? {
        point: { lat: mockLatitude, lng: mockLongitude },
        accuracyMeters: 0,
        capturedAt: mockCapturedAt,
        source: 'mock',
        ...(mockRideAlong ? { rideAlong: true } : {}),
      }
      : null),
    // Alighting and boarding can be distinct checkpoints at one platform coordinate.
    [mockCapturedAt, mockLatitude, mockLongitude, mockRideAlong],
  );

  // Whether the shown fix is a quick one (cached, or from Wi-Fi/cell) that GPS hasn't confirmed.
  const [provisional, setProvisional] = useState(false);
  const acceptRealFix = useCallback((nextFix: NavigationFix, quick = false) => {
    if (nextFix.capturedAt < latestFixAtRef.current) return false;
    latestFixAtRef.current = nextFix.capturedAt;
    fixRevisionRef.current += 1;
    setRealFix(nextFix);
    setProvisional(quick);
    setStatus('located');
    return true;
  }, []);
  // A quick fix only stands in while there's no fix at all: it never replaces a GPS one.
  const acceptQuickFix = useCallback((position: Location.LocationObject | null) => {
    if (position && fixRevisionRef.current === 0) acceptRealFix(navigationFixFromPosition(position), true);
  }, [acceptRealFix]);

  // `mayPrompt`: the rider asked (a locate button), so showing the permission prompt is expected.
  const refreshRealFix = useCallback(async (mayPrompt = true) => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    const current = () => refreshGenerationRef.current === generation;
    const revisionAtStart = fixRevisionRef.current;
    const giveUp = () => {
      if (current() && fixRevisionRef.current === revisionAtStart) setStatus('unavailable');
    };
    if (revisionAtStart === 0) setStatus('loading');
    const permission = await answeredPermission(mayPrompt, giveUp);
    if (!current()) return;
    if (permission !== 'granted') {
      giveUp();
      return;
    }
    // A slow permission answer may have shown "unavailable"; locating has started now.
    if (fixRevisionRef.current === 0) setStatus('loading');
    const { quick, precise } = requestFixes();
    void quick.then((position) => {
      if (current()) acceptQuickFix(position);
    });
    const position = await precise;
    if (!current()) return;
    if (position) acceptRealFix(navigationFixFromPosition(position));
    else giveUp();
  }, [acceptQuickFix, acceptRealFix]);

  useEffect(() => {
    if (mocked) return undefined;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const revisionAtRequest = fixRevisionRef.current;
      const giveUp = () => {
        if (!cancelled && fixRevisionRef.current === revisionAtRequest) setStatus('unavailable');
      };
      // Started at launch when access was already granted: the permission check is done.
      let fixes = await (takePrewarmedFixes() ?? Promise.resolve(null));
      if (cancelled) return;
      if (!fixes) {
        const permission = await answeredPermission(false, giveUp);
        if (cancelled) return;
        if (permission !== 'granted') {
          giveUp();
          return;
        }
        if (fixRevisionRef.current === 0) setStatus('loading');
        fixes = requestFixes();
      }

      // The quick fix shows the rider right away; GPS and the watch refine it. All start together,
      // so a one-shot that never resolves (GPS indoors) can't hold up the rest.
      void fixes.quick.then((position) => {
        if (!cancelled) acceptQuickFix(position);
      });
      const oneShot = fixes.precise.then((position) => {
        if (cancelled) return;
        if (position) acceptRealFix(navigationFixFromPosition(position));
        else giveUp();
      });

      try {
        const nextSubscription = await Location.watchPositionAsync(navigating ? NAVIGATION_WATCH_OPTIONS : WATCH_OPTIONS, (position) => {
          if (cancelled) return;
          acceptRealFix(navigationFixFromPosition(position));
        });
        if (cancelled) nextSubscription.remove();
        else subscription = nextSubscription;
      } catch {
        // A usable one-shot fix remains valid even when the continuous watcher cannot start.
        await oneShot;
        giveUp();
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [acceptQuickFix, acceptRealFix, mocked, navigating]);

  // Foreground-only navigation can miss movement while the app is suspended. Ask for one fresh
  // position on every background/inactive -> active transition; the existing watch continues.
  useEffect(() => {
    if (mocked) return undefined;
    let previousState: string | null | undefined = AppState.currentState;
    const listener = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && previousState !== 'active';
      previousState = nextState;
      if (returnedToForeground) void refreshRealFix(false);
    });
    return () => listener.remove();
  }, [mocked, refreshRealFix]);

  const navigationFix = mockFix ?? realFix;
  const navigationStale = Boolean(!mockFix && realFix && freshnessNow - realFix.capturedAt > NAVIGATION_THRESHOLDS.maxRealFixAgeMs);
  const location = navigationFix
    ? { latitude: navigationFix.point.lat, longitude: navigationFix.point.lng }
    : SERVICE_AREA_FALLBACK;

  if (mockFix) {
    return {
      location,
      navigationFix: mockFix,
      status: 'located' as LocationStatus,
      refresh: async () => undefined,
      mocked: true,
      navigationStale: false,
      provisional: false,
    };
  }
  return { location, navigationFix, navigationStale, status, refresh: refreshRealFix, mocked: false, provisional };
}

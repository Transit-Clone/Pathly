import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import { isAdminEmail } from './admin';
import { setClockMockTime, type MockTime } from './clock';
import { setRequestLogEnabled } from './requestLog';

export const DEBUG_STORAGE_KEY = 'pathly.debug.v1';

export type MockLocation = { label: string; latitude: number; longitude: number };
export type TimestampedMockLocation = MockLocation & { capturedAt: number };
export type { MockTime };
export { appNow } from './clock';
export type DebugOverlays = { ids: boolean; tapCoords: boolean };
export type DebugState = { mockLocation?: TimestampedMockLocation; mockTime?: MockTime; overlays: DebugOverlays };

const EMPTY_STATE: DebugState = { overlays: { ids: false, tapCoords: false } };

type DebugValue = DebugState & {
  isAdmin: boolean;
  setMockLocation: (location: MockLocation | undefined) => void;
  /** Sets the app's "now" to `at` (epoch ms), or clears it. */
  setMockTime: (at: number | undefined) => void;
  setOverlay: (overlay: keyof DebugOverlays, value: boolean) => void;
};

const noop = () => undefined;
const DebugContext = createContext<DebugValue>({ ...EMPTY_STATE, isAdmin: false, setMockLocation: noop, setMockTime: noop, setOverlay: noop });


function parseState(raw: string | null): DebugState {
  if (!raw) return EMPTY_STATE;
  try {
    const value = JSON.parse(raw) as Partial<DebugState>;
    const location = value.mockLocation;
    const time = value.mockTime;
    return {
      ...(location && typeof location.latitude === 'number' && typeof location.longitude === 'number' && typeof location.label === 'string'
        ? { mockLocation: { ...location, capturedAt: typeof location.capturedAt === 'number' ? location.capturedAt : Date.now() } }
        : {}),
      ...(time && typeof time.at === 'number' && typeof time.setAtRealMs === 'number' ? { mockTime: time } : {}),
      overlays: { ids: value.overlays?.ids === true, tapCoords: value.overlays?.tapCoords === true },
    };
  } catch {
    return EMPTY_STATE;
  }
}

/**
 * Admin-only testing overrides (mock location and time, debug overlays), kept on the device.
 * Stored state is ignored entirely unless the signed-in account is an admin, and signing out
 * clears it, so a rider on the same device never inherits it.
 */
export function DebugProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const [stored, setStored] = useState<DebugState>(EMPTY_STATE);
  const hadUser = useRef(false);

  useEffect(() => {
    setRequestLogEnabled(isAdmin);
    if (!isAdmin) return undefined;
    let cancelled = false;
    AsyncStorage.getItem(DEBUG_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseState(raw);
        setStored(parsed);
        const normalized = JSON.stringify(parsed);
        if (raw !== null && raw !== normalized) AsyncStorage.setItem(DEBUG_STORAGE_KEY, normalized).catch(noop);
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (user) {
      hadUser.current = true;
      return;
    }
    if (!hadUser.current) return;
    hadUser.current = false;
    setStored(EMPTY_STATE);
    AsyncStorage.removeItem(DEBUG_STORAGE_KEY).catch(noop);
  }, [user]);

  const state = isAdmin ? stored : EMPTY_STATE;
  // Non-React code (trip planning) reads the same clock as the screens.
  setClockMockTime(state.mockTime);

  const update = useCallback((change: (current: DebugState) => DebugState) => {
    setStored((current) => {
      const next = change(current);
      AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(next)).catch(noop);
      return next;
    });
  }, []);

  const value = useMemo<DebugValue>(() => ({
    ...state,
    isAdmin,
    setMockLocation: (mockLocation) => update(({ mockLocation: previous, ...rest }) => (mockLocation
      ? {
        ...rest,
        mockLocation: {
          ...mockLocation,
          capturedAt: Math.max(Date.now(), (previous?.capturedAt ?? 0) + 1),
        },
      }
      : rest)),
    setMockTime: (at) => update(({ mockTime: _old, ...rest }) => (at === undefined ? rest : { ...rest, mockTime: { at, setAtRealMs: Date.now() } })),
    setOverlay: (overlay, enabled) => update((current) => ({ ...current, overlays: { ...current.overlays, [overlay]: enabled } })),
  }), [isAdmin, state, update]);

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}

export function useDebug(): DebugValue {
  return useContext(DebugContext);
}

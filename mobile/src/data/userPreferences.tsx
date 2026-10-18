import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import type { TransitMode } from '../components/RouteBadge';

/**
 * A rider's own preferences (Settings -> Notifications, Travel preferences, step-free routes,
 * analytics), saved on this device per account so a shared device keeps riders apart. Display
 * settings (theme, text size, contrast, motion) are the device's and live in AppSettings.
 */
export type UserPreferences = {
  notifications: { enabled: boolean; serviceAlerts: boolean; tripReminders: boolean; disruptions: boolean };
  travel: {
    /** Modes Route Results starts with enabled. */
    modes: TransitMode[];
    /** Off asks Google for trips with less walking. */
    allowWalking: boolean;
    /** Route Results starts sorted by fewer transfers (and asks Google for them). */
    fewerTransfers: boolean;
    /** Trips walking longer than this in total are hidden when others fit; null is no limit. */
    maxWalkMinutes: number | null;
  };
  stepFree: boolean;
  analytics: boolean;
};

export const ALL_TRANSIT_MODES: readonly TransitMode[] = ['subway', 'bus', 'rail', 'ferry'];
export const WALK_LIMIT_OPTIONS: readonly (number | null)[] = [5, 10, 15, 20, 30, null];

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: { enabled: true, serviceAlerts: true, tripReminders: true, disruptions: true },
  travel: { modes: [...ALL_TRANSIT_MODES], allowWalking: true, fewerTransfers: false, maxWalkMinutes: null },
  stepFree: false,
  analytics: false,
};

export function preferencesKey(uid: string) {
  return `pathly.preferences.v1.${uid}`;
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Merges a saved entry over the defaults, keeping only well-formed values. */
export function parsePreferences(text: string | null): UserPreferences {
  const base = DEFAULT_PREFERENCES;
  if (!text) return base;
  let saved: Record<string, any>;
  try {
    saved = JSON.parse(text) as Record<string, any>;
  } catch {
    return base;
  }
  const notifications = { ...base.notifications };
  for (const key of Object.keys(notifications) as (keyof UserPreferences['notifications'])[]) {
    if (isBoolean(saved.notifications?.[key])) notifications[key] = saved.notifications[key];
  }
  const travel = { ...base.travel };
  const modes = Array.isArray(saved.travel?.modes) ? ALL_TRANSIT_MODES.filter((mode) => saved.travel.modes.includes(mode)) : [];
  if (modes.length > 0) travel.modes = modes;
  if (isBoolean(saved.travel?.allowWalking)) travel.allowWalking = saved.travel.allowWalking;
  if (isBoolean(saved.travel?.fewerTransfers)) travel.fewerTransfers = saved.travel.fewerTransfers;
  if (saved.travel?.maxWalkMinutes === null || WALK_LIMIT_OPTIONS.includes(saved.travel?.maxWalkMinutes)) travel.maxWalkMinutes = saved.travel?.maxWalkMinutes ?? null;
  return {
    notifications,
    travel,
    stepFree: isBoolean(saved.stepFree) ? saved.stepFree : base.stepFree,
    analytics: isBoolean(saved.analytics) ? saved.analytics : base.analytics,
  };
}

export type PreferencesPatch = {
  notifications?: Partial<UserPreferences['notifications']>;
  travel?: Partial<UserPreferences['travel']>;
  stepFree?: boolean;
  analytics?: boolean;
};

export function applyPreferencesPatch(current: UserPreferences, patch: PreferencesPatch): UserPreferences {
  return {
    notifications: { ...current.notifications, ...patch.notifications },
    travel: { ...current.travel, ...patch.travel },
    stepFree: patch.stepFree ?? current.stepFree,
    analytics: patch.analytics ?? current.analytics,
  };
}

type PreferencesValue = { preferences: UserPreferences; updatePreferences: (patch: PreferencesPatch) => void };

const PreferencesContext = createContext<PreferencesValue>({ preferences: DEFAULT_PREFERENCES, updatePreferences: () => undefined });

/** Loads the signed-in rider's preferences and saves every change on the device. */
export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [loaded, setLoaded] = useState<{ uid: string | null; preferences: UserPreferences }>({ uid: null, preferences: DEFAULT_PREFERENCES });
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    AsyncStorage.getItem(preferencesKey(uid))
      .then((text) => {
        if (cancelled || !text) return;
        // A change made while loading wins over the saved entry.
        setLoaded((current) => (current.uid === uid ? current : { uid, preferences: parsePreferences(text) }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const preferences = loaded.uid === uid ? loaded.preferences : DEFAULT_PREFERENCES;

  const updatePreferences = useCallback((patch: PreferencesPatch) => {
    const owner = uidRef.current;
    if (!owner) return;
    setLoaded((current) => {
      const next = applyPreferencesPatch(current.uid === owner ? current.preferences : DEFAULT_PREFERENCES, patch);
      AsyncStorage.setItem(preferencesKey(owner), JSON.stringify(next)).catch(() => undefined);
      return { uid: owner, preferences: next };
    });
  }, []);

  const value = useMemo(() => ({ preferences, updatePreferences }), [preferences, updatePreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences() {
  return useContext(PreferencesContext);
}

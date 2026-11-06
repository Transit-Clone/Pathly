import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { DONATION_URL } from './supportPrompt';

/** Where "Give feedback" goes: the team's rider survey. */
export const FEEDBACK_FORM_URL = 'https://forms.gle/x8KJ7RWahqvnqEKe7';

const STORAGE_KEY = 'pathly.nudges.v2';
const DAY_MS = 24 * 60 * 60 * 1000;
/** No ask until Pathly has been opened this many times… */
export const OPENS_BEFORE_ASKING = 5;
/** …over at least this long since its first open: a rider who has used it for a while. */
export const USE_BEFORE_ASKING_MS = 3 * DAY_MS;
/** Never two asks within this long. */
export const MIN_GAP_MS = 7 * DAY_MS;
/** After a swipe or close, the ask rests this long. */
export const QUIET_AFTER_DISMISS_MS = 21 * DAY_MS;
/** After a tip or the survey, it rests longer: the rider already helped. */
export const QUIET_AFTER_ACTION_MS = 90 * DAY_MS;

export type NudgeState = { opens: number; firstOpenAt: number; lastShownAt: number; quietUntil: number };

const EMPTY: NudgeState = { opens: 0, firstOpenAt: 0, lastShownAt: 0, quietUntil: 0 };

/**
 * Whether this app open shows the support popup: only once the rider has used Pathly a while
 * (OPENS_BEFORE_ASKING opens over USE_BEFORE_ASKING_MS), never twice within MIN_GAP_MS, and not
 * while it's resting after its last answer.
 */
export function shouldAskForSupport(state: NudgeState, now: number): boolean {
  if (state.opens < OPENS_BEFORE_ASKING || !state.firstOpenAt || now - state.firstOpenAt < USE_BEFORE_ASKING_MS) return false;
  return now - state.lastShownAt >= MIN_GAP_MS && now >= state.quietUntil;
}

async function readState(): Promise<NudgeState> {
  try {
    const text = await AsyncStorage.getItem(STORAGE_KEY);
    if (text) return { ...EMPTY, ...(JSON.parse(text) as Partial<NudgeState>) };
  } catch {
    // A missing or unreadable record just starts over.
  }
  return EMPTY;
}

async function writeState(state: NudgeState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort only: at worst the ask comes again a little sooner.
  }
}

// Counted once per app launch, however often the home screen mounts.
let countedThisLaunch = false;
/** Unit-test only: start a fresh "launch". */
export function resetNudgeLaunchForTests(): void {
  countedThisLaunch = false;
}

/**
 * The home screen's occasional popup asking the rider to support Pathly or take a quick feedback
 * survey. `paused` holds it back (a trip to resume takes that spot); `enabled` is the rider's
 * Settings switch (Notifications -> Feedback & support popups), which "Don't ask again" turns off.
 */
export function useSupportPopup(paused: boolean, enabled: boolean, now = Date.now) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (paused || countedThisLaunch) return undefined;
    countedThisLaunch = true;
    let cancelled = false;
    void (async () => {
      const saved = await readState();
      const at = now();
      const counted = { ...saved, opens: saved.opens + 1, firstOpenAt: saved.firstOpenAt || at };
      // Only counted as shown when it really is: switched off, it isn't.
      const ask = enabled && shouldAskForSupport(counted, at);
      await writeState(ask ? { ...counted, lastShownAt: at } : counted);
      if (!cancelled && ask) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, now, paused]);

  const rest = useCallback(async (quietMs: number) => {
    setVisible(false);
    const state = await readState();
    await writeState({ ...state, quietUntil: now() + quietMs });
  }, [now]);

  const open = (url: string) => {
    void rest(QUIET_AFTER_ACTION_MS);
    void Linking.openURL(url).catch(() => undefined);
  };

  return {
    visible: visible && enabled && !paused,
    /** Swiped away or closed: asks again some weeks later. */
    dismiss: () => void rest(QUIET_AFTER_DISMISS_MS),
    support: () => open(DONATION_URL),
    feedback: () => open(FEEDBACK_FORM_URL),
    /** Hides it now; the caller turns the Settings switch off so it never comes back. */
    hide: () => setVisible(false),
  };
}

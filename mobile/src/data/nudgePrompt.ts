import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { DONATION_URL } from './supportPrompt';

/** Where "Give feedback" goes: the team's rider survey. */
export const FEEDBACK_FORM_URL = 'https://forms.gle/x8KJ7RWahqvnqEKe7';

export type NudgeKind = 'feedback' | 'donate';

const STORAGE_KEY = 'pathly.nudges.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
/** No asks until Pathly has been opened this many times. */
export const OPENS_BEFORE_ASKING = 3;
/** At most one ask in this long, whichever kind. */
export const MIN_GAP_MS = 4 * DAY_MS;
/** How long each kind stays away after its button is pressed, or after "close". */
const QUIET_AFTER_ACTION_MS: Record<NudgeKind, number> = { feedback: 45 * DAY_MS, donate: 60 * DAY_MS };
const QUIET_AFTER_DISMISS_MS: Record<NudgeKind, number> = { feedback: 10 * DAY_MS, donate: 21 * DAY_MS };
/** An ask left alone goes away on its own after this long. */
export const AUTO_HIDE_MS = 15_000;

export type NudgeState = { opens: number; lastShownAt: number; lastKind: NudgeKind | null; quietUntil: Record<NudgeKind, number> };

const EMPTY: NudgeState = { opens: 0, lastShownAt: 0, lastKind: null, quietUntil: { feedback: 0, donate: 0 } };

/**
 * Which ask (if any) this app open shows: only after a few opens, never two within MIN_GAP_MS,
 * taking turns (feedback first), and skipping a kind that's resting after its last answer.
 */
export function pickNudge(state: NudgeState, now: number): NudgeKind | null {
  if (state.opens < OPENS_BEFORE_ASKING || now - state.lastShownAt < MIN_GAP_MS) return null;
  const order: NudgeKind[] = state.lastKind === 'feedback' ? ['donate', 'feedback'] : ['feedback', 'donate'];
  return order.find((kind) => now >= state.quietUntil[kind]) ?? null;
}

async function readState(): Promise<NudgeState> {
  try {
    const text = await AsyncStorage.getItem(STORAGE_KEY);
    if (text) {
      const saved = JSON.parse(text) as Partial<NudgeState>;
      return { ...EMPTY, ...saved, quietUntil: { ...EMPTY.quietUntil, ...saved.quietUntil } };
    }
  } catch {
    // A missing or unreadable record just starts over.
  }
  return EMPTY;
}

async function writeState(state: NudgeState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort only: at worst an ask comes again a little sooner.
  }
}

// Counted once per app launch, however often the home screen mounts.
let countedThisLaunch = false;
/** Unit-test only: start a fresh "launch". */
export function resetNudgeLaunchForTests(): void {
  countedThisLaunch = false;
}

/**
 * The home screen's occasional small ask, for feedback or a tip, under the search bar. `paused`
 * holds it back (a trip to resume takes that spot); it hides itself after AUTO_HIDE_MS.
 */
export function useNudgePrompt(paused: boolean, now = Date.now) {
  const [kind, setKind] = useState<NudgeKind | null>(null);

  useEffect(() => {
    if (paused || countedThisLaunch) return undefined;
    countedThisLaunch = true;
    let cancelled = false;
    void (async () => {
      const counted = { ...(await readState()) };
      counted.opens += 1;
      const picked = pickNudge(counted, now());
      await writeState(picked ? { ...counted, lastShownAt: now(), lastKind: picked } : counted);
      if (!cancelled) setKind(picked);
    })();
    return () => {
      cancelled = true;
    };
  }, [now, paused]);

  useEffect(() => {
    if (!kind) return undefined;
    const timer = setTimeout(() => setKind(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [kind]);

  const rest = useCallback(async (shown: NudgeKind, quietMs: number) => {
    setKind(null);
    const state = await readState();
    await writeState({ ...state, quietUntil: { ...state.quietUntil, [shown]: now() + quietMs } });
  }, [now]);

  return {
    kind: paused ? null : kind,
    dismiss: () => {
      if (kind) void rest(kind, QUIET_AFTER_DISMISS_MS[kind]);
    },
    act: () => {
      if (!kind) return;
      void rest(kind, QUIET_AFTER_ACTION_MS[kind]);
      void Linking.openURL(kind === 'feedback' ? FEEDBACK_FORM_URL : DONATION_URL).catch(() => undefined);
    },
  };
}

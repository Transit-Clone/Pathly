import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/** Where "Support Pathly" goes (EXPO_PUBLIC_DONATION_URL overrides Pathly's Ko-fi), always set so Settings always offers it. */
export const DONATION_URL: string = process.env.EXPO_PUBLIC_DONATION_URL?.trim() || 'https://ko-fi.com/pathly';

const STORAGE_KEY = 'pathly.supportPrompt.v1';
/** The ask waits until Pathly has actually got the rider somewhere a few times. */
const ARRIVALS_BEFORE_ASKING = 3;
/** After a "Not now" (or a donation), the card stays away this long. */
const QUIET_PERIOD_MS = 60 * 24 * 60 * 60 * 1000;

type SupportPromptState = { arrivals: number; countedTrips: string[]; quietUntil: number };

async function readState(): Promise<SupportPromptState> {
  try {
    const text = await AsyncStorage.getItem(STORAGE_KEY);
    if (text) return { arrivals: 0, countedTrips: [], quietUntil: 0, ...(JSON.parse(text) as Partial<SupportPromptState>) };
  } catch {
    // A missing or unreadable record just starts the count over.
  }
  return { arrivals: 0, countedTrips: [], quietUntil: 0 };
}

async function writeState(state: SupportPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort only: at worst the card is offered again later.
  }
}

/**
 * The one in-trip donation ask: a small card on the arrival screen, only once the rider has
 * arrived a few times, and then not again for two months whichever button they press. Never
 * shown mid-trip, and never at all without a DONATION_URL.
 */
export function useSupportPrompt(sessionId: string, arrived: boolean, now = Date.now) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!DONATION_URL || !arrived) return undefined;
    let cancelled = false;
    void (async () => {
      const state = await readState();
      // Each trip counts once, however often its arrival screen is shown.
      const next = state.countedTrips.includes(sessionId)
        ? state
        : { ...state, arrivals: state.arrivals + 1, countedTrips: [...state.countedTrips, sessionId].slice(-20) };
      if (next !== state) await writeState(next);
      if (!cancelled) setVisible(next.arrivals >= ARRIVALS_BEFORE_ASKING && now() >= next.quietUntil);
    })();
    return () => {
      cancelled = true;
    };
  }, [arrived, now, sessionId]);

  const snooze = async () => {
    setVisible(false);
    await writeState({ ...(await readState()), quietUntil: now() + QUIET_PERIOD_MS });
  };

  return {
    visible,
    dismiss: () => void snooze(),
    donate: () => {
      void snooze();
      if (DONATION_URL) void Linking.openURL(DONATION_URL).catch(() => undefined);
    },
  };
}

export function openDonationPage(): void {
  if (DONATION_URL) void Linking.openURL(DONATION_URL).catch(() => undefined);
}

/** The one-line student disclaimer shown wherever Pathly asks for support. */
export const STUDENT_DISCLAIMER = 'Pathly is a free transit app built by students. Tips help cover live data and server costs.';

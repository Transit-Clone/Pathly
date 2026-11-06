import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { SupportPopup, swipeDismissTarget } from '../src/components/SupportPopup';
import { FEEDBACK_FORM_URL, MIN_GAP_MS, OPENS_BEFORE_ASKING, QUIET_AFTER_DISMISS_MS, resetNudgeLaunchForTests, shouldAskForSupport, USE_BEFORE_ASKING_MS, useSupportPopup, type NudgeState } from '../src/data/nudgePrompt';
import { DONATION_URL } from '../src/data/supportPrompt';
import { itineraryNote, legNotes } from '../src/data/tripLive';
import type { Itinerary, TransitStep } from '../src/data/tripPlanning';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const NOW = Date.parse('2026-10-26T16:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const state = (patch: Partial<NudgeState> = {}): NudgeState => ({ opens: OPENS_BEFORE_ASKING, firstOpenAt: NOW - USE_BEFORE_ASKING_MS, lastShownAt: 0, quietUntil: 0, ...patch });

describe('shouldAskForSupport', () => {
  it('waits until the rider has used Pathly a while: enough opens, over enough days', () => {
    expect(shouldAskForSupport(state({ opens: OPENS_BEFORE_ASKING - 1 }), NOW)).toBe(false);
    expect(shouldAskForSupport(state({ firstOpenAt: NOW - USE_BEFORE_ASKING_MS + 1 }), NOW)).toBe(false);
    expect(shouldAskForSupport(state(), NOW)).toBe(true);
  });

  it('never asks twice within the gap, nor while resting after an answer', () => {
    expect(shouldAskForSupport(state({ lastShownAt: NOW - MIN_GAP_MS + 1 }), NOW)).toBe(false);
    expect(shouldAskForSupport(state({ lastShownAt: NOW - MIN_GAP_MS }), NOW)).toBe(true);
    expect(shouldAskForSupport(state({ quietUntil: NOW + 1 }), NOW)).toBe(false);
  });
});

describe('swipeDismissTarget', () => {
  it('throws the popup away in whichever direction it was dragged, any direction', () => {
    expect(swipeDismissTarget(120, 0)!.x).toBeGreaterThan(0);
    expect(swipeDismissTarget(-120, 0)!.x).toBeLessThan(0);
    expect(swipeDismissTarget(0, -120)!.y).toBeLessThan(0);
    expect(swipeDismissTarget(0, 120)!.y).toBeGreaterThan(0);
    const diagonal = swipeDismissTarget(-60, 60)!;
    expect(diagonal.x).toBeLessThan(0);
    expect(diagonal.y).toBeGreaterThan(0);
    // A quick flick counts even when short.
    expect(swipeDismissTarget(20, 0, 1.2, 0)).not.toBeNull();
  });

  it('springs back from a small drag', () => {
    expect(swipeDismissTarget(20, -15)).toBeNull();
  });
});

describe('SupportPopup', () => {
  it('offers support or a quick survey, with close and "Don’t ask again"', () => {
    const handlers = { onDismiss: jest.fn(), onFeedback: jest.fn(), onNeverAsk: jest.fn(), onSupport: jest.fn() };
    const screen = render(<AppSettingsProvider><SupportPopup {...handlers} /></AppSettingsProvider>);
    expect(screen.getByText('Enjoying Pathly?')).toBeTruthy();
    // Draggable: it carries the swipe handlers.
    expect(screen.getByTestId('support-popup').props.onResponderMove).toEqual(expect.any(Function));
    fireEvent.press(screen.getByTestId('support-popup-support'));
    fireEvent.press(screen.getByTestId('support-popup-feedback'));
    fireEvent.press(screen.getByTestId('support-popup-close'));
    fireEvent.press(screen.getByTestId('support-popup-never'));
    expect(handlers.onSupport).toHaveBeenCalledTimes(1);
    expect(handlers.onFeedback).toHaveBeenCalledTimes(1);
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
    expect(handlers.onNeverAsk).toHaveBeenCalledTimes(1);
  });
});

describe('useSupportPopup', () => {
  const KEY = 'pathly.nudges.v2';
  beforeEach(async () => {
    resetNudgeLaunchForTests();
    await AsyncStorage.clear();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const seasoned = () => AsyncStorage.setItem(KEY, JSON.stringify({ opens: OPENS_BEFORE_ASKING, firstOpenAt: NOW - 10 * DAY, lastShownAt: 0, quietUntil: 0 }));

  it('stays away on a new rider’s first opens, counting each launch once', async () => {
    const { result } = renderHook(() => useSupportPopup(false, true, () => NOW));
    await act(async () => {});
    expect(result.current.visible).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toMatchObject({ opens: 1, firstOpenAt: NOW });
  });

  it('shows once the rider has used it a while, and a swipe rests it for weeks', async () => {
    await seasoned();
    const { result } = renderHook(() => useSupportPopup(false, true, () => NOW));
    await act(async () => {});
    expect(result.current.visible).toBe(true);
    await act(async () => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!).quietUntil).toBe(NOW + QUIET_AFTER_DISMISS_MS);
  });

  it('opens the donation page or the survey', async () => {
    await seasoned();
    const { result } = renderHook(() => useSupportPopup(false, true, () => NOW));
    await act(async () => {});
    await act(async () => result.current.support());
    expect(Linking.openURL).toHaveBeenCalledWith(DONATION_URL);
    expect(result.current.visible).toBe(false);
    result.current.feedback();
    expect(Linking.openURL).toHaveBeenCalledWith(FEEDBACK_FORM_URL);
    await act(async () => {});
  });

  it('never shows with the Settings switch off ("Don’t ask again")', async () => {
    await seasoned();
    const { result } = renderHook(() => useSupportPopup(false, false, () => NOW));
    await act(async () => {});
    expect(result.current.visible).toBe(false);
    // Not counted as shown, so turning it back on can ask.
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!).lastShownAt).toBe(0);
  });
});

const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const leg = (patch: Partial<TransitStep> = {}): TransitStep => ({
  kind: 'transit',
  mode: 'bus',
  agency: { name: 'Suffolk County Transit' },
  line: { name: '62', shortName: '62' },
  from: { name: 'A', location: { lat: 0, lng: 0 }, time: at(0) },
  to: { name: 'B', location: { lat: 0, lng: 0 }, time: at(20) },
  stopCount: 5,
  durationSeconds: 1200,
  path: [],
  ...patch,
});
const trip = (steps: TransitStep[]): Itinerary => ({ id: 't', departureTime: at(0), arrivalTime: at(40), durationSeconds: 2400, transfers: steps.length - 1, steps });

describe('live trip notes', () => {
  it('reads live times as on time, late, or early', () => {
    expect(legNotes(leg({ live: { status: 'tracked', departs: at(0), delaySeconds: 20 } }))).toEqual([{ kind: 'live', text: 'Live · on time', tone: 'live' }]);
    expect(legNotes(leg({ live: { status: 'tracked', departs: at(4), delaySeconds: 240 } }))[0]).toMatchObject({ kind: 'late', tone: 'warning' });
    expect(legNotes(leg({ live: { status: 'tracked', departs: at(4), delaySeconds: 240 } }))[0]!.text).toMatch(/^Live · 4 min late · leaves /);
    expect(legNotes(leg({ live: { status: 'tracked', delaySeconds: -120 } }))[0]).toMatchObject({ kind: 'live', text: 'Live · 2 min early' });
  });

  it('flags a cancelled trip and a tight or missed connection', () => {
    expect(legNotes(leg({ live: { status: 'cancelled' } }))).toEqual([{ kind: 'cancelled', text: 'Cancelled', tone: 'danger' }]);
    expect(legNotes(leg({ connection: { status: 'tight', spareSeconds: 70 } }))).toEqual([{ kind: 'tight', text: 'Tight connection · 1 min to spare', tone: 'warning' }]);
    expect(legNotes(leg({ connection: { status: 'missed', spareSeconds: -60 } }))[0]).toMatchObject({ kind: 'missed', tone: 'danger' });
  });

  it("gives the results card the trip's worst problem, naming the line", () => {
    const first = leg({ live: { status: 'tracked', delaySeconds: 0 } });
    const second = leg({ line: { name: 'S92', shortName: 'S92' }, connection: { status: 'missed', spareSeconds: -60 } });
    expect(itineraryNote(trip([first, second]))).toMatchObject({ text: 'Likely to miss the S92', tone: 'danger' });
    expect(itineraryNote(trip([first]))).toMatchObject({ text: '62 on time', tone: 'live' });
    // A later leg's live time alone isn't worth the card's space.
    expect(itineraryNote(trip([leg(), leg({ live: { status: 'tracked', delaySeconds: 0 } })]))).toBeNull();
  });
});

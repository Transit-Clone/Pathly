import { fireEvent, render } from '@testing-library/react-native';

import { NudgeBanner } from '../src/components/NudgeBanner';
import { MIN_GAP_MS, OPENS_BEFORE_ASKING, pickNudge, type NudgeState } from '../src/data/nudgePrompt';
import { itineraryNote, legNotes } from '../src/data/tripLive';
import type { Itinerary, TransitStep } from '../src/data/tripPlanning';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const NOW = Date.parse('2026-10-26T16:00:00Z');
const state = (patch: Partial<NudgeState> = {}): NudgeState => ({ opens: OPENS_BEFORE_ASKING, lastShownAt: 0, lastKind: null, quietUntil: { feedback: 0, donate: 0 }, ...patch });

describe('pickNudge', () => {
  it('waits for a few opens, then asks for feedback first', () => {
    expect(pickNudge(state({ opens: OPENS_BEFORE_ASKING - 1 }), NOW)).toBeNull();
    expect(pickNudge(state(), NOW)).toBe('feedback');
  });

  it('never asks twice within the gap, and takes turns after it', () => {
    expect(pickNudge(state({ lastShownAt: NOW - MIN_GAP_MS + 1, lastKind: 'feedback' }), NOW)).toBeNull();
    expect(pickNudge(state({ lastShownAt: NOW - MIN_GAP_MS, lastKind: 'feedback' }), NOW)).toBe('donate');
    expect(pickNudge(state({ lastShownAt: NOW - MIN_GAP_MS, lastKind: 'donate' }), NOW)).toBe('feedback');
  });

  it('skips a kind that is resting after its last answer', () => {
    expect(pickNudge(state({ quietUntil: { feedback: NOW + 1, donate: 0 } }), NOW)).toBe('donate');
    expect(pickNudge(state({ quietUntil: { feedback: NOW + 1, donate: NOW + 1 } }), NOW)).toBeNull();
  });
});

describe('NudgeBanner', () => {
  it('is one small line with its action and a close button', () => {
    const onAct = jest.fn();
    const onDismiss = jest.fn();
    const screen = render(<AppSettingsProvider><NudgeBanner kind="feedback" onAct={onAct} onDismiss={onDismiss} /></AppSettingsProvider>);
    expect(screen.getByText('How is Pathly working for you?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('nudge-feedback-act'));
    fireEvent.press(screen.getByTestId('nudge-feedback-close'));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
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

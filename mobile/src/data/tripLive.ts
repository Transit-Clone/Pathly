import { formatTripClock, lineBadge, type Itinerary, type TransitStep } from './tripPlanning';

/**
 * What the backend's live check (firebase/functions/src/tripLive.ts) found about a leg, as short
 * notes for the trip screens: live times, a cancelled trip or skipped stop, and a connection into
 * the leg that's tight or already missed.
 */
export type TripLegNoteKind = 'live' | 'late' | 'cancelled' | 'skips-stop' | 'missed' | 'tight';
export type TripLegNote = { kind: TripLegNoteKind; text: string; tone: 'live' | 'warning' | 'danger' };

/** Within this of the plan, a live leg reads as on time. */
const ON_TIME_SECONDS = 60;
/** This late or more is worth a warning, not just a live note. */
const LATE_WARNING_SECONDS = 3 * 60;

const minutesText = (seconds: number) => `${Math.max(1, Math.round(Math.abs(seconds) / 60))} min`;

export function legNotes(step: TransitStep): TripLegNote[] {
  const notes: TripLegNote[] = [];
  const live = step.live;
  if (live?.status === 'cancelled') {
    notes.push({ kind: 'cancelled', text: 'Cancelled', tone: 'danger' });
  } else if (live?.status === 'skips-stop') {
    notes.push({ kind: 'skips-stop', text: 'Skipping your stop', tone: 'danger' });
  } else if (live?.status === 'tracked') {
    const delay = live.delaySeconds ?? 0;
    const leaves = live.departs ? ` · leaves ${formatTripClock(live.departs)}` : '';
    if (Math.abs(delay) < ON_TIME_SECONDS) notes.push({ kind: 'live', text: 'Live · on time', tone: 'live' });
    else notes.push({ kind: delay > 0 ? 'late' : 'live', text: `Live · ${minutesText(delay)} ${delay > 0 ? 'late' : 'early'}${leaves}`, tone: delay >= LATE_WARNING_SECONDS ? 'warning' : 'live' });
  }
  if (step.connection?.status === 'missed') {
    notes.push({ kind: 'missed', text: 'Likely to miss this connection', tone: 'danger' });
  } else if (step.connection?.status === 'tight') {
    const spare = Math.round(step.connection.spareSeconds / 60);
    notes.push({ kind: 'tight', text: spare >= 1 ? `Tight connection · ${spare} min to spare` : 'Tight connection', tone: 'warning' });
  }
  return notes;
}

const TONE_RANK = { danger: 0, warning: 1, live: 2 } as const;

/**
 * The trip's most serious note for its results card, naming the line: a problem anywhere, else
 * the first leg's live times. Null when there's nothing live to say.
 */
export function itineraryNote(itinerary: Itinerary): TripLegNote | null {
  const legs = itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');
  const found = legs.flatMap((step, index) => legNotes(step).map((note) => ({ note, step, index })));
  const [worst] = found.sort((a, b) => TONE_RANK[a.note.tone] - TONE_RANK[b.note.tone] || a.index - b.index);
  if (!worst || (worst.note.tone === 'live' && worst.index > 0)) return null;
  const line = lineBadge(worst.step);
  const { note, step } = worst;
  const delay = step.live?.delaySeconds ?? 0;
  const text = {
    cancelled: `${line} is cancelled`,
    'skips-stop': `${line} is skipping your stop`,
    missed: `Likely to miss the ${line}`,
    tight: `Tight connection to the ${line}`,
    late: `${line} running ${minutesText(delay)} late`,
    live: Math.abs(delay) < ON_TIME_SECONDS ? `${line} on time` : `${line} ${minutesText(delay)} early`,
  }[note.kind];
  return { ...note, text };
}

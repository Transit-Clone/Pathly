import { httpsCallable } from 'firebase/functions';

import type { SearchPlace } from '../src/data/placesSearch';
import {
  CURRENT_LOCATION_LABEL,
  fareLabel,
  lineBadge,
  transitSteps,
  filterItinerariesByMode,
  formatTripClock,
  nextOccurrence,
  orderItineraries,
  planTrip,
  type Itinerary,
  type PlanTripOptions,
} from '../src/data/tripPlanning';
import realItineraries from './fixtures/itineraries-sbu-penn.json';

const fixture = realItineraries as unknown as Itinerary[];
const transitBadges = (itinerary: Itinerary) => transitSteps(itinerary).map(lineBadge);
const planTripMock = () => (httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock;
const PENN: SearchPlace = { id: 'ChIJhRwB-yFawokR5Phil-QQ3zM', title: 'Penn Station', subtitle: 'New York, NY', location: { latitude: 40.7506, longitude: -73.9935 } };
const HERE = { latitude: 40.9126, longitude: -73.1234 };
const options = (overrides: Partial<PlanTripOptions> = {}): PlanTripOptions => ({
  endpoints: { origin: CURRENT_LOCATION_LABEL, destination: 'Penn Station', destinationPlace: PENN },
  location: HERE,
  time: { mode: 'now' },
  preference: 'fastest',
  modes: ['subway', 'bus', 'rail'],
  now: new Date('2026-10-14T12:30:00Z'),
  ...overrides,
});

beforeEach(() => planTripMock().mockClear());

describe('nextOccurrence', () => {
  it('picks today when the time is still ahead in New York, else tomorrow', () => {
    // 9:00 AM EDT
    const morning = new Date('2026-10-14T13:00:00Z');
    expect(nextOccurrence(10 * 60 + 30, morning)).toEqual({ at: '2026-10-14T14:30:00.000Z', tomorrow: false });
    // 11:00 PM EDT: 7:00 AM has passed, so tomorrow.
    const night = new Date('2026-10-15T03:00:00Z');
    expect(nextOccurrence(7 * 60, night)).toEqual({ at: '2026-10-15T11:00:00.000Z', tomorrow: true });
  });

  // Device-zone independence holds by construction (only UTC methods and Intl with an explicit
  // zone); Node fixes TZ at startup, so it can't be switched inside a test.
  it('follows New York across the DST change', () => {
    // Saturday Oct 31 11 PM EDT → Sunday Nov 1 is EST (UTC-5).
    expect(nextOccurrence(8 * 60, new Date('2026-11-01T03:00:00Z'))).toEqual({ at: '2026-11-01T13:00:00.000Z', tomorrow: true });
    expect(formatTripClock('2026-10-14T12:52:56.000Z')).toBe('8:52 AM');
  });
});

describe('planTrip', () => {
  it('plans from the rider and routes to the Google place', async () => {
    const result = await planTrip(options());
    expect(result).toEqual(expect.objectContaining({ ok: true, itineraries: fixture }));
    expect(planTripMock()).toHaveBeenCalledWith({
      origin: { label: CURRENT_LOCATION_LABEL, lat: HERE.latitude, lng: HERE.longitude },
      destination: { label: 'Penn Station', placeId: PENN.id, lat: 40.7506, lng: -73.9935 },
      time: { mode: 'now' },
      preference: 'fastest',
      modes: ['subway', 'bus', 'rail'],
    });
  });

  it('sends the next occurrence for Depart at and asks Google only for fewer transfers', async () => {
    await planTrip(options({ time: { mode: 'depart', minutes: 7 * 60 }, preference: 'cheapest', now: new Date('2026-10-15T03:00:00Z') }));
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'depart', at: '2026-10-15T11:00:00.000Z' }, preference: 'fastest' }));
    await planTrip(options({ preference: 'transfers' }));
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ preference: 'transfers' }));
  });

  it('needs a real origin and a routable destination before asking', async () => {
    expect(await planTrip(options({ location: null }))).toEqual({ ok: false, problem: 'no-origin', field: 'origin' });
    const nameOnly: SearchPlace = { id: 'name:Penn Station', title: 'Penn Station', subtitle: '' };
    expect(await planTrip(options({ endpoints: { origin: CURRENT_LOCATION_LABEL, destination: 'Penn Station', destinationPlace: nameOnly } }))).toEqual({ ok: false, problem: 'needs-place', field: 'destination' });
    const zeroed: SearchPlace = { id: 'name:Home', title: 'Home', subtitle: '', location: { latitude: 0, longitude: 0 } };
    expect(await planTrip(options({ endpoints: { origin: 'Home', originPlace: zeroed, destination: 'Penn Station', destinationPlace: PENN } }))).toEqual({ ok: false, problem: 'needs-place', field: 'origin' });
    expect(planTripMock()).not.toHaveBeenCalled();
  });

  it('maps backend failures to rider-facing problems', async () => {
    planTripMock().mockRejectedValueOnce(Object.assign(new Error('out'), { details: { reason: 'out-of-area' } }));
    expect(await planTrip(options())).toEqual({ ok: false, problem: 'out-of-area' });
    planTripMock().mockRejectedValueOnce(new Error('down'));
    expect(await planTrip(options({ refresh: true }))).toEqual({ ok: false, problem: 'unavailable' });
  });

  it('serves a repeat from the short cache, while refresh plans again', async () => {
    await planTrip(options());
    await planTrip(options({ now: new Date('2026-10-14T12:30:30Z') }));
    expect(planTripMock()).toHaveBeenCalledTimes(1);
    await planTrip(options({ refresh: true }));
    expect(planTripMock()).toHaveBeenCalledTimes(2);
  });
});

describe('ordering and filtering', () => {
  const [lirr, busLirr] = fixture as [Itinerary, Itinerary];
  const priced = (itinerary: Itinerary, cents?: number): Itinerary => ({ ...itinerary, ...(cents === undefined ? { fare: undefined } : { fare: { text: `$${(cents / 100).toFixed(2)}`, cents, currency: 'USD', estimated: true } }) });

  it('orders by arrival, transfers, or fare (unknown fares last)', () => {
    expect(orderItineraries([busLirr, lirr], 'fastest').map((i) => i.id)).toEqual([lirr.id, busLirr.id]);
    const direct = { ...busLirr, id: 'direct', transfers: 0 };
    expect(orderItineraries([lirr, direct], 'transfers').map((i) => i.id)).toEqual(['direct', lirr.id]);
    const ordered = orderItineraries([priced(lirr), priced(busLirr, 2925), priced({ ...lirr, id: 'cheap' }, 1700)], 'cheapest');
    expect(ordered.map((i) => i.id)).toEqual(['cheap', busLirr.id, lirr.id]);
  });

  it('hides an itinerary that uses an excluded mode', () => {
    expect(filterItinerariesByMode(fixture, ['subway', 'bus']).map((i) => i.id)).toEqual([]);
    expect(filterItinerariesByMode(fixture, ['subway', 'rail']).map((i) => i.id)).toEqual([lirr.id]);
    const ferry: Itinerary = { ...lirr, id: 'ferry', steps: lirr.steps.map((step) => (step.kind === 'transit' ? { ...step, mode: 'other' as const } : step)) };
    expect(filterItinerariesByMode([ferry], ['bus']).map((i) => i.id)).toEqual(['ferry']);
  });

  it('badges LIRR branches by code and subway lines without "Line"', () => {
    const [lirr, busLirr] = fixture as [Itinerary, Itinerary];
    expect(transitBadges(lirr)).toEqual(['PJ', 'RK']);
    expect(transitBadges(busLirr)).toEqual(['51', 'RK']);
    const subway = { ...transitSteps(lirr)[0]!, agency: { name: 'MTA New York City Transit' }, line: { name: 'N Line', shortName: 'N Line' }, mode: 'subway' as const };
    expect(lineBadge(subway)).toBe('N');
  });

  it('labels known and unknown fares', () => {
    expect(fareLabel(undefined)).toBe('Fare N/A');
    expect(fareLabel({ text: '$17.25', cents: 1725, currency: 'USD', estimated: true })).toBe('$17.25');
    expect(fareLabel({ text: '$3.00', cents: 300, currency: 'USD', estimated: false })).toBe('$3.00');
  });
});

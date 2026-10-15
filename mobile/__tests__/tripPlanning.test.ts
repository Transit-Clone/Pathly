import { httpsCallable } from 'firebase/functions';

import type { SearchPlace } from '../src/data/placesSearch';
import { createTripSelectionIdentity, sameTripSelection } from '../src/data/enrouteNavigation';
import { retimeItinerary } from '../src/data/tripDepartures';
import {
  CURRENT_LOCATION_LABEL,
  createResumePlanRequest,
  fareLabel,
  formatDurationMinutes,
  lineBadge,
  transitSteps,
  filterItinerariesByMode,
  formatTripClock,
  nextOccurrence,
  orderItineraries,
  planTrip,
  planTripForResume,
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

describe('formatDurationMinutes', () => {
  it('keeps short trips in minutes and splits long trips into hours and minutes', () => {
    expect(formatDurationMinutes(42)).toEqual({ visible: '42 min', accessibility: '42 minutes' });
    expect(formatDurationMinutes(146)).toEqual({ visible: '2hr 26m', accessibility: '2 hours 26 minutes' });
  });

  it('omits zero-minute tails and uses singular accessible units', () => {
    expect(formatDurationMinutes(60)).toEqual({ visible: '1hr', accessibility: '1 hour' });
    expect(formatDurationMinutes(61)).toEqual({ visible: '1hr 1m', accessibility: '1 hour 1 minute' });
  });
});

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
    if (result.ok) expect(result.resumeRequest.time).toEqual({ mode: 'depart', at: '2026-10-14T12:30:00.000Z' });
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

  it('uses real save time for coordinate retention even when the planning clock is mocked', async () => {
    const realSaveTime = Date.parse('2026-10-15T12:00:00.000Z');
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(realSaveTime);
    const result = await planTrip(options({ now: new Date('2025-01-01T12:00:00.000Z') }));
    dateNow.mockRestore();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resumeRequest.origin).toEqual(expect.objectContaining({ kind: 'coordinate', savedAt: realSaveTime }));
      expect(result.resumeRequest.time).toEqual({ mode: 'depart', at: '2025-01-01T12:00:00.000Z' });
    }
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

describe('resume planning', () => {
  it('captures now as an absolute departure and sends that same instant after relaunch', async () => {
    const request = createResumePlanRequest(options(), Date.parse('2026-10-14T12:30:00Z'));
    expect(request).toEqual({
      origin: { kind: 'coordinate', label: CURRENT_LOCATION_LABEL, point: { lat: HERE.latitude, lng: HERE.longitude }, savedAt: Date.parse('2026-10-14T12:30:00Z') },
      destination: { kind: 'place', label: 'Penn Station', placeId: PENN.id },
      time: { mode: 'depart', at: '2026-10-14T12:30:00.000Z' },
      preference: 'fastest',
      modes: ['subway', 'bus', 'rail'],
    });
    const selection = createTripSelectionIdentity(fixture[0]!);
    expect(await planTripForResume(request!, selection)).toEqual(expect.objectContaining({ ok: true, itinerary: fixture[0] }));
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'depart', at: '2026-10-14T12:30:00.000Z' } }));
  });

  it('restores the exact client-retimed departure even though its itinerary id is unchanged', async () => {
    const base = structuredClone(fixture[0]!);
    const firstTransit = base.steps.find((step) => step.kind === 'transit')!;
    const laterDeparts = new Date(Date.parse(firstTransit.from.time) + 15 * 60_000).toISOString();
    const laterArrives = new Date(Date.parse(firstTransit.to.time) + 15 * 60_000).toISOString();
    firstTransit.departures = [
      { departs: firstTransit.from.time, arrives: firstTransit.to.time },
      { departs: laterDeparts, arrives: laterArrives },
    ];
    const chosen = retimeItinerary(base, new Map([[0, laterDeparts]]), Date.parse(base.departureTime) - 60_000);
    expect(chosen.id).toBe(base.id);
    expect(chosen.departureTime).not.toBe(base.departureTime);
    planTripMock().mockResolvedValueOnce({ data: { itineraries: [base] } });
    const request = createResumePlanRequest(options())!;

    const result = await planTripForResume(request, createTripSelectionIdentity(chosen));
    expect(result.ok).toBe(true);
    if (result.ok) expect(sameTripSelection(createTripSelectionIdentity(result.itinerary), createTripSelectionIdentity(chosen))).toBe(true);
  });

  it('restores the same departure when optional timetable enrichment changes', async () => {
    const enriched = structuredClone(fixture[0]!);
    const stripped = structuredClone(enriched);
    for (const step of stripped.steps) {
      if (step.kind !== 'transit') continue;
      delete step.tripId;
      delete step.stops;
      delete step.departures;
    }
    const firstWalk = stripped.steps.find((step) => step.kind === 'walk');
    if (firstWalk?.kind === 'walk') {
      firstWalk.durationSeconds += 1;
      firstWalk.distanceMeters += 1;
    }
    const request = createResumePlanRequest(options())!;

    planTripMock().mockResolvedValueOnce({ data: { itineraries: [stripped] } });
    const withoutFreshEnrichment = await planTripForResume(request, createTripSelectionIdentity(enriched));
    expect(withoutFreshEnrichment.ok).toBe(true);

    planTripMock().mockResolvedValueOnce({ data: { itineraries: [enriched] } });
    const withFreshEnrichment = await planTripForResume(request, createTripSelectionIdentity(stripped));
    expect(withFreshEnrichment.ok).toBe(true);
  });

  it('restores an exact active trip written with the version-1 selection format', async () => {
    const current = createTripSelectionIdentity(fixture[0]!);
    const legacySelection = {
      version: 1 as const,
      itineraryId: current.itineraryId,
      departureTime: current.legacy!.departureTime,
      arrivalTime: current.legacy!.arrivalTime,
      fingerprint: current.legacy!.fingerprint,
    };
    planTripMock().mockResolvedValueOnce({ data: { itineraries: fixture } });
    expect((await planTripForResume(createResumePlanRequest(options())!, legacySelection)).ok).toBe(true);
  });

  it('returns recovery for a failed request, missing candidate, or merely similar itinerary', async () => {
    const request = createResumePlanRequest(options())!;
    planTripMock().mockRejectedValueOnce(new Error('offline'));
    expect(await planTripForResume(request, createTripSelectionIdentity(fixture[0]!))).toEqual({ ok: false, problem: 'unavailable' });

    planTripMock().mockResolvedValueOnce({ data: { itineraries: fixture } });
    expect(await planTripForResume(request, { ...createTripSelectionIdentity(fixture[0]!), itineraryId: 'missing-id' })).toEqual({ ok: false, problem: 'no-exact-match' });

    const similar = structuredClone(fixture[0]!);
    const finalTransit = [...similar.steps].reverse().find((step) => step.kind === 'transit');
    if (!finalTransit || finalTransit.kind !== 'transit') throw new Error('Expected transit fixture');
    finalTransit.to.time = new Date(Date.parse(finalTransit.to.time) + 60_000).toISOString();
    similar.arrivalTime = new Date(Date.parse(similar.arrivalTime) + 60_000).toISOString();
    planTripMock().mockResolvedValueOnce({ data: { itineraries: fixture } });
    expect(await planTripForResume(request, createTripSelectionIdentity(similar))).toEqual({ ok: false, problem: 'no-exact-match' });
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

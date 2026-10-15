import { savedPlaceIcon } from '../src/components/SavedPlacesStrip';
import { stopRevealZoom, zoomForRegion } from '../src/data/stopDeclutter';
import { viaRevealZooms, type TripMapStop } from '../src/data/tripMap';
import { legDepartureOptions, quickDepartureOptions, retimeItinerary } from '../src/data/tripDepartures';
import type { Itinerary, TransitStep, WalkStep } from '../src/data/tripPlanning';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 15, 13, 0) + minutes * 60_000).toISOString();
const point = { lat: 40.7, lng: -73.9 };
const walk = (minutes: number): WalkStep => ({ kind: 'walk', durationSeconds: minutes * 60, distanceMeters: minutes * 80, toName: 'Stop', path: [] });
const leg = (departs: number, arrives: number, departures: [number, number][]): TransitStep => ({
  kind: 'transit',
  mode: 'bus',
  agency: { name: 'MTA Bus' },
  line: { name: 'M15' },
  from: { name: 'A', location: point, time: at(departs) },
  to: { name: 'B', location: point, time: at(arrives) },
  stopCount: 3,
  durationSeconds: (arrives - departs) * 60,
  path: [],
  stops: [{ name: 'Mid', location: point, time: at((departs + arrives) / 2) }],
  departures: departures.map(([d, a]) => ({ departs: at(d), arrives: at(a) })),
});

// Walk 5, ride 10→20, transfer at the same stop, ride 25→40, walk 3: leave at 5, arrive at 43.
const trip: Itinerary = {
  id: 'trip',
  departureTime: at(5),
  arrivalTime: at(43),
  durationSeconds: 38 * 60,
  transfers: 1,
  steps: [
    walk(5),
    leg(10, 20, [[10, 20], [20, 30], [30, 40]]),
    leg(25, 40, [[25, 40], [35, 50], [45, 60]]),
    walk(3),
  ],
};
const now = Date.parse(at(0));
const transit = (itinerary: Itinerary) => itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');

describe('picking a departure for a planned trip', () => {
  it('leaves the trip as planned with nothing picked', () => {
    expect(retimeItinerary(trip, new Map(), now)).toBe(trip);
  });

  it('re-times the picked leg and moves a now-missed connection to the next one it can make', () => {
    const retimed = retimeItinerary(trip, new Map([[0, at(20)]]), now);
    const [first, second] = transit(retimed);
    expect(first!.from.time).toBe(at(20));
    expect(first!.to.time).toBe(at(30));
    // The stop in between moves with its leg.
    expect(first!.stops![0]!.time).toBe(at(25));
    // Arriving at 30, the 25 is gone: the 35 is the first one to make.
    expect(second!.from.time).toBe(at(35));
    expect(retimed.departureTime).toBe(at(15));
    expect(retimed.arrivalTime).toBe(at(53));
    expect(retimed.durationSeconds).toBe(38 * 60);
  });

  it('marks which departures are taken and which can still be made', () => {
    const options = legDepartureOptions(trip, new Map([[0, at(20)]]), now);
    expect(options[0]!.map((option) => option.selected)).toEqual([false, true, false]);
    expect(options[1]!.map((option) => option.reachable)).toEqual([false, true, true]);
    expect(options[1]!.find((option) => option.selected)!.departs).toBe(at(35));
  });

  it('shows the taken departure and the next ones it can make in the box', () => {
    const options = legDepartureOptions(trip, new Map([[0, at(20)]]), now);
    expect(quickDepartureOptions(options[1]!, 3).map((option) => option.departs)).toEqual([at(35), at(45)]);
    // A departure leaving before the rider can walk to the stop can't be picked.
    const soon = legDepartureOptions(trip, new Map(), Date.parse(at(8)));
    expect(soon[0]!.map((option) => option.reachable)).toEqual([false, true, true]);
  });
});

describe('stop dots from far away', () => {
  const line = (spacingDegrees: number) => Array.from({ length: 20 }, (_, index) => ({ lat: 40.7 + index * spacingDegrees, lng: -73.9 }));

  it('waits for closer zoom the closer together the stops are', () => {
    const cityBus = stopRevealZoom(line(0.002)); // ~220 m apart
    const commuterRail = stopRevealZoom(line(0.03)); // ~3 km apart
    expect(cityBus).toBeGreaterThan(commuterRail);
    expect(cityBus).toBeGreaterThan(13);
    expect(commuterRail).toBeLessThan(11);
  });

  it('ignores a stop listed twice at one place and a lone stop', () => {
    expect(stopRevealZoom([point])).toBe(0);
    expect(stopRevealZoom([...line(0.03), line(0.03)[0]!])).toBeCloseTo(stopRevealZoom(line(0.03)), 2);
  });

  it('lets one bunched-up pair of stops off, and decides each trip leg on its own', () => {
    const spaced = line(0.03);
    expect(stopRevealZoom([...spaced, { lat: spaced[5]!.lat + 0.0003, lng: -73.9 }])).toBeLessThan(11);
    // Leg 0: rail stops miles apart; leg 1: city bus stops a block apart.
    const stops: TripMapStop[] = [
      ...spaced.map((stop): TripMapStop => ({ point: stop, kind: 'via', leg: 0 })),
      ...line(0.001).map((stop): TripMapStop => ({ point: { lat: stop.lat + 1, lng: stop.lng }, kind: 'via', leg: 1 })),
    ];
    const zooms = viaRevealZooms(stops);
    expect(zooms.get(0)).toBeLessThan(11);
    expect(zooms.get(1)).toBeGreaterThan(14);
  });

  it('reads a native region on the same zoom scale as the web map', () => {
    expect(zoomForRegion(360, 256)).toBeCloseTo(0);
    expect(zoomForRegion(0.01, 400)).toBeGreaterThan(15);
  });
});

describe('saved place icons', () => {
  it('follow the name the place was saved under', () => {
    expect(savedPlaceIcon('Home')).toBe('home');
    expect(savedPlaceIcon('My work')).toBe('work');
    expect(savedPlaceIcon('Stony Brook University')).toBe('school');
    expect(savedPlaceIcon('Penn Station')).toBe('place');
  });
});

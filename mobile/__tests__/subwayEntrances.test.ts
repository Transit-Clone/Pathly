import { subwayEntrancesAt } from '../src/data/subwayEntrances';
import { tripMapPoints } from '../src/data/tripMap';
import type { Itinerary } from '../src/data/tripPlanning';

const BARCLAYS = { lat: 40.6841, lng: -73.9777 };
const MIDDLE_OF_THE_BAY = { lat: 40.6, lng: -73.75 };

const ride = (mode: string, from = BARCLAYS, to = BARCLAYS) => ({
  kind: 'transit',
  mode,
  line: { name: 'Line' },
  from: { name: 'A', time: '2026-11-03T15:00:00Z', location: from },
  to: { name: 'B', time: '2026-11-03T15:10:00Z', location: to },
  path: [from, to],
});
const trip = (...steps: unknown[]) => ({ steps }) as unknown as Itinerary;
const entrancesOf = (itinerary: Itinerary) => tripMapPoints(itinerary).stops.filter((stop) => stop.kind === 'entrance');

describe('subway entrances', () => {
  it('finds a station\'s entrances, each labeled', () => {
    const found = subwayEntrancesAt(BARCLAYS);
    expect(found.length).toBeGreaterThan(3);
    expect(found.every((entrance) => entrance.label.length > 0)).toBe(true);
  });

  it('finds nothing away from a station', () => {
    expect(subwayEntrancesAt(MIDDLE_OF_THE_BAY)).toEqual([]);
  });

  it('marks them for subway rides only, once for a station used twice', () => {
    const one = entrancesOf(trip(ride('subway')));
    expect(one.length).toBeGreaterThan(3);
    expect(entrancesOf(trip(ride('subway'), ride('subway')))).toHaveLength(one.length);
    expect(entrancesOf(trip(ride('bus')))).toEqual([]);
  });

  it('leaves the trip\'s framing alone', () => {
    const { bounds, stops } = tripMapPoints(trip(ride('subway')));
    const entrance = stops.find((stop) => stop.kind === 'entrance');
    expect(bounds).not.toContainEqual(entrance?.point);
  });
});

describe('walks to a station', () => {
  const walk = { kind: 'walk', durationSeconds: 120, path: [{ lat: 40.69, lng: -73.97 }, { lat: 40.685, lng: -73.975 }] };

  it('end at the entrance Google chose, not the station dot', () => {
    const [firstLeg] = tripMapPoints(trip(walk, ride('subway'))).legs;
    expect(firstLeg!.path).toEqual(walk.path);
  });

  it('still reach a bus stop dot', () => {
    const [firstLeg] = tripMapPoints(trip(walk, ride('bus'))).legs;
    expect(firstLeg!.path.at(-1)).toEqual(BARCLAYS);
  });
});

import { IDLE_RIDE, nextRideState, type FeedVehicle, type RideFix, type RideState } from '../src/data/rideDetection';

const none = new Set<string>();
// About 111 m per 0.001 degrees of latitude.
const fixAt = (at: number, lat: number, accuracyMeters: number | null = 10): RideFix => ({ at, lat, lon: -73, accuracyMeters });
const vehicleAt = (at: number, lat: number, tripId = 'trip'): FeedVehicle => ({ tripId, lat, lon: -73, updatedAt: at });

function run(steps: [RideFix, FeedVehicle[]][], dismissed: ReadonlySet<string> = none): RideState {
  return steps.reduce<RideState>((state, [fix, vehicles]) => nextRideState(state, fix, vehicles, dismissed), IDLE_RIDE);
}

const moving = (lat: (index: number) => number): [RideFix, FeedVehicle[]][] => [0, 1, 2, 3].map((index) => {
  const at = 1_000_000 + index * 45_000;
  return [fixAt(at, lat(index)), [vehicleAt(at, lat(index))]];
});

describe('nextRideState', () => {
  it('confirms a rider travelling with a vehicle', () => {
    expect(run(moving((index) => 40 + index * 0.003))).toEqual({ phase: 'riding', tripId: 'trip', misses: 0 });
  });

  it('never confirms someone standing while a vehicle dwells beside them', () => {
    expect(run(moving(() => 40)).phase).toBe('candidate');
  });

  it('never confirms someone standing while a vehicle pulls away', () => {
    const steps = [0, 1, 2, 3].map((index): [RideFix, FeedVehicle[]] => {
      const at = 1_000_000 + index * 45_000;
      return [fixAt(at, 40), [vehicleAt(at, 40 + index * 0.001)]];
    });
    expect(run(steps).phase).not.toBe('riding');
  });

  it('does not confirm a rider moving the opposite way', () => {
    const steps = [0, 1, 2, 3].map((index): [RideFix, FeedVehicle[]] => {
      const at = 1_000_000 + index * 45_000;
      return [fixAt(at, 40 - index * 0.002), [vehicleAt(at, 40 + index * 0.002)]];
    });
    expect(run(steps).phase).not.toBe('riding');
  });

  it('ignores inaccurate fixes, without ending a ride', () => {
    const riding: RideState = { phase: 'riding', tripId: 'trip', misses: 0 };
    expect(nextRideState(riding, fixAt(1, 41, 500), [], none)).toBe(riding);
    expect(nextRideState(riding, fixAt(1, 41, null), [], none)).toBe(riding);
  });

  it('ends a ride after two fixes away from the vehicle', () => {
    const riding: RideState = { phase: 'riding', tripId: 'trip', misses: 0 };
    const far = [vehicleAt(1000, 40.1)];
    const once = nextRideState(riding, fixAt(1000, 40), far, none);
    expect(once).toEqual({ phase: 'riding', tripId: 'trip', misses: 1 });
    expect(nextRideState(once, fixAt(2000, 40), far, none)).toEqual(IDLE_RIDE);
  });

  it('skips a vehicle the rider said they are not on', () => {
    expect(run(moving((index) => 40 + index * 0.003), new Set(['trip']))).toEqual(IDLE_RIDE);
  });
});

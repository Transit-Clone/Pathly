import { bearingDegrees, directionArrowAt, splitPathAtStop, withAlpha } from '../src/data/routeDirection';

// A straight east-west line along 40.9°N: 21 points about 84 m apart.
const line = Array.from({ length: 21 }, (_, index) => ({ lat: 40.9, lon: -73.2 + index * 0.001 }));
const stops = [line[0]!, line[10]!, line[20]!];

describe('route direction helpers', () => {
  it('puts the direction arrow on a straight stretch, pointing the way the line runs', () => {
    // East for 84 m, then a sharp turn north for 1 km: the arrow belongs on the long straight.
    const bend = [
      ...Array.from({ length: 2 }, (_, index) => ({ lat: 40.9, lon: -73.2 + index * 0.001 })),
      ...Array.from({ length: 12 }, (_, index) => ({ lat: 40.9 + (index + 1) * 0.001, lon: -73.199 })),
    ];
    const arrow = directionArrowAt(bend)!;
    expect(arrow.point.lon).toBeCloseTo(-73.199, 4);
    expect(Math.abs(arrow.bearing)).toBeLessThan(2);
    expect(directionArrowAt(line)!.bearing).toBeCloseTo(90, 0);
    expect(directionArrowAt([line[0]!])).toBeNull();
  });

  it('splits a straight path at the stop', () => {
    const at = (stopIndex: number) => splitPathAtStop(line, stops, stopIndex);
    expect(at(1).behind.at(-1)).toEqual(line[10]);
    expect(at(1).ahead[0]).toEqual(line[10]);
    expect(at(0).behind).toHaveLength(1);
    expect(at(2).ahead).toHaveLength(1);
  });

  it('cuts at the stop itself when the nearest path point is far away', () => {
    // A 7 km straight segment with the stop in its middle, like the 1 train's sparse shape.
    const sparse = [{ lat: 40.8, lon: -73.96 }, { lat: 40.863, lon: -73.96 }];
    const stop = { lat: 40.83, lon: -73.96 };
    const { behind, ahead } = splitPathAtStop(sparse, [sparse[0]!, stop, sparse[1]!], 1);
    expect(behind.at(-1)!.lat).toBeCloseTo(40.83, 6);
    expect(ahead[0]!.lat).toBeCloseTo(40.83, 6);
  });

  it('splits at the right pass when the line passes the same stop twice', () => {
    // Out to the east and back: the stop at index 2 of the stops list is on the return leg.
    const outAndBack = [...line, ...line.slice(0, -1).reverse()];
    const loopStops = [line[0]!, line[15]!, line[10]!, line[0]!];
    const { behind } = splitPathAtStop(outAndBack, loopStops, 2);
    // Behind runs out to the east end and back to the stop.
    expect(behind.length).toBeGreaterThan(25);
    expect(behind.at(-1)!.lon).toBeCloseTo(line[10]!.lon, 6);
  });

  it('points east or west along the line', () => {
    expect(bearingDegrees(line[0]!, line[5]!)).toBeCloseTo(90, 0);
    expect(bearingDegrees(line[5]!, line[0]!)).toBeCloseTo(270, 0);
  });


  it('adds an alpha channel to hex colors', () => {
    expect(withAlpha('#A626AA', 0.35)).toBe('#A626AA59');
    expect(withAlpha('rgb(1, 2, 3)', 0.35)).toBe('rgb(1, 2, 3)');
  });
});

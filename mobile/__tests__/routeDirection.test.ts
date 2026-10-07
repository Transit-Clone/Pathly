import { bearingDegrees, bearingToNextStop, splitIndexAtStop, withAlpha } from '../src/data/routeDirection';

// A straight east-west line along 40.9°N: 21 points about 84 m apart.
const line = Array.from({ length: 21 }, (_, index) => ({ lat: 40.9, lon: -73.2 + index * 0.001 }));
const stops = [line[0]!, line[10]!, line[20]!];

describe('route direction helpers', () => {
  it('splits a straight path at the stop', () => {
    expect(splitIndexAtStop(line, stops, 1)).toBe(10);
    expect(splitIndexAtStop(line, stops, 0)).toBe(0);
    expect(splitIndexAtStop(line, stops, 2)).toBe(20);
  });

  it('splits at the right pass when the line passes the same stop twice', () => {
    // Out to the east and back: the stop at index 2 of the stops list is on the return leg.
    const outAndBack = [...line, ...line.slice(0, -1).reverse()];
    const loopStops = [line[0]!, line[15]!, line[10]!, line[0]!];
    expect(splitIndexAtStop(outAndBack, loopStops, 2)).toBe(30);
  });

  it('points east or west along the line', () => {
    expect(bearingDegrees(line[0]!, line[5]!)).toBeCloseTo(90, 0);
    expect(bearingDegrees(line[5]!, line[0]!)).toBeCloseTo(270, 0);
  });

  it('aims the arrow straight at the next stop, even where the track curves away first', () => {
    // From the middle stop, the next stop is due east; reversed, due west.
    expect(bearingToNextStop(stops, 1)).toBeCloseTo(90, 0);
    expect(bearingToNextStop([...stops].reverse(), 1)).toBeCloseTo(270, 0);
    // The next stop is northeast even if the line between leaves heading south first.
    expect(bearingToNextStop([{ lat: 40.9, lon: -73.2 }, { lat: 40.91, lon: -73.19 }], 0)).toBeGreaterThan(30);
    expect(bearingToNextStop([{ lat: 40.9, lon: -73.2 }, { lat: 40.91, lon: -73.19 }], 0)).toBeLessThan(60);
    // No arrow at the end of the line.
    expect(bearingToNextStop(stops, 2)).toBeNull();
  });

  it('adds an alpha channel to hex colors', () => {
    expect(withAlpha('#A626AA', 0.35)).toBe('#A626AA59');
    expect(withAlpha('rgb(1, 2, 3)', 0.35)).toBe('rgb(1, 2, 3)');
  });
});

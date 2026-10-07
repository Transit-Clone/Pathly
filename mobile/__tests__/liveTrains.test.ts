import { formatAge, STALE_TRAIN_MS, visibleTrains } from '../src/data/liveTrains';

describe('formatAge', () => {
  it.each([
    [0, '0s'],
    [3_400, '3s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [59 * 60_000, '59m'],
    [2 * 3_600_000 + 5, '2h'],
    [-500, '0s'],
  ])('formats %d ms as %s', (ms, label) => {
    expect(formatAge(ms)).toBe(label);
  });
});

describe('visibleTrains', () => {
  const now = 1_000_000_000;
  const train = (tripId: string, directionId: number, updatedAt: number | null) => ({ tripId, directionId, lat: 0, lon: 0, updatedAt });

  it('keeps fresh trains in the selected direction only', () => {
    const trains = [train('a', 1, now - 1000), train('b', 0, now - 1000)];
    expect(visibleTrains(trains, 1, now).map((t) => t.tripId)).toEqual(['a']);
    expect(visibleTrains(trains, undefined, now).map((t) => t.tripId)).toEqual(['a', 'b']);
  });

  it('drops trains older than the stale cutoff but keeps ones with unknown age', () => {
    const trains = [train('edge', 1, now - STALE_TRAIN_MS), train('old', 1, now - STALE_TRAIN_MS - 1), train('unknown', 1, null)];
    expect(visibleTrains(trains, 1, now).map((t) => t.tripId)).toEqual(['edge', 'unknown']);
  });
});

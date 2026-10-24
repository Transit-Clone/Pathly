import type { NavigationCursor, NormalizedNavigationPlan } from '../src/data/enrouteNavigation';
import { hurryUpFor, hurryUpMessage } from '../src/data/hurryUp';

const NOW = Date.UTC(2026, 9, 24, 14, 0);
const STOP = { lat: 40.75, lng: -73.99 };
// About 500 m north of the stop: roughly an 8 minute walk at an easy pace, around street corners.
const WALKING_FROM = { lat: 40.7545, lng: -73.99 };

const plan = (departsInMinutes: number) => ({
  itineraryId: 'trip',
  checkpoints: [
    { ordinal: 0, key: 'start', kind: 'start', point: WALKING_FROM, label: 'Start', stepIndex: 0, phase: 'walking', pathIndex: 0 },
    { ordinal: 1, key: 'board-1', kind: 'board', point: STOP, label: '34 St-Penn Station', stepIndex: 1, phase: 'waiting-to-board', pathIndex: 0, time: new Date(NOW + departsInMinutes * 60_000).toISOString() },
  ],
}) as unknown as NormalizedNavigationPlan;
const walking: NavigationCursor = { checkpointOrdinal: 0, stepIndex: 0, phase: 'walking', lastAdvancedAt: NOW };

describe('hurryUpFor', () => {
  it('says nothing with time to spare', () => {
    expect(hurryUpFor(plan(15), walking, WALKING_FROM, NOW)).toBeNull();
  });

  it('nudges when the walk takes about as long as is left', () => {
    const hurry = hurryUpFor(plan(8), walking, WALKING_FROM, NOW);
    expect(hurry).toMatchObject({ key: 'trip:board-1', stopName: '34 St-Penn Station', minutesToDeparture: 8 });
    expect(hurry!.walkMinutes).toBeGreaterThanOrEqual(7);
    expect(hurryUpMessage(hurry!).body).toBe(`Your ride at 34 St-Penn Station leaves in 8 min, about a ${hurry!.walkMinutes} min walk away.`);
  });

  it('stays quiet once it has left, at the stop, or while riding', () => {
    expect(hurryUpFor(plan(-1), walking, WALKING_FROM, NOW)).toBeNull();
    expect(hurryUpFor(plan(1), walking, STOP, NOW)).toBeNull();
    expect(hurryUpFor(plan(2), { ...walking, phase: 'riding' }, WALKING_FROM, NOW)).toBeNull();
  });
});

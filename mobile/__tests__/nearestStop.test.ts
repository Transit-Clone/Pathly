import { nearestPortJeffersonStop } from '../src/data/nearestStop';
import { SERVICE_AREA_FALLBACK } from '../src/data/serviceArea';

describe('nearestPortJeffersonStop', () => {
  it('returns the station the rider is standing at', () => {
    expect(nearestPortJeffersonStop({ latitude: 40.9203, longitude: -73.1285 }).name).toBe('Stony Brook');
  });

  it('returns Smithtown for a point in Smithtown village', () => {
    expect(nearestPortJeffersonStop({ latitude: 40.8559, longitude: -73.2007 })).toMatchObject({ name: 'Smithtown', stopId: '202' });
  });

  it('returns Stony Brook (stop 14) for the denied-permission fallback location', () => {
    expect(nearestPortJeffersonStop(SERVICE_AREA_FALLBACK)).toMatchObject({ name: 'Stony Brook', stopId: '14' });
  });

  it('returns Penn Station for a point in Midtown', () => {
    expect(nearestPortJeffersonStop({ latitude: 40.7549, longitude: -73.984 }).name).toBe('Penn Station');
  });
});

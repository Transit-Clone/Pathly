import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  boundsOf,
  campus,
  labelPlacement,
  roads,
  userLocation,
} from '../src/data/mapGeometry';

const inWorld = (x: number, y: number) => x >= 0 && x <= WORLD_WIDTH && y >= 0 && y <= WORLD_HEIGHT;

describe('illustrated map geometry', () => {
  it('places every named road label inside the world at an upright angle', () => {
    const named = roads.filter((road) => road.name);
    expect(named.map((road) => road.name)).toEqual(expect.arrayContaining(['Nicolls Rd', 'N Country Rd', 'Stony Brook Rd', 'Quaker Path']));
    for (const road of named) {
      const label = labelPlacement(road.points);
      expect(inWorld(label.x, label.y)).toBe(true);
      expect(Math.abs(label.angle)).toBeLessThanOrEqual(90);
    }
  });

  it('keeps every road point in the world and the rider on campus', () => {
    for (const road of roads) {
      expect(road.points.every(([x, y]) => inWorld(x, y))).toBe(true);
    }
    const campusBounds = boundsOf([campus.points]);
    expect(userLocation[0]).toBeGreaterThan(campusBounds.minX);
    expect(userLocation[0]).toBeLessThan(campusBounds.maxX);
    expect(userLocation[1]).toBeGreaterThan(campusBounds.minY);
    expect(userLocation[1]).toBeLessThan(campusBounds.maxY);
  });
});

/**
 * Illustrative Stony Brook–area street map in a fixed world space (north is up).
 * Shapes follow the real layout loosely; they are not survey-accurate.
 */
export type Point = readonly [number, number];

export type Bounds = { maxX: number; maxY: number; minX: number; minY: number };

export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 1400;

export type MapRoad = {
  kind: 'major' | 'minor';
  name?: string;
  points: readonly Point[];
};

export type MapArea = {
  label?: string;
  labelAt?: Point;
  points: readonly Point[];
};

export const water: readonly MapArea[] = [
  {
    label: 'Stony Brook Harbor',
    labelAt: [120, 90],
    points: [[-2000, -2000], [3000, -2000], [3000, 150], [1000, 150], [880, 190], [800, 150], [720, 205], [640, 175], [560, 225], [470, 195], [380, 240], [300, 205], [210, 235], [120, 190], [0, 230], [-2000, 230]],
  },
];

export const parks: readonly MapArea[] = [
  { label: 'Avalon Preserve', labelAt: [300, 300], points: [[235, 255], [360, 262], [372, 345], [250, 352]] },
  { points: [[40, 250], [150, 262], [140, 318], [30, 305]] },
  { label: 'Old Field Park', labelAt: [850, 470], points: [[790, 440], [930, 430], [945, 520], [805, 530]] },
  { points: [[430, 960], [560, 950], [575, 1040], [445, 1055]] },
  { label: 'Stony Brook Park', labelAt: [140, 830], points: [[70, 770], [230, 760], [245, 900], [80, 915]] },
];

export const campus: MapArea = {
  label: 'Stony Brook University',
  labelAt: [560, 700],
  points: [[395, 505], [770, 490], [790, 880], [640, 905], [410, 890]],
};

export const roads: readonly MapRoad[] = [
  { kind: 'major', name: 'N Country Rd', points: [[0, 355], [180, 368], [330, 395], [470, 425], [610, 430], [760, 405], [880, 372], [1000, 350]] },
  { kind: 'major', name: 'Nicolls Rd', points: [[590, 430], [585, 560], [612, 720], [640, 900], [652, 1080], [660, 1250], [668, 1400]] },
  { kind: 'major', name: 'Stony Brook Rd', points: [[330, 395], [322, 560], [300, 760], [270, 980], [250, 1200], [240, 1400]] },
  { kind: 'major', name: 'Nesconset Hwy', points: [[0, 1235], [240, 1215], [460, 1170], [700, 1120], [1000, 1060]] },
  { kind: 'minor', name: 'Main St', points: [[20, 312], [110, 330], [200, 360]] },
  { kind: 'minor', name: 'Quaker Path', points: [[470, 425], [452, 330], [440, 235]] },
  { kind: 'minor', name: 'Christian Ave', points: [[400, 410], [390, 520], [372, 660], [360, 760]] },
  { kind: 'minor', name: 'Lower Sheep Pasture Rd', points: [[652, 610], [800, 590], [1000, 570]] },
  { kind: 'minor', name: 'Pond Path', points: [[770, 403], [785, 600], [800, 800], [820, 1000]] },
  { kind: 'minor', name: 'Hallock Rd', points: [[0, 1100], [270, 1080], [450, 1060], [652, 1020]] },
  { kind: 'minor', name: 'Ridgeway Ave', points: [[610, 300], [760, 282], [900, 300]] },
  { kind: 'minor', points: [[610, 430], [612, 300]] },
  { kind: 'minor', points: [[900, 300], [880, 372]] },
  { kind: 'minor', points: [[322, 560], [395, 555]] },
  { kind: 'minor', points: [[800, 800], [1000, 780]] },
  { kind: 'minor', points: [[0, 540], [322, 560]] },
  { kind: 'minor', points: [[270, 980], [0, 960]] },
  { kind: 'minor', points: [[820, 1000], [1000, 990]] },
  { kind: 'minor', name: 'Circle Rd', points: [[440, 545], [545, 530], [665, 548], [705, 650], [690, 770], [600, 835], [475, 822], [432, 700], [440, 545]] },
  { kind: 'minor', points: [[120, 372], [110, 540], [100, 760]] },
  { kind: 'minor', points: [[215, 372], [205, 550], [190, 760]] },
  { kind: 'minor', points: [[0, 660], [110, 655], [205, 650], [306, 645]] },
  { kind: 'minor', points: [[0, 760], [306, 760]] },
  { kind: 'minor', name: 'Old Field Rd', points: [[700, 205], [712, 300], [720, 404]] },
  { kind: 'minor', points: [[180, 368], [172, 255]] },
  { kind: 'minor', points: [[860, 380], [895, 600], [915, 800], [930, 995]] },
  { kind: 'minor', points: [[785, 700], [1000, 690]] },
  { kind: 'minor', name: 'Oxhead Rd', points: [[290, 870], [470, 880], [640, 900]] },
  { kind: 'minor', points: [[450, 1060], [446, 1170]] },
  { kind: 'minor', points: [[120, 1090], [110, 1225]] },
  { kind: 'minor', points: [[652, 1020], [800, 1015], [820, 1000]] },
  { kind: 'minor', points: [[0, 880], [110, 875], [290, 870]] },
  { kind: 'minor', points: [[372, 660], [432, 660]] },
  { kind: 'minor', points: [[705, 650], [785, 640]] },
];

export const placeLabels: readonly { at: Point; label: string }[] = [
  { at: [110, 400], label: 'Stony Brook' },
  { at: [890, 250], label: 'Setauket' },
  { at: [900, 660], label: 'East Setauket' },
  { at: [470, 1320], label: 'Centereach' },
];

/** The rider's mock location, on the Stony Brook University campus. */
export const userLocation: Point = [520, 640];

/** Default home and search framing around campus and the village. */
export const defaultFocus: Bounds = { minX: 170, minY: 300, maxX: 890, maxY: 980 };

export function boundsOf(pointSets: readonly (readonly Point[])[]): Bounds {
  const points = pointSets.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

/** Midpoint and upright angle (degrees) of a polyline's longest segment, for placing its label. */
export function labelPlacement(points: readonly Point[]) {
  let best = { length: -1, x: 0, y: 0, angle: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1]!;
    const [x2, y2] = points[index]!;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > best.length) {
      let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      best = { length, x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle };
    }
  }
  return best;
}

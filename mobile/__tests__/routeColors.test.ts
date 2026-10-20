import { readFileSync } from 'fs';
import { join } from 'path';

import { BUS_COLORS, transferColor } from '../src/data/routeColors';

describe('route colors', () => {
  it('match the backend exactly', () => {
    const backend = readFileSync(join(__dirname, '../../firebase/functions/src/routeColors.ts'), 'utf8');
    const block = backend.match(/export const BUS_COLORS = \{([^}]*)\}/)?.[1] ?? '';
    const backendColors = Object.fromEntries([...block.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((match) => [match[1], match[2]]));
    expect(backendColors).toEqual(BUS_COLORS);
  });

  it('recolor bus transfer chips by agency and service, and leave rail alone', () => {
    const chip = (agency: string, name: string, mode: 'bus' | 'subway' | 'rail' = 'bus', color: string | null = '#EF853F') => transferColor({ agency, mode, name, color });
    expect(chip('NICE Bus', 'n24')).toBe(BUS_COLORS.nice);
    expect(chip('Suffolk County Transit', '1', 'bus', '#C63F49')).toBe(BUS_COLORS.suffolkFrequent);
    expect(chip('Suffolk County Transit', '62', 'bus', '#0454A2')).toBe(BUS_COLORS.suffolk);
    expect(chip('MTA Bus', 'QM2', 'bus', '#00933C')).toBe(BUS_COLORS.mtaExpress);
    expect(chip('MTA Bus', 'Q44-SBS', 'bus', '#EE352E')).toBe(BUS_COLORS.mtaSelectBusService);
    expect(chip('MTA Bus', 'Q25', 'bus', '#FAA61A')).toBe(BUS_COLORS.mtaLocal);
    expect(chip('MTA Subway', 'E', 'subway', '#0062CF')).toBe('#0062CF');
  });
});

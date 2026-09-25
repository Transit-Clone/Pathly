import { colors } from '../src/theme/colors';
import { fontFamilies, typography } from '../src/theme/typography';

describe('Pathly visual theme', () => {
  it('uses the six colors specified by the design document', () => {
    expect(colors).toEqual(
      expect.objectContaining({
        primary: '#0B4F9C',
        accent: '#A7D8FF',
        background: '#F7FAFF',
        text: '#1F2937',
        success: '#16A34A',
        warning: '#F97316',
      }),
    );
  });

  it('defines Nunito roles with glanceable transit sizes', () => {
    expect(Object.values(fontFamilies).every((family) => family.startsWith('Nunito_'))).toBe(true);
    expect(typography.displayTime).toEqual(
      expect.objectContaining({ fontFamily: fontFamilies.extraBold, fontSize: 24 }),
    );
    expect(typography.routeName).toEqual(
      expect.objectContaining({ fontFamily: fontFamilies.extraBold, fontSize: 18 }),
    );
    expect(typography.displayTime.fontSize).toBeGreaterThanOrEqual(22);
    expect(typography.routeName.fontSize).toBeGreaterThanOrEqual(18);
  });
});

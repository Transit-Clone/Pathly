import { colors, darkColors, lightColors, type Palette } from '../src/theme/colors';
import { contrastRatio, readableColor } from '../src/theme/contrast';
import { fontFamilies, typography } from '../src/theme/typography';
import { routeColors } from '../src/data/transit';

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
      expect.objectContaining({ fontFamily: fontFamilies.extraBold, fontSize: 26 }),
    );
    expect(typography.routeName).toEqual(
      expect.objectContaining({ fontFamily: fontFamilies.extraBold, fontSize: 18 }),
    );
    expect(typography.displayTime.fontSize).toBeGreaterThanOrEqual(22);
    expect(typography.routeName.fontSize).toBeGreaterThanOrEqual(18);
  });

  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high! + 0.05) / (low! + 0.05);
  };

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as [string, Palette][])('keeps %s theme text and icons at 4.5:1 contrast', (_name, palette) => {
    for (const foreground of [palette.ink, palette.mutedInk, palette.primary]) {
      for (const surface of [palette.background, palette.surface]) {
        expect(contrast(foreground, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses black and dark-gray surfaces in the dark theme', () => {
    expect(luminance(darkColors.background)).toBeLessThan(0.02);
    expect(luminance(darkColors.surface)).toBeLessThan(0.03);
    expect(luminance(darkColors.ink)).toBeGreaterThan(0.8);
  });

  it('lightens route-colored text just enough to read on dark surfaces', () => {
    for (const color of Object.values(routeColors)) {
      const adjusted = readableColor(color, darkColors.surface);
      expect(contrastRatio(adjusted, darkColors.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableColor('#FFFFFF', darkColors.surface)).toBe('#FFFFFF');
    expect(readableColor(routeColors.e, lightColors.surface)).toBe(routeColors.e.toUpperCase());
  });
});

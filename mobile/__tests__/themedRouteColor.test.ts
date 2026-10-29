import { BUS_COLORS, themedRouteColor } from '../src/data/routeColors';

describe('themedRouteColor', () => {
  it('keeps every color as published in light mode', () => {
    expect(themedRouteColor(BUS_COLORS.mtaLocal, false)).toBe(BUS_COLORS.mtaLocal);
  });

  it("darkens Pathly's own bus colors in dark mode", () => {
    expect(themedRouteColor(BUS_COLORS.mtaLocal, true)).toBe('#1463A5');
  });

  it('keeps official subway and railroad colors vibrant in dark mode', () => {
    expect(themedRouteColor('#FCCC0A', true)).toBe('#FCCC0A');
    expect(themedRouteColor('#0039A6', true)).toBe('#0039A6');
  });
});

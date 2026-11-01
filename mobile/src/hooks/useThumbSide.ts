import { useMemo } from 'react';

import { useAppSettings } from '../theme/AppSettings';

/** Google's logo fills the map's bottom-left corner, about 26 px tall; the map's legal terms need it uncovered. */
export const MAP_LOGO_CLEARANCE = 30;

/**
 * Where thumb-pressed controls sit (Accessibility -> Left-handed mode): the right edge by default,
 * the left edge in left-handed mode. Only placement changes; text and reading order never mirror.
 */
export function thumbSide(leftHanded: boolean) {
  return {
    leftHanded,
    /** Pins an absolutely positioned control to the thumb's edge, `inset` from it. */
    anchor: (inset: number) => (leftHanded ? { left: inset } : { right: inset }),
    /** A margin on the side facing the thumb's edge. */
    edgeMargin: (margin: number) => (leftHanded ? { marginLeft: margin } : { marginRight: margin }),
    /** A slide toward the thumb's edge, such as off the screen. */
    towardEdge: (distance: number) => (leftHanded ? -distance : distance),
    /** A row whose last child sits nearest the thumb's edge. */
    row: leftHanded ? ('row-reverse' as const) : ('row' as const),
    /** How much higher a control low on a map must sit, so it stays clear of the map's logo. */
    mapBottomClearance: leftHanded ? MAP_LOGO_CLEARANCE : 0,
  };
}

export function useThumbSide() {
  const { leftHanded } = useAppSettings();
  return useMemo(() => thumbSide(leftHanded), [leftHanded]);
}

import Svg, { Path } from 'react-native-svg';

/** The arrow's square, in px; its center is the spot on the line, and the arrow sits off to one side. */
export const DIRECTION_ARROW_BOX = 72;
/**
 * How far right of the line (facing the way it runs) the arrow is drawn: clear of the 8 px line
 * even where it strays a little toward the arrow (routeDirection.ts allows up to 6 px).
 */
const SIDE_OFFSET = 22;
const HALF = DIRECTION_ARROW_BOX / 2;
const X = HALF + SIDE_OFFSET;
/** Half the arrow's length, tail to tip. */
const HALF_LENGTH = 15;
const HEAD = 6;

// A long arrow pointing up (the way the line runs once the box is turned to its bearing): a shaft
// with an open head, beside the line rather than on it.
const ARROW = `M${X} ${HALF + HALF_LENGTH} L${X} ${HALF - HALF_LENGTH} M${X - HEAD} ${HALF - HALF_LENGTH + HEAD} L${X} ${HALF - HALF_LENGTH} L${X + HEAD} ${HALF - HALF_LENGTH + HEAD}`;

/**
 * Which way the route runs, as an arrow in its color next to the line near the rider's stop (never
 * on the line or the stop). Unturned it points up; the map turns it to the line's bearing.
 */
export function DirectionArrow({ color }: { color: string }) {
  return (
    <Svg height={DIRECTION_ARROW_BOX} pointerEvents="none" viewBox={`0 0 ${DIRECTION_ARROW_BOX} ${DIRECTION_ARROW_BOX}`} width={DIRECTION_ARROW_BOX}>
      <Path d={ARROW} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

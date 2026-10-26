import Svg, { Path, RadialGradient, Stop } from 'react-native-svg';

/** The beam's square, in px; the rider's dot sits at its center. */
export const HEADING_BEAM_SIZE = 120;
/** How wide the beam opens, in degrees. */
const BEAM_SPREAD = 70;

const center = HEADING_BEAM_SIZE / 2;
const reach = center - 2;
const edge = (degrees: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${(center + reach * Math.cos(radians)).toFixed(2)} ${(center + reach * Math.sin(radians)).toFixed(2)}`;
};
// A wedge from the center, pointing up (north), fading out toward its rim like a flashlight.
const WEDGE = `M${center} ${center} L${edge(-BEAM_SPREAD / 2)} A${reach} ${reach} 0 0 1 ${edge(BEAM_SPREAD / 2)} Z`;

/** The flashlight beam that shows which way the rider faces, pointing up; rotate it to the heading. */
export function HeadingBeam({ color = '#4285F4' }: { color?: string }) {
  return (
    <Svg height={HEADING_BEAM_SIZE} pointerEvents="none" viewBox={`0 0 ${HEADING_BEAM_SIZE} ${HEADING_BEAM_SIZE}`} width={HEADING_BEAM_SIZE}>
      <RadialGradient cx={center} cy={center} gradientUnits="userSpaceOnUse" id="heading-beam" r={reach}>
        <Stop offset="0" stopColor={color} stopOpacity={0.55} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient>
      <Path d={WEDGE} fill="url(#heading-beam)" />
    </Svg>
  );
}

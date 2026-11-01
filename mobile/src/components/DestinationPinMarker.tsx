import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useAuth } from '../auth/AuthContext';
import { destinationPinFace, destinationPinFaceSvg, destinationPinHex, type DestinationPinStyle } from '../data/destinationPin';
import { useAppSettings } from '../theme/AppSettings';

/** Phosphor's map pin (`map-pin-fill`, phosphorGlyphs.ts) without its hole, so the head holds a face. */
const PIN_PATH = 'M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Z';
/**
 * The pin on the 256-unit grid, with no outline, and room above it for hair (always kept, so every
 * pin is the same size); the tip is at the bottom edge.
 */
const VIEW = { x: 40, y: -22, width: 176, height: 262 };
/** The Pathling's face (centered near 65, 72 on its 128-unit grid), moved and scaled onto the pin's head. */
const FACE_TRANSFORM = 'translate(128 104) scale(1.65) translate(-65 -72)';
/** The Pathling's hair, at the same scale, with its roots (y 31 on its grid) on the pin's top. */
const HAIR_TRANSFORM = 'translate(128 20) scale(1.65) translate(-65 -31)';

/** The pin's size at scale 1: callers anchor its bottom-center (the tip) on the place. */
export const DESTINATION_PIN_WIDTH = 34;
export const DESTINATION_PIN_HEIGHT = Math.round((DESTINATION_PIN_WIDTH * VIEW.height) / VIEW.width);

/**
 * The destination pin in the rider's chosen color, with their Pathling's face and hair (or the parts
 * they picked for it in Settings, Personalization). `pinStyle` overrides the saved one (the editor's
 * preview and options); `scale` enlarges it there.
 */
export function DestinationPinMarker({ pinStyle, scale = 1, testID }: { pinStyle?: DestinationPinStyle; scale?: number; testID?: string }) {
  const saved = useAppSettings().destinationPin;
  const { avatar } = useAuth();
  const pin = pinStyle ?? saved;
  const width = DESTINATION_PIN_WIDTH * scale;
  const height = DESTINATION_PIN_HEIGHT * scale;
  const parts = destinationPinFaceSvg(destinationPinFace(pin, avatar));
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}">`
    + `<path d="${PIN_PATH}" fill="${destinationPinHex(pin)}"/>`
    + `<g transform="${HAIR_TRANSFORM}">${parts.hair}</g><g transform="${FACE_TRANSFORM}">${parts.face}</g></svg>`;
  return (
    <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width, height }} testID={testID}>
      <SvgXml accessible={false} height={height} width={width} xml={xml} />
    </View>
  );
}

import { BEAN_EYES, BEAN_HAIR, BEAN_MOUTHS, DEFAULT_BEAN_AVATAR, type BeanAvatarConfig } from '../avatars/beanAvatar';
import { SAVED_PLACE_COLOR_HEX } from './savedPlacePin';
import { SAVED_PLACE_COLORS, type SavedPlaceColor } from './userData';

type PinEyes = BeanAvatarConfig['eyes'];
type PinMouth = BeanAvatarConfig['mouth'];
type PinHair = BeanAvatarConfig['hair'];
type PinFace = { eyes: PinEyes; mouth: PinMouth; hair: PinHair };

/**
 * How the rider's destination pin looks on trip maps: a color, and a face and hair from the same
 * parts as their Pathling. A part left unset follows their Pathling's, so the pin changes
 * with it. Saved on the device with the display settings.
 */
export type DestinationPinStyle = { color: SavedPlaceColor; eyes?: PinEyes; mouth?: PinMouth; hair?: PinHair };

export const DEFAULT_DESTINATION_PIN: Readonly<DestinationPinStyle> = { color: 'red' };

export const DESTINATION_PIN_COLORS = SAVED_PLACE_COLORS;
export const DESTINATION_PIN_EYES = BEAN_EYES;
export const DESTINATION_PIN_MOUTHS = BEAN_MOUTHS;
export const DESTINATION_PIN_HAIR = BEAN_HAIR;

export function destinationPinHex(style: DestinationPinStyle): string {
  return SAVED_PLACE_COLOR_HEX[style.color];
}

/** The pin's eyes, mouth and hair: its own picks, else the Pathling's. */
export function destinationPinFace(style: DestinationPinStyle, avatar: BeanAvatarConfig | undefined): PinFace {
  const pathling = avatar ?? DEFAULT_BEAN_AVATAR;
  return { eyes: style.eyes ?? pathling.eyes, mouth: style.mouth ?? pathling.mouth, hair: style.hair ?? pathling.hair };
}

/** The face's and the hair's SVG markup, from the Pathling's parts (drawn on their 128-unit grid). */
export function destinationPinFaceSvg(face: PinFace): { face: string; hair: string } {
  const eyes = BEAN_EYES.find((part) => part.id === face.eyes) ?? BEAN_EYES[0];
  const mouth = BEAN_MOUTHS.find((part) => part.id === face.mouth) ?? BEAN_MOUTHS[0];
  const hair = BEAN_HAIR.find((part) => part.id === face.hair) ?? BEAN_HAIR[0];
  return { face: eyes.svg + mouth.svg, hair: hair.svg };
}

/** Keeps only known parts, so a stale or hand-edited saved value (an older pin) can't break the maps. */
export function normalizeDestinationPin(value: unknown): DestinationPinStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_DESTINATION_PIN };
  const input = value as Record<string, unknown>;
  const eyes = BEAN_EYES.find((part) => part.id === input.eyes)?.id;
  const mouth = BEAN_MOUTHS.find((part) => part.id === input.mouth)?.id;
  const hair = BEAN_HAIR.find((part) => part.id === input.hair)?.id;
  return {
    color: DESTINATION_PIN_COLORS.find((color) => color === input.color) ?? DEFAULT_DESTINATION_PIN.color,
    ...(eyes ? { eyes } : {}),
    ...(mouth ? { mouth } : {}),
    ...(hair ? { hair } : {}),
  };
}

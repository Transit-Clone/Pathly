import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../theme/AppSettings';
import { PhosphorGlyph } from './PhosphorGlyph';
import { phosphorGlyphs, type PhosphorGlyphName } from './phosphorGlyphs';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Each icon's Phosphor glyph: [off state (Bold outline), on state (Fill)]. */
const glyphs = {
  accessibility: ['person-arms-spread-bold', 'person-arms-spread-fill'],
  add: ['plus-circle-bold', 'plus-circle-fill'],
  alert: ['warning-circle-bold', 'warning-circle-fill'],
  appearance: ['palette-bold', 'palette-fill'],
  arrowRight: ['arrow-right-bold', 'arrow-right-bold'],
  back: ['caret-left-bold', 'caret-left-bold'],
  bell: ['bell-bold', 'bell-fill'],
  cafe: ['coffee-bold', 'coffee-fill'],
  mail: ['envelope-rounded-fill', 'envelope-rounded-fill'],
  cart: ['shopping-cart-bold', 'shopping-cart-fill'],
  check: ['check-bold', 'check-bold'],
  close: ['x-circle-fill', 'x-circle-fill'],
  collapse: ['caret-up-bold', 'caret-up-bold'],
  dismiss: ['x-bold', 'x-bold'],
  download: ['download-simple-bold', 'download-simple-fill'],
  edit: ['pencil-simple-bold', 'pencil-simple-fill'],
  expand: ['caret-down-bold', 'caret-down-bold'],
  fare: ['tag-bold', 'tag-fill'],
  feedback: ['chat-circle-dots-bold', 'chat-circle-dots-fill'],
  favorite: ['star-bold', 'star-fill'],
  filter: ['funnel-bold', 'funnel-fill'],
  fit: ['frame-corners-bold', 'frame-corners-fill'],
  flash: ['lightning-bold', 'lightning-fill'],
  fitness: ['barbell-bold', 'barbell-fill'],
  forward: ['caret-right-bold', 'caret-right-bold'],
  go: ['navigation-arrow-bold', 'navigation-arrow-fill'],
  heart: ['heart-bold', 'heart-fill'],
  help: ['question-bold', 'question-fill'],
  info: ['info-bold', 'info-fill'],
  home: ['house-bold', 'house-fill'],
  medical: ['first-aid-kit-bold', 'first-aid-kit-fill'],
  modes: ['stack-bold', 'stack-fill'],
  ok: ['check-circle-bold', 'check-circle-fill'],
  people: ['users-bold', 'users-fill'],
  person: ['user-bold', 'user-fill'],
  pin: ['push-pin-bold', 'push-pin-fill'],
  place: ['map-pin-bold', 'map-pin-fill'],
  privacy: ['shield-check-bold', 'shield-check-fill'],
  school: ['graduation-cap-bold', 'graduation-cap-fill'],
  recent: ['clock-bold', 'clock-fill'],
  refresh: ['arrow-clockwise-bold', 'arrow-clockwise-bold'],
  restaurant: ['fork-knife-bold', 'fork-knife-fill'],
  search: ['magnifying-glass-bold', 'magnifying-glass-bold'],
  stop: ['stop-circle-bold', 'stop-circle-fill'],
  swap: ['arrows-down-up-bold', 'arrows-down-up-bold'],
  time: ['clock-bold', 'clock-fill'],
  transfer: ['arrows-left-right-bold', 'arrows-left-right-bold'],
  warning: ['warning-bold', 'warning-fill'],
  wheelchair: ['wheelchair-bold', 'wheelchair-fill'],
  work: ['briefcase-bold', 'briefcase-fill'],
} as const satisfies Record<string, readonly [PhosphorGlyphName, PhosphorGlyphName]>;

/** Icons kept from Ionicons, where its shape reads better than Phosphor's: [outline, filled]. */
const ioniconGlyphs = {
  crosshair: ['locate-outline', 'locate'],
  locate: ['locate-outline', 'locate'],
  map: ['map-outline', 'map'],
} as const satisfies Record<string, readonly [IoniconName, IoniconName]>;

/** Transit modes and walking, from Material Community Icons (picked for how clearly they read): [outline, filled]. */
const materialGlyphs = {
  bus: ['bus', 'bus'],
  calendar: ['calendar-month', 'calendar-month'],
  ferry: ['ferry', 'ferry'],
  rail: ['train', 'train'],
  snow: ['snowflake', 'snowflake'],
  subway: ['subway-variant', 'subway-variant'],
  travel: ['walk', 'walk'],
} as const satisfies Record<string, readonly [MaterialIconName, MaterialIconName]>;

export type IconName = keyof typeof glyphs | keyof typeof ioniconGlyphs | keyof typeof materialGlyphs;

type IconProps = {
  color?: string;
  /**
   * Pathly's icons are filled (solid, rounded shapes read better at small sizes and match the
   * mascot's look). Pass false only for an "off" state, like an unselected toggle.
   */
  filled?: boolean;
  name: IconName;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * An icon's SVG path data on a 256-unit square, for surfaces that draw an image rather than views
 * (the web map's saved-place markers). Null for the few icons drawn from a font instead.
 */
export function iconPaths(name: IconName, filled = true): readonly string[] | null {
  return name in glyphs ? phosphorGlyphs[glyphs[name as keyof typeof glyphs][filled ? 1 : 0]] : null;
}

export function Icon({ color, filled = true, name, size = 22, style, testID }: IconProps) {
  const { colors } = useTheme();
  const font = {
    accessibilityElementsHidden: true,
    color: color ?? colors.primary,
    importantForAccessibility: 'no-hide-descendants' as const,
    size,
    style: style as StyleProp<TextStyle>,
    testID,
  };
  if (name in materialGlyphs) {
    return <MaterialCommunityIcons {...font} name={materialGlyphs[name as keyof typeof materialGlyphs][filled ? 1 : 0]} />;
  }
  if (name in ioniconGlyphs) {
    return <Ionicons {...font} name={ioniconGlyphs[name as keyof typeof ioniconGlyphs][filled ? 1 : 0]} />;
  }
  return <PhosphorGlyph color={color ?? colors.primary} name={glyphs[name as keyof typeof glyphs][filled ? 1 : 0]} size={size} style={style} testID={testID} />;
}

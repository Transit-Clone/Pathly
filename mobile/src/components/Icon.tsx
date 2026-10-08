import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { useTheme } from '../theme/AppSettings';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const glyphs = {
  accessibility: ['accessibility-outline', 'accessibility'],
  alert: ['alert-circle-outline', 'alert-circle'],
  appearance: ['color-palette-outline', 'color-palette'],
  back: ['chevron-back', 'chevron-back'],
  bell: ['notifications-outline', 'notifications'],
  bus: ['bus-outline', 'bus'],
  close: ['close-circle', 'close-circle'],
  collapse: ['chevron-up', 'chevron-up'],
  crosshair: ['locate-outline', 'locate'],
  expand: ['chevron-down', 'chevron-down'],
  fare: ['pricetag-outline', 'pricetag'],
  favorite: ['star-outline', 'star'],
  filter: ['funnel-outline', 'funnel'],
  forward: ['chevron-forward', 'chevron-forward'],
  go: ['navigate-outline', 'navigate'],
  help: ['help-circle-outline', 'help-circle'],
  locate: ['navigate-outline', 'navigate'],
  modes: ['layers-outline', 'layers'],
  ok: ['checkmark-circle-outline', 'checkmark-circle'],
  person: ['person-outline', 'person'],
  place: ['location-outline', 'location'],
  privacy: ['shield-checkmark-outline', 'shield-checkmark'],
  rail: ['train-outline', 'train'],
  recent: ['time-outline', 'time'],
  refresh: ['refresh', 'refresh'],
  search: ['search', 'search'],
  stop: ['stop-circle-outline', 'stop-circle'],
  subway: ['subway-outline', 'subway'],
  swap: ['swap-vertical', 'swap-vertical'],
  time: ['time-outline', 'time'],
  travel: ['walk-outline', 'walk'],
} as const satisfies Record<string, readonly [IoniconName, IoniconName]>;

/** Glyphs Ionicons lacks, drawn from Material Community Icons (a true thumbtack for pinning). */
const materialGlyphs = {
  pin: ['pin-outline', 'pin'],
} as const satisfies Record<string, readonly [MaterialIconName, MaterialIconName]>;

export type IconName = keyof typeof glyphs | keyof typeof materialGlyphs;

type IconProps = {
  color?: string;
  filled?: boolean;
  name: IconName;
  size?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

export function Icon({ color, filled = false, name, size = 22, style, testID }: IconProps) {
  const { colors } = useTheme();
  const shared = {
    accessibilityElementsHidden: true,
    color: color ?? colors.primary,
    importantForAccessibility: 'no-hide-descendants' as const,
    size,
    style,
    testID,
  };
  if (name in materialGlyphs) {
    return <MaterialCommunityIcons {...shared} name={materialGlyphs[name as keyof typeof materialGlyphs][filled ? 1 : 0]} />;
  }
  return <Ionicons {...shared} name={glyphs[name as keyof typeof glyphs][filled ? 1 : 0]} />;
}

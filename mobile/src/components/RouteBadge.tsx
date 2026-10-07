import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';

export type TransitMode = 'subway' | 'bus' | 'rail';

export function transitModeForAgency(agency: string): TransitMode {
  if (agency === 'MTA Subway') return 'subway';
  if (agency === 'LIRR') return 'rail';
  return 'bus';
}

const modeLabels: Record<TransitMode, string> = { subway: 'train', bus: 'bus', rail: 'rail' };

const MAX_BADGE_LABEL = 4;
// LIRR publishes no route_short_name, so discovered branches carry their long name; these are the
// branches' customary two-letter codes (matching the demo catalog's "PJ").
const LIRR_BRANCH_CODES: Record<string, string> = {
  Babylon: 'BY',
  'Belmont Park': 'BP',
  'City Terminal Zone': 'CT',
  'Far Rockaway': 'FR',
  Greenport: 'GP',
  Hempstead: 'HM',
  'Long Beach': 'LB',
  Montauk: 'MK',
  'Oyster Bay': 'OB',
  'Port Jefferson': 'PJ',
  'Port Washington': 'PW',
  Ronkonkoma: 'RK',
  'West Hempstead': 'WH',
};

/**
 * A badge-sized label for a route: its short name when that is already short (`51`, `E`, `PJ`),
 * otherwise a code — LIRR's branch codes, or the initials of the name without "Branch"/"Line".
 */
export function badgeLabel(route: { agency: string; shortName: string }): string {
  if (route.shortName.length <= MAX_BADGE_LABEL) return route.shortName;
  const name = route.shortName.replace(/\s+(Branch|Line|Service)$/i, '').trim();
  if (route.agency === 'LIRR' && LIRR_BRANCH_CODES[name]) return LIRR_BRANCH_CODES[name];
  return name.split(/\s+/).map((word) => word[0]?.toUpperCase() ?? '').join('').slice(0, MAX_BADGE_LABEL);
}

const sizes = {
  small: { height: 28, fontSize: 12, icon: 13, padding: 7 },
  medium: { height: 36, fontSize: 14, icon: 15, padding: 9 },
  large: { height: 46, fontSize: 17, icon: 18, padding: 11 },
} as const;

type RouteBadgeProps = {
  agency: string;
  color: string;
  shortName: string;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  withModeIcon?: boolean;
};

export function RouteBadge({
  agency,
  color,
  shortName,
  size = 'medium',
  style,
  testID,
  withModeIcon = false,
}: RouteBadgeProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const mode = transitModeForAgency(agency);
  const metrics = sizes[size];
  const showIcon = mode === 'rail' || (mode === 'bus' && withModeIcon);

  return (
    <View
      accessibilityLabel={`${shortName} ${modeLabels[mode]}`}
      accessible={true}
      style={[
        styles.badge,
        { height: metrics.height, minWidth: metrics.height, backgroundColor: color },
        mode === 'subway' && { width: metrics.height, borderRadius: metrics.height / 2 },
        mode === 'bus' && { paddingHorizontal: metrics.padding, borderRadius: Math.round(metrics.height * 0.25) },
        mode === 'rail' && { paddingHorizontal: metrics.padding, borderRadius: 4 },
        style,
      ]}
      testID={testID}
    >
      {showIcon ? <Icon color={colors.white} filled={true} name={mode === 'rail' ? 'rail' : 'bus'} size={metrics.icon} /> : null}
      <Text style={[styles.text, { fontSize: metrics.fontSize }]}>{shortName}</Text>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    flexShrink: 0,
  },
  text: {
    color: colors.white,
    fontFamily: fontFamilies.extraBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

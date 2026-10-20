import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';

export type TransitMode = 'subway' | 'bus' | 'rail' | 'ferry';

export function transitModeForAgency(agency: string): TransitMode {
  if (agency === 'MTA Subway') return 'subway';
  if (agency === 'LIRR') return 'rail';
  if (agency === 'NYC Ferry' || agency === 'Staten Island Ferry') return 'ferry';
  return 'bus';
}

const modeLabels: Record<TransitMode, string> = { subway: 'train', bus: 'bus', rail: 'rail', ferry: 'ferry' };

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

// Single-word route codes up to this long are shown whole (`SIM3C`, `BxM10`, `Q44-SBS`): cutting
// one down to initials would name a different route.
const MAX_ROUTE_CODE = 7;

/**
 * A badge-sized label for a route: its short name when that is already short (`51`, `E`, `PJ`) or
 * a single route code (`SIM3C`), otherwise a code — LIRR's branch codes, or the initials of the
 * name without "Branch"/"Line".
 */
export function badgeLabel(route: { agency: string; shortName: string }): string {
  if (route.shortName.length <= MAX_BADGE_LABEL) return route.shortName;
  if (!/\s/.test(route.shortName) && route.shortName.length <= MAX_ROUTE_CODE) return route.shortName;
  const name = route.shortName.replace(/\s+(Branch|Line|Service)$/i, '').trim();
  if (route.agency === 'LIRR' && LIRR_BRANCH_CODES[name]) return LIRR_BRANCH_CODES[name];
  return name.split(/\s+/).map((word) => word[0]?.toUpperCase() ?? '').join('').slice(0, MAX_BADGE_LABEL);
}

/**
 * The MTA's peak-direction express variants (`6X`, `7X`, `FX`): the same line, signed as its
 * letter in a diamond rather than a circle. Returns the line it runs as, or null.
 */
export function subwayExpressLine(shortName: string): string | null {
  return /^[0-9A-Z]X$/.test(shortName) ? shortName[0]! : null;
}

const sizes = {
  small: { height: 28, fontSize: 12, icon: 13, padding: 7 },
  medium: { height: 36, fontSize: 14, icon: 15, padding: 9 },
  large: { height: 46, fontSize: 17, icon: 18, padding: 11 },
} as const;

type RouteBadgeProps = {
  agency: string;
  color: string;
  /** The vehicle mode, when the agency name alone can't tell (e.g. a planned trip's Google agency). */
  mode?: TransitMode;
  shortName: string;
  size?: keyof typeof sizes;
  /** Label color on the badge; white by default. */
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  withModeIcon?: boolean;
};

export function RouteBadge({
  agency,
  color,
  mode: modeOverride,
  shortName,
  size = 'medium',
  style,
  testID,
  textColor,
  withModeIcon = false,
}: RouteBadgeProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const mode = modeOverride ?? transitModeForAgency(agency);
  const metrics = sizes[size];
  // Ferries always carry the boat: with the pill shape, it's what sets them apart from buses.
  const showIcon = mode === 'rail' || mode === 'ferry' || (mode === 'bus' && withModeIcon);
  const expressLine = mode === 'subway' ? subwayExpressLine(shortName) : null;

  if (expressLine) {
    // A square turned 45° fills the same box as the line's circle; the letter stays upright.
    const side = Math.round(metrics.height / Math.SQRT2);
    return (
      <View
        accessibilityLabel={`${expressLine} express ${modeLabels[mode]}`}
        accessible={true}
        style={[styles.badge, { width: metrics.height, height: metrics.height }, style]}
        testID={testID}
      >
        <View style={[styles.diamond, { width: side, height: side, backgroundColor: color }]} />
        <Text style={[styles.text, { fontSize: metrics.fontSize }, textColor ? { color: textColor } : null]}>{expressLine}</Text>
      </View>
    );
  }

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
        mode === 'ferry' && { paddingHorizontal: metrics.padding, borderRadius: metrics.height / 2 },
        style,
      ]}
      testID={testID}
    >
      {showIcon ? <Icon color={textColor ?? colors.white} filled={true} name={mode === 'rail' ? 'rail' : mode === 'ferry' ? 'ferry' : 'bus'} size={metrics.icon} /> : null}
      <Text style={[styles.text, { fontSize: metrics.fontSize }, textColor ? { color: textColor } : null]}>{shortName}</Text>
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
  diamond: { position: 'absolute', borderRadius: 2, transform: [{ rotate: '45deg' }] },
  text: {
    color: colors.white,
    fontFamily: fontFamilies.extraBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

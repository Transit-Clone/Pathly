import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useRouteColor } from '../data/routeColors';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';

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

// Single-word route codes up to this long are shown whole (`SIM3C`, `BxM10`, `SIM10`): cutting
// one down to initials would name a different route.
const MAX_ROUTE_CODE = 7;

/**
 * A badge-sized label for a route: its short name when that is already short (`51`, `E`, `PJ`) or
 * a single route code (`SIM3C`), otherwise a code — LIRR's branch codes, or the initials of the
 * name without "Branch"/"Line".
 */
export function badgeLabel(route: { agency: string; shortName: string }): string {
  // Select Bus Service is signed the MTA's way: `M15+`, not `M15-SBS`.
  if (/-SBS$/i.test(route.shortName)) return `${route.shortName.replace(/-SBS$/i, '')}+`;
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
  small: { height: 28, fontSize: 12, padding: 7, alertDot: 14 },
  medium: { height: 36, fontSize: 14, padding: 9, alertDot: 15 },
  large: { height: 46, fontSize: 17, padding: 11, alertDot: 17 },
  // Route view's sign over its map: big enough to read at a glance, like the bus name beside it.
  xlarge: { height: 58, fontSize: 30, padding: 14, alertDot: 20 },
} as const;

type RouteBadgeProps = {
  agency: string;
  /** The line has service alerts: a small yellow dot at the badge's top right. */
  alert?: boolean;
  color: string;
  /** The vehicle mode, when the agency name alone can't tell (e.g. a planned trip's Google agency). */
  mode?: TransitMode;
  shortName: string;
  size?: keyof typeof sizes;
  /** Label color on the badge; white by default. */
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Whether a `#RRGGBB` color is light enough that white text on it is hard to read. */
function isLightColor(color: string): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 0.6;
}

export function RouteBadge({
  agency,
  alert = false,
  color,
  mode: modeOverride,
  shortName,
  size = 'medium',
  style,
  testID,
  textColor,
}: RouteBadgeProps) {
  const styles = useThemedStyles(createStyles);
  const routeColor = useRouteColor()(color);
  const mode = modeOverride ?? transitModeForAgency(agency);
  const metrics = sizes[size];
  const expressLine = mode === 'subway' ? subwayExpressLine(shortName) : null;
  // The MTA's own signs letter the yellow lines (N, Q, R, W) in black, whatever a feed says.
  const labelColor = mode === 'subway' && isLightColor(color) ? '#000000' : textColor;
  const alertLabel = alert ? ', has service alerts' : '';
  const alertDot = alert ? (
    <View style={[styles.alertDot, { width: metrics.alertDot, height: metrics.alertDot, borderRadius: metrics.alertDot / 2 }]} testID={testID ? `${testID}-alert` : 'route-badge-alert'}>
      <Text style={[styles.alertMark, { fontSize: metrics.alertDot - 5 }]}>!</Text>
    </View>
  ) : null;

  if (expressLine) {
    // A square turned 45° fills the same box as the line's circle; the letter stays upright.
    const side = Math.round(metrics.height / Math.SQRT2);
    return (
      <View
        accessibilityLabel={`${expressLine} express ${modeLabels[mode]}${alertLabel}`}
        accessible={true}
        style={[styles.badge, { width: metrics.height, height: metrics.height }, style]}
        testID={testID}
      >
        <View style={[styles.diamond, { width: side, height: side, backgroundColor: routeColor }]} />
        <Text style={[styles.text, { fontSize: metrics.fontSize }, labelColor ? { color: labelColor } : null]}>{expressLine}</Text>
        {alertDot}
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${shortName} ${modeLabels[mode]}${alertLabel}`}
      accessible={true}
      style={[
        styles.badge,
        { height: metrics.height, minWidth: metrics.height, backgroundColor: routeColor },
        mode === 'subway' && { width: metrics.height, borderRadius: metrics.height / 2 },
        // Only subway lines get the MTA's round sign; buses, trains and ferries share one text badge.
        mode !== 'subway' && { paddingHorizontal: metrics.padding, borderRadius: Math.round(metrics.height * 0.4) },
        style,
      ]}
      testID={testID}
    >
      <Text style={[styles.text, { fontSize: metrics.fontSize }, labelColor ? { color: labelColor } : null]}>{shortName}</Text>
      {alertDot}
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
  alertDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
    backgroundColor: colors.alertYellow,
  },
  alertMark: { color: colors.onAlertYellow, fontFamily: fontFamilies.extraBold, includeFontPadding: false },
  diamond: { position: 'absolute', borderRadius: 2, transform: [{ rotate: '45deg' }] },
  text: {
    color: colors.white,
    fontFamily: fontFamilies.extraBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

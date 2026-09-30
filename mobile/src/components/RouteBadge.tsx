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

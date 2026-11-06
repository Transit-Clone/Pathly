import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SystemNotice } from '../data/systemNotices';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

/** A small reminder under the home search bar for a holiday that changes service on every line (see useSystemNotice). */
export function SystemNoticeBanner({ notice, onDismiss, style }: { notice: SystemNotice; onDismiss: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, style]} testID="system-notice">
      <View accessibilityLabel={notice.accessibilityLabel} accessible={true} style={styles.copy}>
        <Icon color={colors.primary} name="calendar" size={15} />
        <Text numberOfLines={2} style={styles.text}>{notice.text}</Text>
      </View>
      <PressableScale accessibilityLabel="Dismiss reminder" accessibilityRole="button" hitSlop={8} onPress={onDismiss} style={styles.close} testID="system-notice-close">
        <Icon color={colors.mutedInk} name="close" size={14} />
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  banner: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 19,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  copy: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { minWidth: 0, flex: 1, color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 12 },
  close: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});

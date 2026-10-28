import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { savedPlaceColor } from '../data/savedPlacePin';
import type { Location } from '../data/userData';
import { useTheme } from '../theme/AppSettings';
import { Icon, type IconName } from './Icon';

/**
 * A saved place's badge as the rider styled it: its icon in white (black in dark mode) on its color (the brand blue
 * when none was picked), ringed in white (gray in dark mode). The map's pins draw the same badge, so a place looks
 * the same in search, the saved places row, settings, and on the map. `icon` is
 * SavedPlacesStrip's savedLocationIcon (passed in, as the strip draws this badge too).
 */
export function SavedPlaceBadge({ icon, location, size = 40, style, testID }: { icon: IconName; location: Location; size?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: savedPlaceColor(location, colors.primary), borderColor: colors.savedPlaceBorder }, style]} testID={testID}>
      <Icon color={colors.ring} name={icon} size={Math.round(size * 0.5)} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});

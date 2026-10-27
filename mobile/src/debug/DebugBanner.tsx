import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '../components/PressableScale';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { appNow, useDebug } from './DebugContext';
import { radii } from '../theme/shape';

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Which admin overrides are on, each with a way to turn it off. Renders nothing otherwise. */
export function DebugBanner({ top }: { top: number }) {
  const styles = useThemedStyles(createStyles);
  const { mockLocation, mockTime, setMockLocation, setMockTime } = useDebug();
  if (!mockLocation && !mockTime) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]} testID="debug-banner">
      {mockLocation ? (
        <View style={styles.pill}>
          <Text numberOfLines={1} style={styles.text}>{`Mock location · ${mockLocation.label}`}</Text>
          <PressableScale accessibilityLabel="Turn off mock location" accessibilityRole="button" hitSlop={8} onPress={() => setMockLocation(undefined)} testID="debug-banner-location-off">
            <Text style={styles.action}>Turn off</Text>
          </PressableScale>
        </View>
      ) : null}
      {mockTime ? (
        <View style={styles.pill}>
          <Text numberOfLines={1} style={styles.text}>{`Mock time · ${timeFormat.format(appNow())} · live times stay real`}</Text>
          <PressableScale accessibilityLabel="Turn off mock time" accessibilityRole="button" hitSlop={8} onPress={() => setMockTime(undefined)} testID="debug-banner-time-off">
            <Text style={styles.action}>Turn off</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 6, zIndex: 4 },
  pill: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.warning },
  text: { flexShrink: 1, color: '#1B1B1B', ...typography.metadata, fontFamily: fontFamilies.bold },
  action: { color: '#1B1B1B', fontFamily: fontFamilies.extraBold, fontSize: 13, textDecorationLine: 'underline' },
});

import { StyleSheet, Text, View } from 'react-native';

import type { TripLegNote } from '../data/tripLive';
import { useTheme } from '../theme/AppSettings';
import { fontFamilies } from '../theme/typography';

/** A live note on a trip ("Live · 2 min late", "Cancelled"), tinted by how much it matters. */
export function TripNotePill({ note, testID }: { note: TripLegNote; testID?: string }) {
  const { colors } = useTheme();
  const [ink, fill] = note.tone === 'danger' ? [colors.red, colors.redSoft] : note.tone === 'warning' ? [colors.warning, colors.amberSoft] : [colors.success, colors.greenSoft];
  return (
    <View accessibilityLabel={note.text} accessible={true} style={[styles.pill, { backgroundColor: fill }]} testID={testID}>
      <View style={[styles.dot, { backgroundColor: ink }]} />
      <Text numberOfLines={1} style={[styles.text, { color: ink }]}>{note.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, maxWidth: '100%' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flexShrink: 1, fontFamily: fontFamilies.extraBold, fontSize: 11 },
});

import { Modal, StyleSheet, Text, View } from 'react-native';

import { findLabeledLocation, type SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { radii } from '../theme/shape';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';

const ROWS = [
  { label: 'Home', icon: 'home' },
  { label: 'Work', icon: 'work' },
  { label: 'School', icon: 'school' },
] as const;

type SetPlacesPromptProps = {
  places: readonly SavedLocation[];
  onSet: (label: (typeof ROWS)[number]['label']) => void;
  onDone: () => void;
};

/** A new account's first stop: where home and work or school are, each optional. */
export function SetPlacesPrompt({ onDone, onSet, places }: SetPlacesPromptProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const anySet = ROWS.some((row) => findLabeledLocation(places, row.label));
  return (
    <Modal animationType="fade" onRequestClose={onDone} statusBarTranslucent={true} transparent={true} visible={true}>
      <View style={styles.center}>
        <View accessibilityViewIsModal={true} style={styles.card} testID="set-places-prompt">
          <Mascot mood="happy" size={56} style={styles.mascot} />
          <Text style={styles.title}>Where do you usually go?</Text>
          <Text style={styles.body}>Add your places and they&apos;re one tap from a trip. You can change them anytime in Favorites.</Text>
          {ROWS.map((row) => {
            const saved = findLabeledLocation(places, row.label);
            return (
              <PressableScale accessibilityRole="button" key={row.label} onPress={() => onSet(row.label)} style={styles.row} testID={`set-places-${row.label.toLowerCase()}`}>
                <View style={styles.rowIcon}><Icon color={colors.primary} name={row.icon} size={19} /></View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{row.label}</Text>
                  <Text numberOfLines={1} style={styles.rowDetail}>{saved ? saved.address.name : `Set your ${row.label.toLowerCase()} address`}</Text>
                </View>
                <Icon color={saved ? colors.primary : colors.mutedInk} name={saved ? 'check' : 'forward'} size={20} />
              </PressableScale>
            );
          })}
          <PressableScale accessibilityRole="button" onPress={onDone} style={[styles.done, anySet && styles.doneFilled]} testID="set-places-done">
            <Text style={anySet ? styles.doneFilledText : styles.doneText}>{anySet ? 'Done' : 'Skip for now'}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, backgroundColor: colors.scrim },
  card: { width: '100%', maxWidth: 380, padding: 20, borderRadius: radii.card, backgroundColor: colors.surface },
  mascot: { marginBottom: 10 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  body: { marginTop: 6, marginBottom: 10, color: colors.mutedInk, ...typography.metadata },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.blueSoft },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  rowDetail: { color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  done: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: radii.pill },
  doneFilled: { backgroundColor: colors.primary },
  doneText: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 15 },
  doneFilledText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SAVED_PLACE_COLOR_HEX } from '../data/savedPlacePin';
import type { SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { SavedPlaceBadge } from './SavedPlaceBadge';
import { savedLocationIcon, savedPlaceLines } from './SavedPlacesStrip';
import { radii } from '../theme/shape';

type SavedPlaceDetailsSheetProps = {
  /** The places under the tapped marker (several when markers are stacked); empty hides the sheet. */
  places: readonly SavedLocation[];
  onClose: () => void;
  onGo: (place: SavedLocation) => void;
  /** Opens the place's name, list, icon and color to change; left out, there's no Edit button. */
  onEdit?: (place: SavedLocation) => void;
};

/**
 * What a saved place's map marker opens: its name, list and address, Edit to restyle it, and Go to
 * plan a trip there.
 * Tapping a marker never starts a trip by itself, so a stray tap (or a tap on a stack of markers)
 * costs nothing; a stack lists every place in it, each with its own Go.
 */
export function SavedPlaceDetailsSheet({ onClose, onEdit, onGo, places }: SavedPlaceDetailsSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const stacked = places.length > 1;
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent={true} transparent={true} visible={places.length > 0}>
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} testID="saved-place-details-backdrop" />
        <View accessibilityViewIsModal={true} style={styles.sheet} testID="saved-place-details">
          <View style={styles.header}>
            <Text style={styles.heading}>{stacked ? `${places.length} saved places here` : 'Saved place'}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="saved-place-details-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <ScrollView bounces={false} style={styles.list}>
            {places.map((place) => {
              const { title, subtitle } = savedPlaceLines(place);
              const color = place.address.color ? SAVED_PLACE_COLOR_HEX[place.address.color] : colors.primary;
              const group = place.address.group?.trim();
              return (
                <View key={place.id} style={styles.row} testID={`saved-place-details-${place.id}`}>
                  <SavedPlaceBadge icon={savedLocationIcon(place.address)} location={place.address} />
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.name}>{title}</Text>
                    {group ? <Text numberOfLines={1} style={[styles.group, { color }]}>{group}</Text> : null}
                    {subtitle ? <Text numberOfLines={2} style={styles.address}>{subtitle}</Text> : null}
                  </View>
                  {onEdit ? (
                    <PressableScale
                      accessibilityHint="Change its name, list, icon or color"
                      accessibilityLabel={`Edit ${title}`}
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={() => onEdit(place)}
                      style={styles.edit}
                      testID={`saved-place-details-edit-${place.id}`}
                    >
                      <Icon color={colors.ink} name="edit" size={20} />
                    </PressableScale>
                  ) : null}
                  <PressableScale
                    accessibilityHint="Plans a trip to this saved place"
                    accessibilityLabel={`Go to ${title}`}
                    accessibilityRole="button"
                    onPress={() => onGo(place)}
                    style={styles.go}
                    testID={`saved-place-details-go-${place.id}`}
                  >
                    <Icon color={colors.onPrimary} name="go" size={16} />
                    <Text style={styles.goText}>Go</Text>
                  </PressableScale>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 540, maxHeight: '70%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  heading: { flex: 1, color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  copy: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  group: { marginTop: 1, fontFamily: fontFamilies.bold, fontSize: 12 },
  address: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  edit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surfaceMuted },
  go: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary },
  goText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});

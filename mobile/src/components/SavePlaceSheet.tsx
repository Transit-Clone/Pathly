import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SearchPlace } from '../data/placesSearch';
import { MAX_PLACE_LABEL, SAVED_PLACE_ICONS, type SavedPlaceIcon } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { savedPlaceIcon } from './SavedPlacesStrip';

const QUICK_NAMES = ['Home', 'Work'] as const;
const ICON_NAMES: Record<SavedPlaceIcon, string> = {
  home: 'Home', work: 'Work', school: 'School', place: 'Pin', favorite: 'Star', heart: 'Heart', cafe: 'Cafe',
  restaurant: 'Restaurant', cart: 'Shopping', fitness: 'Gym', people: 'Friends and family', medical: 'Medical',
};

/** Opens the sheet: saving a new place, or editing (renaming, re-iconing, removing) a saved one. */
export type SavePlaceRequest = {
  place: SearchPlace;
  label?: string;
  icon?: SavedPlaceIcon;
  /** Editing an already-saved place: the sheet offers Remove. */
  editing?: boolean;
};

type SavePlaceSheetProps = {
  /** The sheet is shown while this is set. */
  request: SavePlaceRequest | null;
  onCancel: () => void;
  /** `icon` is set only when the rider picked one; otherwise the icon follows the name. */
  onSave: (label: string, icon: SavedPlaceIcon | undefined) => void;
  onRemove?: () => void;
};

/** Names a saved place and picks its icon: Home, Work, or the rider's own name and icon. */
export function SavePlaceSheet({ onCancel, onRemove, onSave, request }: SavePlaceSheetProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent={true} transparent={true} visible={request != null}>
      <View style={styles.center}>
        <Pressable accessibilityLabel="Cancel" onPress={onCancel} style={StyleSheet.absoluteFill} testID="save-place-backdrop" />
        {/* Keyed by its place, so each request starts the form afresh. */}
        {request ? <SavePlaceForm key={request.place.id} onCancel={onCancel} onRemove={onRemove} onSave={onSave} request={request} /> : null}
      </View>
    </Modal>
  );
}

function SavePlaceForm({ onCancel, onRemove, onSave, request }: SavePlaceSheetProps & { request: SavePlaceRequest }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [name, setName] = useState((request.label ?? request.place.title).slice(0, MAX_PLACE_LABEL));
  const [pickedIcon, setPickedIcon] = useState<SavedPlaceIcon | undefined>(request.icon);
  const label = name.trim();
  const derived = savedPlaceIcon(label);
  // Until one is picked, the icon follows the name ("Home" shows a house).
  const shownIcon: SavedPlaceIcon = pickedIcon ?? (SAVED_PLACE_ICONS.find((icon) => icon === derived) ?? 'place');
  const { place } = request;

  return (
    <View accessibilityViewIsModal={true} style={styles.card} testID="save-place-sheet">
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{request.editing ? 'Edit saved place' : 'Save place'}</Text>
        <Text numberOfLines={1} style={styles.placeName}>{place.title}</Text>
        {place.subtitle ? <Text numberOfLines={1} style={styles.placeAddress}>{place.subtitle}</Text> : null}

        <Text style={styles.fieldLabel}>NAME</Text>
        <View style={styles.quickNames}>
          {QUICK_NAMES.map((quick) => {
            const selected = label.toLowerCase() === quick.toLowerCase();
            return (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={quick}
                onPress={() => setName(quick)}
                style={[styles.quickName, selected && styles.quickNameSelected]}
                testID={`save-place-${quick.toLowerCase()}`}
              >
                <Icon color={selected ? colors.onPrimary : colors.primary} filled={true} name={quick === 'Home' ? 'home' : 'work'} size={16} />
                <Text style={[styles.quickNameText, selected && styles.quickNameTextSelected]}>{quick}</Text>
              </PressableScale>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Name for this place"
          maxLength={MAX_PLACE_LABEL}
          onChangeText={setName}
          placeholder="Name, like Gym"
          placeholderTextColor={colors.mutedInk}
          returnKeyType="done"
          selectionColor={colors.blue}
          style={styles.input}
          testID="save-place-name"
          value={name}
        />

        <Text style={styles.fieldLabel}>ICON</Text>
        <View accessibilityRole="radiogroup" style={styles.icons}>
          {SAVED_PLACE_ICONS.map((icon) => {
            const selected = icon === shownIcon;
            return (
              <PressableScale
                accessibilityLabel={ICON_NAMES[icon]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={icon}
                onPress={() => setPickedIcon(icon)}
                style={[styles.iconChoice, selected && styles.iconChoiceSelected]}
                testID={`save-place-icon-${icon}`}
              >
                <Icon color={selected ? colors.onPrimary : colors.primary} filled={true} name={icon} size={20} />
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.actions}>
          <PressableScale accessibilityRole="button" onPress={onCancel} style={[styles.button, styles.cancelButton]} testID="save-place-cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ disabled: !label }}
            disabled={!label}
            onPress={() => onSave(label, pickedIcon)}
            style={[styles.button, styles.confirmButton, !label && styles.disabled]}
            testID="save-place-confirm"
          >
            <Text style={styles.confirmText}>Save</Text>
          </PressableScale>
        </View>
        {request.editing && onRemove ? (
          <PressableScale accessibilityRole="button" onPress={onRemove} style={styles.remove} testID="save-place-remove">
            <Text style={styles.removeText}>Remove from saved places</Text>
          </PressableScale>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, backgroundColor: colors.scrim },
  card: { width: '100%', maxWidth: 380, maxHeight: '100%', padding: 20, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  placeName: { marginTop: 8, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  placeAddress: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  fieldLabel: { marginTop: 18, marginBottom: 8, color: colors.mutedInk, ...typography.label },
  quickNames: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickName: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  quickNameSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  quickNameText: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  quickNameTextSelected: { color: colors.onPrimary },
  input: { minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, backgroundColor: colors.background, fontFamily: fontFamilies.semibold, fontSize: 15 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.blueSoft },
  iconChoiceSelected: { backgroundColor: colors.primary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  button: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  cancelButton: { backgroundColor: colors.background },
  confirmButton: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  cancelText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  confirmText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  remove: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
  removeText: { color: colors.red, ...typography.bodyStrong, fontSize: 14 },
});

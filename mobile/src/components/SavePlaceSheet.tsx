import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SearchPlace } from '../data/placesSearch';
import { SAVED_PLACE_COLOR_HEX } from '../data/savedPlacePin';
import { MAX_GROUP_NAME, MAX_PLACE_LABEL, SAVED_PLACE_COLORS, SAVED_PLACE_ICONS, type SavedPlaceColor, type SavedPlaceIcon, type SavedPlaceStyle } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { savedPlaceIcon } from './SavedPlacesStrip';
import { radii } from '../theme/shape';

const QUICK_NAMES = ['Home', 'Work'] as const;
const ICON_NAMES: Record<SavedPlaceIcon, string> = {
  home: 'Home', work: 'Work', school: 'School', place: 'Pin', favorite: 'Star', heart: 'Heart', cafe: 'Cafe',
  restaurant: 'Restaurant', cart: 'Shopping', fitness: 'Gym', people: 'Friends and family', medical: 'Medical',
};

const COLOR_NAMES: Record<SavedPlaceColor, string> = {
  blue: 'Blue', red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', purple: 'Purple', pink: 'Pink', gray: 'Gray',
};

/** A list the rider files saved places under, with the look its places share. */
export type SavedPlaceGroup = { name: string; icon?: SavedPlaceIcon; color?: SavedPlaceColor; count: number };

/** Opens the sheet: saving a new place, or editing (renaming, re-iconing, moving, removing) a saved one. */
export type SavePlaceRequest = {
  place: SearchPlace;
  label?: string;
  style?: SavedPlaceStyle;
  /** Editing an already-saved place: the sheet offers Change address and Remove. */
  editing?: boolean;
  /** The saved place this one replaces, once the rider picked a new address for it. */
  replacing?: string;
};

type SavePlaceSheetProps = {
  /** The sheet is shown while this is set. */
  request: SavePlaceRequest | null;
  /** The rider's lists, to file this place under one. */
  groups?: readonly SavedPlaceGroup[];
  onCancel: () => void;
  /** `style.icon` is set only when the rider picked one (or joined a list); otherwise the icon follows the name. */
  onSave: (label: string, style: SavedPlaceStyle) => void;
  onRemove?: () => void;
  /** Searches for a new address for the place being edited, keeping what's entered so far. */
  onChangeAddress?: (draft: SavePlaceRequest) => void;
};

/** Names a saved place and picks its icon: Home, Work, or the rider's own name and icon. */
export function SavePlaceSheet({ groups = [], onCancel, onChangeAddress, onRemove, onSave, request }: SavePlaceSheetProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent={true} transparent={true} visible={request != null}>
      <View style={styles.center}>
        <Pressable accessibilityLabel="Cancel" onPress={onCancel} style={StyleSheet.absoluteFill} testID="save-place-backdrop" />
        {/* Keyed by its place, so each request starts the form afresh. */}
        {request ? <SavePlaceForm groups={groups} key={request.place.id} onCancel={onCancel} onChangeAddress={onChangeAddress} onRemove={onRemove} onSave={onSave} request={request} /> : null}
      </View>
    </Modal>
  );
}

function SavePlaceForm({ groups = [], onCancel, onChangeAddress, onRemove, onSave, request }: SavePlaceSheetProps & { request: SavePlaceRequest }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [name, setName] = useState((request.label ?? request.place.title).slice(0, MAX_PLACE_LABEL));
  const [pickedIcon, setPickedIcon] = useState<SavedPlaceIcon | undefined>(request.style?.icon);
  const [pickedColor, setPickedColor] = useState<SavedPlaceColor | undefined>(request.style?.color);
  const [group, setGroup] = useState<string | undefined>(request.style?.group);
  // Typing a new list's name; null while choosing among the lists already made.
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const label = name.trim();
  const derived = savedPlaceIcon(label);
  // Until one is picked, the icon follows the name ("Home" shows a house).
  const shownIcon: SavedPlaceIcon = pickedIcon ?? (SAVED_PLACE_ICONS.find((icon) => icon === derived) ?? 'place');
  const shownColor = pickedColor ?? 'blue';
  const { place } = request;
  const groupName = (newGroup ?? group ?? '').trim() || undefined;
  const sameGroup = (other: string) => other.toLowerCase() === groupName?.toLowerCase();
  // Other places already in the chosen list, which take on this place's icon and color with it.
  const groupOthers = Math.max(0, (groups.find((entry) => sameGroup(entry.name))?.count ?? 0) - (request.editing && request.style?.group && sameGroup(request.style.group) ? 1 : 0));
  const chooseGroup = (entry: SavedPlaceGroup | null) => {
    setNewGroup(null);
    setGroup(entry?.name);
    // Joining a list takes its look, so its places read as one at a glance.
    if (entry?.icon) setPickedIcon(entry.icon);
    if (entry?.color) setPickedColor(entry.color);
  };
  const save = () => onSave(label, {
    // A place in a list keeps an explicit icon, so the whole list shares it.
    icon: groupName ? shownIcon : pickedIcon,
    color: pickedColor,
    group: groupName,
  });

  return (
    <View accessibilityViewIsModal={true} style={styles.card} testID="save-place-sheet">
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{request.editing ? 'Edit favorite' : 'Add favorite'}</Text>
        <Text numberOfLines={1} style={styles.placeName}>{place.title}</Text>
        {place.subtitle ? <Text numberOfLines={2} style={styles.placeAddress}>{place.subtitle}</Text> : null}
        {request.editing && onChangeAddress ? (
          <PressableScale
            accessibilityHint="Searches for a new address for this favorite"
            accessibilityRole="button"
            onPress={() => onChangeAddress({ ...request, label: name, style: { icon: pickedIcon, color: pickedColor, group: groupName } })}
            style={styles.changeAddress}
            testID="save-place-change-address"
          >
            <Icon color={colors.primary} name="edit" size={16} />
            <Text style={styles.changeAddressText}>Change address</Text>
          </PressableScale>
        ) : null}

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
                <Icon color={selected ? colors.onPrimary : colors.primary} name={quick === 'Home' ? 'home' : 'work'} size={16} />
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

        <Text style={styles.fieldLabel}>LIST <Text style={styles.optional}>(optional)</Text></Text>
        <ScrollView contentContainerStyle={styles.groups} horizontal={true} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
          {[null, ...groups].map((entry) => {
            const selected = newGroup == null && (entry ? group != null && entry.name.toLowerCase() === group.toLowerCase() : group == null);
            return (
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={entry?.name ?? 'none'}
                onPress={() => chooseGroup(entry)}
                style={[styles.groupChip, selected && styles.groupChipSelected]}
                testID={entry ? `save-place-group-${entry.name}` : 'save-place-group-none'}
              >
                {entry ? <Icon color={selected ? colors.onPrimary : entry.color ? SAVED_PLACE_COLOR_HEX[entry.color] : colors.primary} name={entry.icon ?? 'place'} size={15} /> : null}
                <Text style={[styles.groupChipText, selected && styles.groupChipTextSelected]}>{entry ? entry.name : 'None'}</Text>
              </PressableScale>
            );
          })}
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ selected: newGroup != null }}
            onPress={() => setNewGroup('')}
            style={[styles.groupChip, styles.groupChipNew, newGroup != null && styles.groupChipSelected]}
            testID="save-place-group-new"
          >
            <Icon color={newGroup != null ? colors.onPrimary : colors.primary} name="add" size={15} />
            <Text style={[styles.groupChipText, newGroup != null && styles.groupChipTextSelected]}>New list</Text>
          </PressableScale>
        </ScrollView>
        {newGroup != null ? (
          <TextInput
            accessibilityLabel="Name for the new list"
            autoFocus={true}
            maxLength={MAX_GROUP_NAME}
            onChangeText={setNewGroup}
            placeholder="List name, like Restaurants"
            placeholderTextColor={colors.mutedInk}
            returnKeyType="done"
            selectionColor={colors.blue}
            style={[styles.input, styles.groupInput]}
            testID="save-place-group-name"
            value={newGroup}
          />
        ) : null}
        {groupName && groupOthers > 0 ? (
          <Text style={styles.groupNote} testID="save-place-group-note">
            {`The icon and color apply to all ${groupOthers + 1} places in ${groupName}.`}
          </Text>
        ) : null}

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
                style={[styles.iconChoice, selected && { backgroundColor: SAVED_PLACE_COLOR_HEX[shownColor] }]}
                testID={`save-place-icon-${icon}`}
              >
                <Icon color={selected ? colors.white : colors.primary} name={icon} size={20} />
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>COLOR</Text>
        <View accessibilityRole="radiogroup" style={styles.icons}>
          {SAVED_PLACE_COLORS.map((color) => {
            const selected = color === shownColor;
            return (
              <PressableScale
                accessibilityLabel={COLOR_NAMES[color]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={color}
                onPress={() => setPickedColor(color)}
                style={[styles.colorChoice, selected && { borderColor: SAVED_PLACE_COLOR_HEX[color] }]}
                testID={`save-place-color-${color}`}
              >
                <View style={[styles.colorSwatch, { backgroundColor: SAVED_PLACE_COLOR_HEX[color] }]}>
                  {selected ? <Icon color={colors.white} name="check" size={16} /> : null}
                </View>
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
            onPress={save}
            style={[styles.button, styles.confirmButton, !label && styles.disabled]}
            testID="save-place-confirm"
          >
            <Text style={styles.confirmText}>Save</Text>
          </PressableScale>
        </View>
        {request.editing && onRemove ? (
          <PressableScale accessibilityRole="button" onPress={onRemove} style={styles.remove} testID="save-place-remove">
            <Text style={styles.removeText}>Remove from favorites</Text>
          </PressableScale>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, backgroundColor: colors.scrim },
  card: { width: '100%', maxWidth: 380, maxHeight: '100%', padding: 20, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  placeName: { marginTop: 8, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  placeAddress: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  changeAddress: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.blueSoft },
  changeAddressText: { color: colors.primary, ...typography.bodyStrong, fontSize: 13 },
  optional: { color: colors.mutedInk, fontFamily: fontFamilies.semibold, letterSpacing: 0 },
  groups: { gap: 8, paddingRight: 4 },
  groupChip: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  groupChipNew: { borderStyle: 'dashed' },
  groupChipSelected: { borderColor: colors.primary, borderStyle: 'solid', backgroundColor: colors.primary },
  groupChipText: { color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  groupChipTextSelected: { color: colors.onPrimary },
  groupInput: { marginTop: 10 },
  groupNote: { marginTop: 8, color: colors.mutedInk, ...typography.metadata, fontSize: 12 },
  colorChoice: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 20 },
  colorSwatch: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  fieldLabel: { marginTop: 18, marginBottom: 8, color: colors.mutedInk, ...typography.label },
  quickNames: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickName: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  quickNameSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  quickNameText: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  quickNameTextSelected: { color: colors.onPrimary },
  input: { minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, color: colors.ink, backgroundColor: colors.background, fontFamily: fontFamilies.semibold, fontSize: 15 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.blueSoft },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  button: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  cancelButton: { backgroundColor: colors.background },
  confirmButton: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  cancelText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  confirmText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  remove: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
  removeText: { color: colors.red, ...typography.bodyStrong, fontSize: 14 },
});

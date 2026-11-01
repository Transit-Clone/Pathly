import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { RoutePreference } from '../data/transit';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { radii } from '../theme/shape';
import { typography } from '../theme/typography';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import type { TransitMode } from './RouteBadge';

type Option<Id> = { id: Id; label: string; icon: IconName };

function OptionsSheet({ children, onClose, testID, title }: { children: ReactNode; onClose: () => void; testID: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent={true} transparent={true} visible={true}>
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} testID={`${testID}-backdrop`} />
        <View accessibilityViewIsModal={true} style={styles.sheet} testID={testID}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID={`${testID}-close`}><Icon name="close" size={26} /></PressableScale>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Route Results' modes: every one starts on, and switching one off leaves it out of the results. */
export function ModesSheet({ enabled, modes, onClose, onToggle }: { enabled: readonly TransitMode[]; modes: readonly Option<TransitMode>[]; onClose: () => void; onToggle: (mode: TransitMode) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <OptionsSheet onClose={onClose} testID="modes-panel" title="Modes">
      {modes.map((mode) => {
        const on = enabled.includes(mode.id);
        return (
          // The whole row is the control, so the switch only shows its state.
          <Pressable
            key={mode.id}
            accessibilityLabel={`${mode.label} routes`}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(mode.id)}
            style={styles.row}
            testID={`mode-${mode.id}`}
          >
            <View style={styles.iconCircle}><Icon color={colors.primary} name={mode.icon} size={18} /></View>
            <Text style={styles.rowText}>{mode.label}</Text>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden={true} pointerEvents="none"><Switch value={on} /></View>
          </Pressable>
        );
      })}
      {enabled.length === 1 ? <Text style={styles.note} testID="modes-last-note">Keep at least one mode on.</Text> : null}
    </OptionsSheet>
  );
}

/** Route Results' sort: picking one applies it and closes, so changing it takes one tap. */
export function FiltersSheet({ onClose, onSelect, options, selected }: { onClose: () => void; onSelect: (preference: RoutePreference) => void; options: readonly Option<RoutePreference>[]; selected: RoutePreference }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <OptionsSheet onClose={onClose} testID="filter-panel" title="Filters">
      {options.map((option) => {
        const on = option.id === selected;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(option.id)}
            style={styles.row}
            testID={`preference-${option.id}`}
          >
            <View style={[styles.iconCircle, on && styles.iconCircleOn]}><Icon color={on ? colors.onPrimary : colors.primary} name={option.icon} size={18} /></View>
            <Text style={[styles.rowText, on && styles.rowTextOn]}>{option.label}</Text>
            {on ? <Icon color={colors.primary} name="check" size={20} /> : null}
          </Pressable>
        );
      })}
    </OptionsSheet>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  title: { flex: 1, color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.blueSoft },
  iconCircleOn: { backgroundColor: colors.primary },
  rowText: { flex: 1, minWidth: 0, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  rowTextOn: { color: colors.primary },
  note: { marginTop: 10, color: colors.mutedInk, ...typography.metadata },
});

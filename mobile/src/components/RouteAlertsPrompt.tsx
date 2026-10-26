import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_ALERT_HOURS, formatAlertTime, parseAlertTime, ROUTE_ALERT_OPTIONS, type AlertHours, type RouteAlertSetting } from '../data/savedRoutes';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

/** What the sheet is asking about: a line's alert setting, from route view's bell. */
export type RouteAlertsRequest = {
  /** The line's saved id ("lirr:10"). */
  id: string;
  setting: RouteAlertSetting;
  hours?: AlertHours;
};

type RouteAlertsPromptProps = {
  /** Null hides the sheet. */
  request: RouteAlertsRequest | null;
  onDone: (setting: RouteAlertSetting, hours: AlertHours | undefined) => void;
  onClose: () => void;
};

/**
 * When should Pathly push a line's service alerts: All times, Never (the default), or the rider's
 * own hours, typed in. Opened from route view's bell, whether or not the line is a favorite.
 */
export function RouteAlertsPrompt({ onClose, onDone, request }: RouteAlertsPromptProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent={true} transparent={true} visible={request != null}>
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} testID="route-alerts-prompt-backdrop" />
        {/* Keyed by its line, so each opening starts from that line's setting. */}
        {request ? <AlertsForm key={request.id} onClose={onClose} onDone={onDone} request={request} /> : null}
      </View>
    </Modal>
  );
}

function AlertsForm({ onClose, onDone, request }: RouteAlertsPromptProps & { request: RouteAlertsRequest }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // A line saved with the old weekday-rush setting shows as custom hours to adjust.
  const [setting, setSetting] = useState<RouteAlertSetting>(request.setting === 'peak' ? 'custom' : request.setting);
  const initialHours = request.hours ?? DEFAULT_ALERT_HOURS;
  // What's typed in each field; read as a time when it's left, and again on Done.
  const [typed, setTyped] = useState({ start: formatAlertTime(initialHours.start), end: formatAlertTime(initialHours.end) });
  const [hours, setHours] = useState<AlertHours>(initialHours);
  const read = (field: keyof AlertHours): number => parseAlertTime(typed[field]) ?? hours[field];
  // A time that doesn't read goes back to the last good one.
  const settle = (field: keyof AlertHours) => {
    const minutes = read(field);
    setHours((current) => ({ ...current, [field]: minutes }));
    setTyped((current) => ({ ...current, [field]: formatAlertTime(minutes) }));
  };

  return (
    <View accessibilityViewIsModal={true} style={styles.sheet} testID="route-alerts-prompt">
      <View style={styles.header}>
        <Icon color={colors.primary} filled={true} name="bell" size={26} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Service alerts</Text>
        </View>
        <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="route-alerts-prompt-close"><Icon name="close" size={26} /></PressableScale>
      </View>
      <Text style={styles.label}>NOTIFY ME</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {ROUTE_ALERT_OPTIONS.map((option) => {
          const selected = option.value === setting;
          return (
            <PressableScale
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => setSetting(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
              testID={`route-alerts-prompt-${option.value}`}
            >
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
            </PressableScale>
          );
        })}
      </View>
      {setting === 'custom' ? (
        <View style={styles.hours} testID="route-alerts-hours">
          {(['start', 'end'] as const).map((field) => (
            <View key={field} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{field === 'start' ? 'From' : 'To'}</Text>
              <TextInput
                accessibilityHint="Type a time, like 7:30 AM"
                accessibilityLabel={field === 'start' ? 'Alerts from' : 'Alerts until'}
                autoCapitalize="none"
                autoCorrect={false}
                onBlur={() => settle(field)}
                onChangeText={(text) => setTyped((current) => ({ ...current, [field]: text }))}
                onSubmitEditing={() => settle(field)}
                placeholder="7:30 AM"
                placeholderTextColor={colors.mutedInk}
                returnKeyType="done"
                selectTextOnFocus={true}
                style={styles.hourInput}
                testID={`route-alerts-${field}`}
                value={typed[field]}
              />
            </View>
          ))}
        </View>
      ) : null}
      <PressableScale accessibilityRole="button" onPress={() => onDone(setting, setting === 'custom' ? { start: read('start'), end: read('end') } : undefined)} style={styles.done} testID="route-alerts-prompt-done">
        <Text style={styles.doneText}>Done</Text>
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  label: { marginTop: 18, marginBottom: 8, color: colors.mutedInk, ...typography.label },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionLabel: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, textAlign: 'center' },
  optionLabelSelected: { color: colors.onPrimary },
  hours: { gap: 8, marginTop: 14 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.background },
  hourLabel: { width: 44, color: colors.mutedInk, ...typography.bodyStrong, fontSize: 14 },
  hourInput: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 17, textAlign: 'center' },
  done: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: 24, backgroundColor: colors.primary },
  doneText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 16 },
});

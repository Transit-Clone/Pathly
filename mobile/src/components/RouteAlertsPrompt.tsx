import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_ALERT_HOURS, formatAlertTime, ROUTE_ALERT_OPTIONS, type AlertHours, type RouteAlertSetting } from '../data/savedRoutes';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';

/** Custom hours move in half-hour steps. */
const STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

/** What the sheet is asking about: a line just saved, or a saved line's bell in route view. */
export type RouteAlertsRequest = {
  /** The line's name ("1 train", "Port Jefferson Branch"). */
  name: string;
  setting: RouteAlertSetting;
  hours?: AlertHours;
  /** Just saved: the sheet says so. */
  isNew: boolean;
};

type RouteAlertsPromptProps = {
  /** Null hides the sheet. */
  request: RouteAlertsRequest | null;
  onDone: (setting: RouteAlertSetting, hours: AlertHours | undefined) => void;
  onClose: () => void;
};

/**
 * When should Pathly push a saved line's service alerts: All times, Never (the default), or the
 * rider's own hours. Asked once right after a line is saved, and again from route view's bell.
 */
export function RouteAlertsPrompt({ onClose, onDone, request }: RouteAlertsPromptProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent={true} transparent={true} visible={request != null}>
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} testID="route-alerts-prompt-backdrop" />
        {/* Keyed by its line, so each opening starts from that line's setting. */}
        {request ? <AlertsForm key={`${request.name}-${request.isNew}`} onClose={onClose} onDone={onDone} request={request} /> : null}
      </View>
    </Modal>
  );
}

function AlertsForm({ onClose, onDone, request }: RouteAlertsPromptProps & { request: RouteAlertsRequest }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // A line saved with the old weekday-rush setting shows as custom hours to adjust.
  const [setting, setSetting] = useState<RouteAlertSetting>(request.setting === 'peak' ? 'custom' : request.setting);
  const [hours, setHours] = useState<AlertHours>(request.hours ?? DEFAULT_ALERT_HOURS);
  const step = (field: keyof AlertHours, by: number) => setHours((current) => ({ ...current, [field]: (current[field] + by + DAY_MINUTES) % DAY_MINUTES }));

  return (
    <View accessibilityViewIsModal={true} style={styles.sheet} testID="route-alerts-prompt">
      <View style={styles.header}>
        {request.isNew ? <Mascot pose="happy" size={40} /> : <Icon color={colors.primary} filled={true} name="bell" size={26} />}
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{request.isNew ? 'This line is now in your favorites' : 'Service alerts'}</Text>
          <Text numberOfLines={1} style={styles.lineName}>{request.name}</Text>
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
              <PressableScale accessibilityLabel={`${field === 'start' ? 'Start' : 'End'} earlier`} accessibilityRole="button" hitSlop={6} onPress={() => step(field, -STEP_MINUTES)} style={styles.stepper} testID={`route-alerts-${field}-earlier`}>
                <Text style={styles.stepperText}>−</Text>
              </PressableScale>
              <Text style={styles.hourValue} testID={`route-alerts-${field}`}>{formatAlertTime(hours[field])}</Text>
              <PressableScale accessibilityLabel={`${field === 'start' ? 'Start' : 'End'} later`} accessibilityRole="button" hitSlop={6} onPress={() => step(field, STEP_MINUTES)} style={styles.stepper} testID={`route-alerts-${field}-later`}>
                <Text style={styles.stepperText}>+</Text>
              </PressableScale>
            </View>
          ))}
        </View>
      ) : null}
      <PressableScale accessibilityRole="button" onPress={() => onDone(setting, setting === 'custom' ? hours : undefined)} style={styles.done} testID="route-alerts-prompt-done">
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
  lineName: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  label: { marginTop: 18, marginBottom: 8, color: colors.mutedInk, ...typography.label },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionLabel: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, textAlign: 'center' },
  optionLabelSelected: { color: colors.onPrimary },
  hours: { gap: 8, marginTop: 14 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.background },
  hourLabel: { width: 44, color: colors.mutedInk, ...typography.bodyStrong, fontSize: 14 },
  hourValue: { flex: 1, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 17, textAlign: 'center' },
  stepper: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.blueSoft },
  stepperText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 22 },
  done: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: 24, backgroundColor: colors.primary },
  doneText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 16 },
});

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTripTimeChoice, type TripTimeChoice } from '../data/transit';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { WheelColumn } from './WheelColumn';
import { PressableScale } from './PressableScale';

type LeaveMode = TripTimeChoice['mode'];

const modes: { id: LeaveMode; label: string }[] = [
  { id: 'now', label: 'Leave now' },
  { id: 'depart', label: 'Depart at' },
  { id: 'arrive', label: 'Arrive by' },
];

const hours = Array.from({ length: 12 }, (_, index) => index + 1);
const minuteSteps = Array.from({ length: 12 }, (_, index) => index * 5);
const periods = ['AM', 'PM'] as const;

const hourItems = hours.map((hour) => ({ label: String(hour), testID: `leave-hour-${hour}` }));
const minuteItems = minuteSteps.map((minute) => ({ label: String(minute).padStart(2, '0'), testID: `leave-minute-${String(minute).padStart(2, '0')}` }));
const periodItems = periods.map((period) => ({ label: period, testID: `leave-period-${period.toLowerCase()}` }));

const DEFAULT_DEPART_MINUTES = 10 * 60 + 30;
const DEFAULT_ARRIVE_MINUTES = 12 * 60;

type WheelTime = { hourIndex: number; minuteIndex: number; periodIndex: number };

function toWheel(minutes: number): WheelTime {
  const rounded = Math.round(minutes / 5) * 5 % (24 * 60);
  const hours24 = Math.floor(rounded / 60);
  return { hourIndex: (hours24 % 12 || 12) - 1, minuteIndex: (rounded % 60) / 5, periodIndex: hours24 >= 12 ? 1 : 0 };
}

function fromWheel({ hourIndex, minuteIndex, periodIndex }: WheelTime) {
  return (((hourIndex + 1) % 12) + periodIndex * 12) * 60 + minuteIndex * 5;
}

type LeaveTimeSheetProps = {
  onCancel: () => void;
  onConfirm: (choice: TripTimeChoice) => void;
  value: TripTimeChoice;
};

/** Bottom sheet for choosing Leave now, a departure time, or an arrival deadline. */
export function LeaveTimeSheet({ onCancel, onConfirm, value }: LeaveTimeSheetProps) {
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<LeaveMode>(value.mode);
  const [wheel, setWheel] = useState<WheelTime>(() => toWheel(value.mode === 'now' ? DEFAULT_DEPART_MINUTES : value.minutes));
  const [touched, setTouched] = useState(value.mode !== 'now');

  const draft: TripTimeChoice = mode === 'now' ? { mode } : { mode, minutes: fromWheel(wheel) };

  const selectMode = (next: LeaveMode) => {
    setMode(next);
    if (!touched && next !== 'now') {
      setWheel(toWheel(next === 'arrive' ? DEFAULT_ARRIVE_MINUTES : DEFAULT_DEPART_MINUTES));
    }
  };

  const updateWheel = (patch: Partial<WheelTime>) => {
    setTouched(true);
    setWheel((current) => ({ ...current, ...patch }));
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel} statusBarTranslucent={true} transparent={true} visible={true}>
      <Pressable accessibilityLabel="Close time picker" onPress={onCancel} style={styles.backdrop} testID="leave-time-backdrop" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="leave-time-sheet">
        <View style={styles.handle} />
        <View style={styles.header}>
          <PressableScale accessibilityRole="button" hitSlop={8} onPress={onCancel} style={styles.headerButton} testID="leave-time-cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
          <Text style={styles.title}>Trip time</Text>
          <PressableScale accessibilityRole="button" hitSlop={8} onPress={() => onConfirm(draft)} style={[styles.headerButton, styles.doneButton]} testID="leave-time-done">
            <Text style={styles.doneText}>Done</Text>
          </PressableScale>
        </View>

        <View accessibilityRole="tablist" style={styles.segments}>
          {modes.map((item) => {
            const selected = item.id === mode;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => selectMode(item.id)}
                style={[styles.segment, selected && styles.selectedSegment]}
                testID={`leave-mode-${item.id}`}
              >
                <Text style={[styles.segmentText, selected && styles.selectedSegmentText]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.wheels}>
          <WheelColumn accessibilityLabel="Hour" disabled={mode === 'now'} items={hourItems} onSelect={(hourIndex) => updateWheel({ hourIndex })} selectedIndex={wheel.hourIndex} />
          <Text style={styles.colon}>:</Text>
          <WheelColumn accessibilityLabel="Minute" disabled={mode === 'now'} items={minuteItems} onSelect={(minuteIndex) => updateWheel({ minuteIndex })} selectedIndex={wheel.minuteIndex} />
          <WheelColumn accessibilityLabel="AM or PM" disabled={mode === 'now'} items={periodItems} onSelect={(periodIndex) => updateWheel({ periodIndex })} selectedIndex={wheel.periodIndex} />
        </View>

        <View style={styles.summary}>
          <Icon name="time" size={18} />
          <Text accessibilityLiveRegion="polite" style={styles.summaryText} testID="leave-time-preview">{formatTripTimeChoice(draft)}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.surface,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, marginTop: 10, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  headerButton: { minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  doneButton: { backgroundColor: colors.primary },
  cancelText: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 15 },
  doneText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  segments: { flexDirection: 'row', gap: 4, marginTop: 14, padding: 4, borderRadius: 14, backgroundColor: colors.background },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  selectedSegment: { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 13 },
  selectedSegmentText: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  wheels: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  colon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  summaryText: { color: colors.ink, ...typography.bodyStrong },
});

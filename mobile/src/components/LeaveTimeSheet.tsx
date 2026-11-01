import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTripTimeChoice, type TripTimeChoice } from '../data/transit';
import { addDays, formatDateKey, nyDateKey, TRIP_TIME_ZONE, tripDayLabel, tripTimeAt } from '../data/tripPlanning';
import { appNow } from '../debug/clock';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { WheelColumn } from './WheelColumn';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';

/** The two timed choices; Set now is its own button, not a tab. */
type LeaveMode = Exclude<TripTimeChoice['mode'], 'now'>;

const modes: { id: LeaveMode; label: string }[] = [
  { id: 'depart', label: 'Leave' },
  { id: 'arrive', label: 'Arrive' },
];

const hours = Array.from({ length: 12 }, (_, index) => index + 1);
const minuteSteps = Array.from({ length: 60 }, (_, index) => index);
const periods = ['AM', 'PM'] as const;

const hourItems = hours.map((hour) => ({ label: String(hour), testID: `leave-hour-${hour}` }));
const minuteItems = minuteSteps.map((minute) => ({ label: String(minute).padStart(2, '0'), testID: `leave-minute-${String(minute).padStart(2, '0')}` }));
const periodItems = periods.map((period) => ({ label: period, testID: `leave-period-${period.toLowerCase()}` }));

const MINUTES_PER_DAY = 24 * 60;
/** "Arrive" starts this long after now, a trip's worth later. */
const ARRIVE_AHEAD_MINUTES = 60;
/** How far ahead a trip can be planned; timetables further out are rarely published. */
const MAX_DAYS_AHEAD = 60;
const newYorkClock = new Intl.DateTimeFormat('en-US', { timeZone: TRIP_TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });

/** Minutes past midnight in New York (the trip time's clock) at `ms`. */
export function newYorkMinutesAt(ms: number): number {
  const parts = Object.fromEntries(newYorkClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

type WheelTime = { hourIndex: number; minuteIndex: number; periodIndex: number };

function toWheel(minutes: number): WheelTime {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(wrapped / 60);
  return { hourIndex: (hours24 % 12 || 12) - 1, minuteIndex: wrapped % 60, periodIndex: hours24 >= 12 ? 1 : 0 };
}

function fromWheel({ hourIndex, minuteIndex, periodIndex }: WheelTime) {
  return (((hourIndex + 1) % 12) + periodIndex * 12) * 60 + minuteIndex;
}

type LeaveTimeSheetProps = {
  onCancel: () => void;
  onConfirm: (choice: TripTimeChoice) => void;
  value: TripTimeChoice;
  /** The current time, for the starting point (tests pass a fixed one). */
  nowMs?: number;
};

/** Bottom sheet for choosing when to leave or arrive: a time (scrolled or typed) and a day. */
export function LeaveTimeSheet({ onCancel, onConfirm, value, nowMs }: LeaveTimeSheetProps) {
  const styles = useThemedStyles(createStyles);
  const [now] = useState(() => nowMs ?? appNow());
  const today = nyDateKey(now);
  // From Leave now, the sheet opens ready to edit: Leave, set to the current time, today.
  const [startMinutes] = useState(() => newYorkMinutesAt(now));
  const defaultMinutes = (next: LeaveMode) => (next === 'arrive' ? (startMinutes + ARRIVE_AHEAD_MINUTES) % MINUTES_PER_DAY : startMinutes);
  const [mode, setMode] = useState<LeaveMode>(value.mode === 'now' ? 'depart' : value.mode);
  const [wheel, setWheel] = useState<WheelTime>(() => toWheel(value.mode === 'now' ? startMinutes : value.minutes));
  const [pickedDate, setDate] = useState(() => (value.mode === 'now' ? today : nyDateKey(Date.parse(tripTimeAt(value, new Date(now)).at))));
  const [touched, setTouched] = useState(value.mode !== 'now');
  // The day wheel: Today, Tomorrow, then each date up to MAX_DAYS_AHEAD.
  const [days] = useState(() => Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, index) => addDays(today, index)));
  const dayItems = days.map((key, index) => ({ label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDateKey(key), testID: `leave-day-${key}` }));

  const minutes = fromWheel(wheel);
  // The day the trip will really be: a time already gone today means tomorrow.
  const dayOf = (key: string) => nyDateKey(Date.parse(tripTimeAt({ minutes, date: key }, new Date(now)).at));
  const date = dayOf(pickedDate);
  const draft: TripTimeChoice = { mode, minutes, date };
  const day = tripDayLabel(draft, new Date(now));
  const preview = `${formatTripTimeChoice(draft)}${day ? ` ${day}` : ''}`;

  const selectMode = (next: LeaveMode) => {
    setMode(next);
    if (!touched) setWheel(toWheel(defaultMinutes(next)));
  };

  const updateWheel = (patch: Partial<WheelTime>) => {
    setTouched(true);
    setWheel((current) => ({ ...current, ...patch }));
  };

  const selectDay = (key: string) => {
    setDate(key);
    // Back to Today with a time already gone: the day was asked for, so the time gives way.
    if (dayOf(key) !== key) setWheel(toWheel(startMinutes));
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel} statusBarTranslucent={true} transparent={true} visible={true}>
      <Pressable accessibilityLabel="Close time picker" onPress={onCancel} style={styles.backdrop} testID="leave-time-backdrop" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="leave-time-sheet">
        <View style={styles.header}>
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
          <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onCancel} testID="leave-time-cancel">
            <Icon name="close" size={26} />
          </PressableScale>
        </View>

        <View style={styles.wheels}>
          {/* The day on the left: a time already gone today shows as tomorrow. */}
          <View style={styles.dayWheel}>
            <WheelColumn accessibilityLabel="Day" testID="leave-day" items={dayItems} onSelect={(index) => selectDay(days[index]!)} selectedIndex={Math.max(0, days.indexOf(date))} />
          </View>
          <WheelColumn accessibilityLabel="Hour" testID="leave-hour" typeable={true} items={hourItems} onSelect={(hourIndex) => updateWheel({ hourIndex })} selectedIndex={wheel.hourIndex} />
          <Text style={styles.colon}>:</Text>
          <WheelColumn accessibilityLabel="Minute" testID="leave-minute" typeable={true} items={minuteItems} onSelect={(minuteIndex) => updateWheel({ minuteIndex })} selectedIndex={wheel.minuteIndex} />
          <WheelColumn accessibilityLabel="AM or PM" keyboardType="default" testID="leave-period" typeable={true} items={periodItems} onSelect={(periodIndex) => updateWheel({ periodIndex })} selectedIndex={wheel.periodIndex} />
        </View>

        {/* Back to leaving right away, in one tap. */}
        <PressableScale accessibilityLabel="Set now" accessibilityHint="Plans for leaving right away" accessibilityRole="button" hitSlop={6} onPress={() => onConfirm({ mode: 'now' })} style={styles.nowButton} testID="leave-now">
          <Text style={styles.nowText}>Set now</Text>
        </PressableScale>
        <PressableScale accessibilityHint={`Plans for ${preview}`} accessibilityRole="button" onPress={() => onConfirm(draft)} style={styles.done} testID="leave-time-done">
          <Text style={styles.doneText}>Done</Text>
        </PressableScale>
      </SafeAreaView>

    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  // The app's column width, so on a wide (web) window it's a sheet rather than a full-width bar.
  sheet: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  nowButton: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', marginTop: 10, paddingHorizontal: 12 },
  nowText: { color: colors.primary, fontFamily: fontFamilies.bold, fontSize: 13 },
  segments: { flex: 1, flexDirection: 'row', gap: 4, padding: 4, borderRadius: radii.control, backgroundColor: colors.background },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control },
  selectedSegment: { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 13 },
  selectedSegmentText: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  wheels: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  // Dates read longer than the time's numbers.
  // A row, so the wheel stretches across rather than growing down past its own height.
  dayWheel: { flex: 2.2, flexDirection: 'row' },
  colon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22 },
  done: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: radii.pill, backgroundColor: colors.primary },
  doneText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 16 },
});

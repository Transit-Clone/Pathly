import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTripTimeChoice, type TripTimeChoice } from '../data/transit';
import { addDays, dateKeyMs, formatDateKey, nyDateKey, TRIP_TIME_ZONE, tripDayLabel, tripTimeAt } from '../data/tripPlanning';
import { appNow } from '../debug/clock';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { WheelColumn } from './WheelColumn';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';

/** The two timed choices; Leave now is its own button, not a tab. */
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

/** Minutes past midnight in New York (the trip time's clock) at `ms`, rounded up to 5 minutes. */
export function newYorkMinutesAt(ms: number): number {
  const parts = Object.fromEntries(newYorkClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return (Math.ceil((Number(parts.hour) * 60 + Number(parts.minute)) / 5) * 5) % MINUTES_PER_DAY;
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

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** A month of days to tap; days before `minKey` or after `maxKey` can't be picked. */
function MonthCalendar({ maxKey, minKey, onSelect, selected }: { maxKey: string; minKey: string; onSelect: (key: string) => void; selected: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  const first = new Date(dateKeyMs(`${month}-01`));
  const lead = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
  const shiftMonth = (by: number) => {
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + by, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const canGoBack = month > minKey.slice(0, 7);
  const canGoForward = month < maxKey.slice(0, 7);
  return (
    <View style={styles.calendar} testID="leave-calendar">
      <View style={styles.calendarHeader}>
        <PressableScale accessibilityLabel="Previous month" accessibilityRole="button" disabled={!canGoBack} hitSlop={8} onPress={() => shiftMonth(-1)} style={[styles.dayStep, !canGoBack && styles.disabled]} testID="leave-calendar-previous">
          <Icon color={colors.ink} name="back" size={18} />
        </PressableScale>
        <Text style={styles.calendarTitle}>{monthFormat.format(first)}</Text>
        <PressableScale accessibilityLabel="Next month" accessibilityRole="button" disabled={!canGoForward} hitSlop={8} onPress={() => shiftMonth(1)} style={[styles.dayStep, !canGoForward && styles.disabled]} testID="leave-calendar-next">
          <Icon color={colors.ink} name="forward" size={18} />
        </PressableScale>
      </View>
      <View style={styles.calendarGrid}>
        {WEEKDAYS.map((day, index) => <Text key={`weekday-${index}`} style={styles.weekday}>{day}</Text>)}
        {cells.map((key, index) => {
          if (!key) return <View key={`blank-${index}`} style={styles.dayCell} />;
          const disabled = key < minKey || key > maxKey;
          const isSelected = key === selected;
          return (
            <Pressable
              accessibilityLabel={formatDateKey(key)}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isSelected }}
              disabled={disabled}
              key={key}
              onPress={() => onSelect(key)}
              style={styles.dayCell}
              testID={`leave-day-${key}`}
            >
              <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected, key === minKey && !isSelected && styles.dayCircleToday]}>
                <Text style={[styles.dayText, disabled && styles.dayTextDisabled, isSelected && styles.dayTextSelected]}>{Number(key.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  const { colors } = useTheme();
  const [now] = useState(() => nowMs ?? appNow());
  const today = nyDateKey(now);
  const lastDay = addDays(today, MAX_DAYS_AHEAD);
  // From Leave now, the sheet opens ready to edit: Leave, set to the current time, today.
  const [startMinutes] = useState(() => newYorkMinutesAt(now));
  const defaultMinutes = (next: LeaveMode) => (next === 'arrive' ? (startMinutes + ARRIVE_AHEAD_MINUTES) % MINUTES_PER_DAY : startMinutes);
  const [mode, setMode] = useState<LeaveMode>(value.mode === 'now' ? 'depart' : value.mode);
  const [wheel, setWheel] = useState<WheelTime>(() => toWheel(value.mode === 'now' ? startMinutes : value.minutes));
  const [pickedDate, setDate] = useState(() => (value.mode === 'now' ? today : nyDateKey(Date.parse(tripTimeAt(value, new Date(now)).at))));
  const [touched, setTouched] = useState(value.mode !== 'now');
  const [calendarOpen, setCalendarOpen] = useState(false);

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

  const dayName = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : null;
  const canGoBack = date > today && dayOf(addDays(date, -1)) !== date;
  const canGoForward = date < lastDay;

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
          <WheelColumn accessibilityLabel="Hour" testID="leave-hour" typeable={true} items={hourItems} onSelect={(hourIndex) => updateWheel({ hourIndex })} selectedIndex={wheel.hourIndex} />
          <Text style={styles.colon}>:</Text>
          <WheelColumn accessibilityLabel="Minute" testID="leave-minute" typeable={true} items={minuteItems} onSelect={(minuteIndex) => updateWheel({ minuteIndex })} selectedIndex={wheel.minuteIndex} />
          <WheelColumn accessibilityLabel="AM or PM" keyboardType="default" testID="leave-period" typeable={true} items={periodItems} onSelect={(periodIndex) => updateWheel({ periodIndex })} selectedIndex={wheel.periodIndex} />
        </View>

        {/* The day: a step either way, or the calendar from the middle. */}
        <View style={styles.dateRow}>
          <PressableScale accessibilityLabel="Previous day" accessibilityRole="button" disabled={!canGoBack} hitSlop={6} onPress={() => setDate(addDays(date, -1))} style={[styles.dayStep, !canGoBack && styles.disabled]} testID="leave-day-previous">
            <Icon color={colors.ink} name="back" size={20} />
          </PressableScale>
          <PressableScale
            accessibilityHint="Opens a calendar to pick the day"
            accessibilityLabel={`Day: ${dayName ?? ''} ${formatDateKey(date)}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: calendarOpen }}
            onPress={() => setCalendarOpen((open) => !open)}
            style={styles.dateButton}
            testID="leave-date"
          >
            <Text style={styles.dateText}>{dayName ? `${dayName}, ${formatDateKey(date)}` : formatDateKey(date)}</Text>
            <Icon color={colors.mutedInk} name="expand" size={16} />
          </PressableScale>
          <PressableScale accessibilityLabel="Next day" accessibilityRole="button" disabled={!canGoForward} hitSlop={6} onPress={() => setDate(addDays(date, 1))} style={[styles.dayStep, !canGoForward && styles.disabled]} testID="leave-day-next">
            <Icon color={colors.ink} name="forward" size={20} />
          </PressableScale>
        </View>

        {/* Back to leaving right away, in one tap. */}
        <PressableScale accessibilityLabel="Leave now" accessibilityRole="button" hitSlop={6} onPress={() => onConfirm({ mode: 'now' })} style={styles.nowButton} testID="leave-now">
          <Text style={styles.nowText}>Leave now</Text>
        </PressableScale>
        <PressableScale accessibilityHint={`Plans for ${preview}`} accessibilityRole="button" onPress={() => onConfirm(draft)} style={styles.done} testID="leave-time-done">
          <Text style={styles.doneText}>Done</Text>
        </PressableScale>
      </SafeAreaView>

      {/* The calendar pops up centered over the sheet; tapping outside it closes it unchanged. */}
      <Modal animationType="fade" onRequestClose={() => setCalendarOpen(false)} statusBarTranslucent={true} transparent={true} visible={calendarOpen}>
        <View style={styles.calendarOverlay}>
          <Pressable accessibilityLabel="Close calendar" onPress={() => setCalendarOpen(false)} style={StyleSheet.absoluteFill} testID="leave-calendar-backdrop" />
          <MonthCalendar
            maxKey={lastDay}
            minKey={today}
            onSelect={(key) => {
              setDate(key);
              setCalendarOpen(false);
            }}
            selected={date}
          />
        </View>
      </Modal>
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
  colon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dayStep: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.background },
  disabled: { opacity: 0.35 },
  dateButton: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.pill, backgroundColor: colors.background },
  dateText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  calendarOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  calendar: { width: '100%', maxWidth: 360, padding: 14, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 16 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calendarTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, paddingVertical: 4, color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  dayCell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  dayCircleSelected: { backgroundColor: colors.primary },
  dayCircleToday: { borderWidth: 1, borderColor: colors.primary },
  dayText: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  dayTextDisabled: { color: colors.mutedInk, opacity: 0.45 },
  dayTextSelected: { color: colors.onPrimary },
  done: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: radii.pill, backgroundColor: colors.primary },
  doneText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 16 },
});

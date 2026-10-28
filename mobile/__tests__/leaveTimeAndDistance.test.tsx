import { fireEvent, render } from '@testing-library/react-native';

import { LeaveTimeSheet, newYorkMinutesAt } from '../src/components/LeaveTimeSheet';
import { wheelItemFor } from '../src/components/WheelColumn';
import { tripDayLabel, tripTimeAt } from '../src/data/tripPlanning';
import { formatDistanceAway, placeDistanceMeters } from '../src/data/placesSearch';
import { AppSettingsProvider } from '../src/theme/AppSettings';

// 4:12 PM in New York (EDT).
const NOW = Date.parse('2026-10-26T20:12:00Z');

describe('LeaveTimeSheet', () => {
  it('reads New York time, rounded up to the wheel\'s 5 minutes', () => {
    expect(newYorkMinutesAt(NOW)).toBe(16 * 60 + 15);
    expect(newYorkMinutesAt(Date.parse('2026-10-26T20:10:00Z'))).toBe(16 * 60 + 10);
  });

  it('opens from Leave now ready to edit: Depart at, the current time', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <AppSettingsProvider>
        <LeaveTimeSheet nowMs={NOW} onCancel={jest.fn()} onConfirm={onConfirm} value={{ mode: 'now' }} />
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toBe('Plans for Leave 4:15 PM');
    fireEvent.press(screen.getByTestId('leave-mode-arrive'));
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toBe('Plans for Arrive by 5:15 PM');
    expect(screen.queryByTestId('leave-mode-now')).toBeNull();
    fireEvent.press(screen.getByTestId('leave-now'));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'now' });
  });

  const renderSheet = (onConfirm = jest.fn(), onCancel = jest.fn()) => render(
    <AppSettingsProvider>
      <LeaveTimeSheet nowMs={NOW} onCancel={onCancel} onConfirm={onConfirm} value={{ mode: 'now' }} />
    </AppSettingsProvider>,
  );

  it('types into a wheel by tapping its picked value', () => {
    const onConfirm = jest.fn();
    const screen = renderSheet(onConfirm);
    fireEvent.press(screen.getByTestId('leave-minute-15'));
    fireEvent.changeText(screen.getByTestId('leave-minute-input'), '47');
    fireEvent.press(screen.getByTestId('leave-hour-4'));
    fireEvent.changeText(screen.getByTestId('leave-hour-input'), '6');
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toBe('Plans for Leave 6:47 PM');
    fireEvent.press(screen.getByTestId('leave-time-done'));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'depart', minutes: 18 * 60 + 47, date: '2026-10-26' });
  });

  it('matches typed wheel values loosely', () => {
    const minutes = Array.from({ length: 60 }, (_, index) => ({ label: String(index).padStart(2, '0') }));
    expect(wheelItemFor(minutes, '7')).toBe(7);
    expect(wheelItemFor(minutes, '07')).toBe(7);
    expect(wheelItemFor(minutes, '75')).toBe(-1);
    expect(wheelItemFor([{ label: 'AM' }, { label: 'PM' }], 'p')).toBe(1);
  });

  it('steps the day, or picks it from the calendar, never before today', () => {
    const onConfirm = jest.fn();
    const screen = renderSheet(onConfirm);
    expect(screen.getByText('Today, Mon, Oct 26')).toBeTruthy();
    expect(screen.getByTestId('leave-day-previous').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(screen.getByTestId('leave-day-next'));
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toBe('Plans for Leave 4:15 PM tomorrow');
    fireEvent.press(screen.getByTestId('leave-date'));
    expect(screen.getByTestId('leave-day-2026-10-25').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(screen.getByTestId('leave-day-2026-10-30'));
    expect(screen.queryByTestId('leave-calendar')).toBeNull();
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toBe('Plans for Leave 4:15 PM Fri, Oct 30');
    fireEvent.press(screen.getByTestId('leave-time-done'));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'depart', minutes: 16 * 60 + 15, date: '2026-10-30' });
  });

  it('shows a time already gone today as tomorrow', () => {
    const screen = renderSheet();
    fireEvent.press(screen.getByTestId('leave-hour-3'));
    expect(screen.getByText('Tomorrow, Tue, Oct 27')).toBeTruthy();
    expect(screen.getByTestId('leave-day-previous').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('closes with the X without changing anything', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = renderSheet(onConfirm, onCancel);
    fireEvent.press(screen.getByTestId('leave-time-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('trip time days', () => {
  const now = new Date(NOW);

  it('uses the chosen day while it is ahead, else the next time that clock time comes round', () => {
    expect(tripTimeAt({ minutes: 9 * 60, date: '2026-10-30' }, now)).toEqual({ at: '2026-10-30T13:00:00.000Z', dayOffset: 4 });
    expect(tripTimeAt({ minutes: 9 * 60, date: '2026-10-26' }, now)).toEqual({ at: '2026-10-27T13:00:00.000Z', dayOffset: 1 });
    expect(tripTimeAt({ minutes: 20 * 60 }, now).dayOffset).toBe(0);
    expect(tripDayLabel({ minutes: 20 * 60, date: '2026-10-26' }, now)).toBe('');
    expect(tripDayLabel({ minutes: 9 * 60, date: '2026-11-02' }, now)).toBe('Mon, Nov 2');
  });
});

describe('search result distance', () => {
  const near = { latitude: 40.9126, longitude: -73.1234 };

  it('measures from the rider when the place has a location, else takes Google\'s', () => {
    const meters = placeDistanceMeters({ id: 'a', title: 'A', subtitle: '', location: { latitude: 40.9126, longitude: -73.0} }, near);
    expect(meters).toBeGreaterThan(10_000);
    expect(meters).toBeLessThan(11_000);
    expect(placeDistanceMeters({ id: 'b', title: 'B', subtitle: '', distanceMeters: 1234 }, near)).toBe(1234);
    expect(placeDistanceMeters({ id: 'c', title: 'C', subtitle: '' }, near)).toBeNull();
  });

  it('reads like Google Maps: tenths nearby, whole miles far away', () => {
    expect(formatDistanceAway(100)).toBe('<0.1 mi');
    expect(formatDistanceAway(1609.344 * 0.34)).toBe('0.3 mi');
    expect(formatDistanceAway(1609.344 * 4.26)).toBe('4.3 mi');
    expect(formatDistanceAway(1609.344 * 18.4)).toBe('18 mi');
  });
});

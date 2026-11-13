import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { NavigationGuidance } from '../src/data/enrouteNavigation';
import { announcementFor, tripNotificationContent } from '../src/data/tripAnnouncements';
import { DEFAULT_PREFERENCES, type UserPreferences } from '../src/data/userPreferences';
import { useTripGuidanceAlerts } from '../src/hooks/useTripGuidanceAlerts';
import { clearTripNotification, registerForRouteAlerts, showTripNotification, TRIP_NOTIFICATION_ID } from '../src/lib/notifications';

const ARRIVE = '2026-11-12T18:42:00-05:00';

function guidance(overrides: Partial<NavigationGuidance>): NavigationGuidance {
  return {
    phase: 'walking',
    currentAction: 'Walk to Penn Station',
    nextAction: 'Board LIRR toward Ronkonkoma',
    currentStopName: null,
    nextStopName: null,
    remainingStops: null,
    line: null,
    headsign: null,
    departureTime: null,
    arrivalTime: ARRIVE,
    distanceMeters: 400,
    durationSeconds: 300,
    ...overrides,
  };
}

const walking = guidance({});
const boarding = guidance({ phase: 'waiting-to-board', currentAction: 'Board LIRR at Penn Station', nextAction: 'Continue to Woodside' });
const riding = guidance({ phase: 'riding', currentAction: 'Ride LIRR toward Ronkonkoma', nextAction: 'Continue to Woodside', nextStopName: 'Woodside', remainingStops: 3 });
const twoLeft = { ...riding, nextAction: 'Continue to Kew Gardens', nextStopName: 'Kew Gardens', remainingStops: 2 };
const stopNext = { ...riding, nextAction: 'Get off at Jamaica', nextStopName: 'Jamaica', remainingStops: 1 };
const walkingAfter = guidance({ currentAction: 'Walk to 89-14 Parsons Blvd', nextAction: 'Arrive at 89-14 Parsons Blvd' });

describe('trip announcements', () => {
  it('stays quiet for the step the trip starts (or reopens) on', () => {
    expect(announcementFor(null, riding)).toBeNull();
  });

  it('announces each new step, with the stops left on a ride', () => {
    expect(announcementFor(walking, boarding)).toEqual({ speech: 'Board LIRR at Penn Station.', strength: 'step' });
    expect(announcementFor(boarding, riding)).toEqual({ speech: 'Ride LIRR toward Ronkonkoma. 3 stops to go.', strength: 'step' });
    expect(announcementFor(stopNext, walkingAfter)).toEqual({ speech: 'Walk to 89-14 Parsons Blvd.', strength: 'step' });
  });

  it('warns once, strongly, the stop before getting off', () => {
    expect(announcementFor(riding, twoLeft)).toBeNull();
    expect(announcementFor(twoLeft, stopNext)).toEqual({ speech: 'Your stop, Jamaica, is next. Get ready to get off.', strength: 'alert' });
    expect(announcementFor(stopNext, { ...stopNext })).toBeNull();
    // A one-stop ride warns as it starts.
    expect(announcementFor(boarding, stopNext)?.strength).toBe('alert');
  });

  it('puts the step, what comes next, and the arrival time in the notification', () => {
    expect(tripNotificationContent(boarding)).toEqual({ title: 'Board LIRR at Penn Station', body: 'Next: Continue to Woodside · Arrive 6:42 PM' });
    expect(tripNotificationContent(riding).body).toBe('Next: Continue to Woodside · 3 stops left · Arrive 6:42 PM');
    expect(tripNotificationContent(stopNext).body).toBe('Your stop, Jamaica, is next. · Arrive 6:42 PM');
  });
});

describe('useTripGuidanceAlerts', () => {
  const allowNotifications = () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  };
  type Props = { sessionId: string | null; guidance: NavigationGuidance | null; arrivedDestination: string | null; settings: UserPreferences['tripGuidance'] };
  const render = (initial: Props) => renderHook((props: Props) => useTripGuidanceAlerts({ ...props, notificationsEnabled: true }), { initialProps: initial });
  const on = DEFAULT_PREFERENCES.tripGuidance;

  beforeEach(() => {
    jest.clearAllMocks();
    allowNotifications();
  });

  it('speaks and vibrates at each step, and keeps the step in a notification until the trip ends', async () => {
    const hook = render({ sessionId: 'trip-1', guidance: boarding, arrivedDestination: null, settings: on });
    expect(Speech.speak).not.toHaveBeenCalled();
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      identifier: TRIP_NOTIFICATION_ID,
      content: expect.objectContaining({ title: 'Board LIRR at Penn Station', sticky: true, interruptionLevel: 'passive' }),
    })));

    hook.rerender({ sessionId: 'trip-1', guidance: riding, arrivedDestination: null, settings: on });
    expect(Speech.speak).toHaveBeenLastCalledWith('Ride LIRR toward Ronkonkoma. 3 stops to go.', expect.anything());
    expect(Haptics.impactAsync).toHaveBeenCalled();

    // The stop before getting off: a warning buzz, and the notification alerts.
    hook.rerender({ sessionId: 'trip-1', guidance: stopNext, arrivedDestination: null, settings: on });
    expect(Speech.speak).toHaveBeenLastCalledWith('Your stop, Jamaica, is next. Get ready to get off.', expect.anything());
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Warning);
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
      content: expect.objectContaining({ interruptionLevel: 'active', sound: 'default' }),
    })));

    // Arriving ends the trip: arrival is announced and the notification removed.
    hook.rerender({ sessionId: null, guidance: null, arrivedDestination: '89-14 Parsons Blvd', settings: on });
    expect(Speech.speak).toHaveBeenLastCalledWith('You’ve arrived at 89-14 Parsons Blvd.', expect.anything());
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Success);
    await waitFor(() => expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID));
  });

  it("doesn't repost an unchanged notification on every location update", async () => {
    const hook = render({ sessionId: 'trip-1', guidance: riding, arrivedDestination: null, settings: on });
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
    hook.rerender({ sessionId: 'trip-1', guidance: { ...riding }, arrivedDestination: null, settings: on });
    hook.rerender({ sessionId: 'trip-1', guidance: { ...riding }, arrivedDestination: null, settings: on });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('honors each setting, and muting stops speech at once', async () => {
    const quiet = { notification: false, voice: false, haptics: false };
    const hook = render({ sessionId: 'trip-1', guidance: boarding, arrivedDestination: null, settings: quiet });
    hook.rerender({ sessionId: 'trip-1', guidance: riding, arrivedDestination: null, settings: quiet });
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Speech.stop).toHaveBeenCalled();
  });
});

describe('trip guidance lifecycle regressions', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
  const permissions = Notifications.getPermissionsAsync as jest.Mock;
  const allowed = { granted: true, canAskAgain: true };
  const on = DEFAULT_PREFERENCES.tripGuidance;
  type Props = { sessionId: string | null; guidance: NavigationGuidance | null; arrivedDestination: string | null; notificationsEnabled?: boolean };
  const render = (initial: Props) => renderHook((props: Props) => useTripGuidanceAlerts({
    ...props, settings: on, notificationsEnabled: props.notificationsEnabled ?? true,
  }), { initialProps: initial });
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  };

  beforeEach(async () => {
    await clearTripNotification();
    jest.clearAllMocks();
    permissions.mockResolvedValue(allowed);
  });

  it('does not post a progress notification after the trip ends during a permission query', async () => {
    const permission = deferred<typeof allowed>();
    permissions.mockReturnValueOnce(permission.promise);
    const pending = showTripNotification('Old trip', 'Board now', false);
    await clearTripNotification();
    permission.resolve(allowed);
    await pending;
    expect(schedule).not.toHaveBeenCalled();
  });

  it('never lets an older permission response overwrite the newest guidance', async () => {
    const permission = deferred<typeof allowed>();
    permissions.mockReturnValueOnce(permission.promise);
    const older = showTripNotification('Old step', 'Board now', false);
    await showTripNotification('Current step', 'Get off next', true);
    permission.resolve(allowed);
    await older;
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.objectContaining({ title: 'Current step' }) }));
  });

  it('dismisses after an in-flight native post finishes so ending leaves no orphaned notification', async () => {
    const posting = deferred<string>();
    const completed: string[] = [];
    schedule.mockImplementationOnce(async () => { await posting.promise; completed.push('posted'); return TRIP_NOTIFICATION_ID; });
    dismiss.mockImplementationOnce(async () => { completed.push('dismissed'); });
    const pendingPost = showTripNotification('Current step', 'Board now', false);
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    const pendingClear = clearTripNotification();
    posting.resolve(TRIP_NOTIFICATION_ID);
    await Promise.all([pendingPost, pendingClear]);
    expect(completed).toEqual(['posted', 'dismissed']);
  });

  it('stops an active spoken instruction when the rider ends the trip', async () => {
    const hook = render({ sessionId: 'trip-speech', guidance: boarding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    hook.rerender({ sessionId: 'trip-speech', guidance: riding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
    expect(Speech.speak).toHaveBeenCalled();
    (Speech.stop as jest.Mock).mockClear();
    hook.rerender({ sessionId: null, guidance: null, arrivedDestination: null });
    expect(Speech.stop).toHaveBeenCalled();
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID));
  });

  it('cleans up speech and the progress notification when the trip owner unmounts', async () => {
    const hook = render({ sessionId: 'trip-unmount', guidance: boarding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    hook.rerender({ sessionId: 'trip-unmount', guidance: riding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
    (Speech.stop as jest.Mock).mockClear();
    dismiss.mockClear();
    act(() => hook.unmount());
    expect(Speech.stop).toHaveBeenCalled();
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID));
  });

  it('cancels a pending notification when the master preference is disabled mid-trip', async () => {
    const permission = deferred<typeof allowed>();
    permissions.mockReturnValueOnce(permission.promise);
    const hook = render({ sessionId: 'trip-muted', guidance: riding, arrivedDestination: null });
    hook.rerender({ sessionId: 'trip-muted', guidance: riding, arrivedDestination: null, notificationsEnabled: false });
    await act(async () => { permission.resolve(allowed); await permission.promise; });
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID));
    expect(schedule).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('stops an arrival announcement if its owner unmounts after completion', () => {
    const hook = render({ sessionId: null, guidance: null, arrivedDestination: 'Harbor' });
    expect(Speech.speak).toHaveBeenLastCalledWith('You’ve arrived at Harbor.', expect.anything());
    (Speech.stop as jest.Mock).mockClear();
    act(() => hook.unmount());
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('posts the new owner even when a replacement trip initially has identical guidance', async () => {
    const hook = render({ sessionId: 'trip-first', guidance: boarding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    hook.rerender({ sessionId: 'trip-replacement', guidance: boarding, arrivedDestination: null });
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
    expect(dismiss).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID);
    expect(Speech.speak).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('prepares an Android notification channel before asking for permission', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      await showTripNotification('Current step', 'Board now', false);
      const firstChannel = (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0];
      const firstPermission = permissions.mock.invocationCallOrder[0];
      expect(firstChannel).toBeLessThan(firstPermission!);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });

  it('also prepares the saved-line channel before an Android permission query', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    permissions.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    try {
      expect(await registerForRouteAlerts('isolated-test-user')).toBe(false);
      const firstChannel = (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0];
      expect(firstChannel).toBeLessThan(permissions.mock.invocationCallOrder[0]!);
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });
});

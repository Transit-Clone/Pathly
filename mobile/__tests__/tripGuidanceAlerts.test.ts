import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { renderHook, waitFor } from '@testing-library/react-native';

import type { NavigationGuidance } from '../src/data/enrouteNavigation';
import { announcementFor, tripNotificationContent } from '../src/data/tripAnnouncements';
import { DEFAULT_PREFERENCES, type UserPreferences } from '../src/data/userPreferences';
import { useTripGuidanceAlerts } from '../src/hooks/useTripGuidanceAlerts';
import { TRIP_NOTIFICATION_ID } from '../src/lib/notifications';

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
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(TRIP_NOTIFICATION_ID);
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

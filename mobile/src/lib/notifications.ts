import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from './firebase';

/** The one trip-progress notification, updated in place as the trip moves along. */
export const TRIP_NOTIFICATION_ID = 'pathly-trip-progress';
const TRIP_CHANNEL = 'trip-progress';
const TRIP_ALERT_CHANNEL = 'trip-alerts';

// Notifications that arrive while Pathly is open still show as a banner and play a sound, except
// the trip's own progress notification: the open trip screen already shows (and speaks) each step.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const trip = notification.request.identifier === TRIP_NOTIFICATION_ID;
      return { shouldPlaySound: !trip, shouldSetBadge: false, shouldShowBanner: !trip, shouldShowList: true };
    },
  });
}

let tripChannelsReady: Promise<void> | null = null;
/** Android: routine steps update quietly; the stop before getting off (and arrival) alerts. */
function tripChannels(): Promise<void> {
  tripChannelsReady ??= Promise.all([
    Notifications.setNotificationChannelAsync(TRIP_CHANNEL, {
      name: 'Trip progress',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
    }),
    Notifications.setNotificationChannelAsync(TRIP_ALERT_CHANNEL, {
      name: 'Trip alerts',
      description: 'The stop before yours, and arriving',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 250, 150, 250],
    }),
  ]).then(() => undefined);
  return tripChannelsReady;
}

/**
 * Shows the trip's progress in the notification shade and on the lock screen, replacing the last
 * update. `alert` (the stop before getting off, arriving) sounds and pops up; other steps update
 * quietly. Android keeps it from being swiped away until the trip ends. Native only; never throws.
 */
export async function showTripNotification(title: string, body: string, alert: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (!(await notificationsAllowed())) return;
    if (Platform.OS === 'android') await tripChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: TRIP_NOTIFICATION_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: alert ? 'default' : undefined,
        // iOS: routine steps go straight to the list without lighting the screen.
        interruptionLevel: alert ? 'active' : 'passive',
      },
      trigger: Platform.OS === 'android' ? { channelId: alert ? TRIP_ALERT_CHANNEL : TRIP_CHANNEL } : null,
    });
  } catch {
    // The notification is a convenience; never let it break navigation.
  }
}

/** Removes the trip's progress notification (the trip ended). */
export async function clearTripNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.dismissNotificationAsync(TRIP_NOTIFICATION_ID);
  } catch {
    // Already gone.
  }
}

/** Asks once; later calls only report what the rider chose. */
async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') return (await Notification.requestPermission()) === 'granted';
    return Notification.permission === 'granted';
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Shows a notification right away (the GO "hurry up" nudge). Silently does nothing when the rider
 * hasn't allowed notifications; the in-app banner says the same thing.
 */
export async function notifyNow(title: string, body: string): Promise<void> {
  try {
    if (!(await notificationsAllowed())) return;
    if (Platform.OS === 'web') {
      new Notification(title, { body, icon: '/favicon.png' });
      return;
    }
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default' }, trigger: null });
  } catch {
    // A notification is a convenience; never let it break navigation.
  }
}

/**
 * Lets the backend push service alerts for saved lines to this device (routeAlerts.ts): asks for
 * permission, then stores the device's Expo push token on the account. Native builds only; the
 * web app has no push. Resolves false when the rider declined or push isn't available.
 */
export async function registerForRouteAlerts(uid: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await notificationsAllowed())) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Service alerts', importance: Notifications.AndroidImportance.HIGH });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await setDoc(doc(db, 'users', uid), { pushTokens: arrayUnion(token) }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

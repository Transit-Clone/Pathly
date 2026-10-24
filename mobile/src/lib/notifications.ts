import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from './firebase';

// Notifications that arrive while Pathly is open still show as a banner and play a sound.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
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

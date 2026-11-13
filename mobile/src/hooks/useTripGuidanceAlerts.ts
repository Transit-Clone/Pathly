import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type { NavigationGuidance } from '../data/enrouteNavigation';
import { announcementFor, tripNotificationContent, type AnnouncementStrength } from '../data/tripAnnouncements';
import type { UserPreferences } from '../data/userPreferences';
import { clearTripNotification, showTripNotification } from '../lib/notifications';

/** Web has no haptics module; phones' browsers that can vibrate get a pattern instead. */
const WEB_VIBRATION: Record<AnnouncementStrength, number[]> = { step: [60], alert: [200, 120, 200], arrived: [120, 80, 120, 80, 240] };

function buzz(strength: AnnouncementStrength) {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(WEB_VIBRATION[strength]);
      return;
    }
    if (strength === 'step') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    else void Haptics.notificationAsync(strength === 'arrived' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  } catch {
    // No vibration on this device.
  }
}

function stopSpeaking() {
  try {
    void Speech.stop().catch(() => undefined);
  } catch {
    // No speech engine on this device.
  }
}

function say(text: string) {
  try {
    // A newer instruction replaces one still being read out.
    stopSpeaking();
    Speech.speak(text, { language: 'en-US' });
  } catch {
    // No speech engine on this device.
  }
}

type Options = {
  /** The trip in progress, or null. */
  sessionId: string | null;
  /** Its current step (guidanceForNavigation). */
  guidance: NavigationGuidance | null;
  /** Set when a trip just completed: the trip itself ends at once, so arrival is announced from here. */
  arrivedDestination: string | null;
  settings: UserPreferences['tripGuidance'];
  /** The rider's master switch for notifications (Settings -> Notifications). */
  notificationsEnabled: boolean;
};

/**
 * Speaks and vibrates at each step of a trip, with a stronger alert the stop before getting off,
 * and keeps a notification with the current step on the lock screen until the trip ends.
 */
export function useTripGuidanceAlerts({ sessionId, guidance, arrivedDestination, settings, notificationsEnabled }: Options) {
  const { haptics, notification, voice } = settings;
  const showsNotification = notification && notificationsEnabled;
  // What the rider was last told, per trip, so a reopened app or a re-render doesn't repeat it.
  const last = useRef<{ sessionId: string; guidance: NavigationGuidance } | null>(null);
  // The notification last posted: the trip updates on many location fixes that change nothing shown.
  const notified = useRef<string | null>(null);

  // The old owner stops before a replacement/arrival starts speaking. Account changes and
  // unmounts also clean up, even when this hook never renders an explicit sessionId=null.
  useEffect(() => () => {
    last.current = null;
    notified.current = null;
    stopSpeaking();
    void clearTripNotification();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !guidance) {
      last.current = null;
      return;
    }
    const previous = last.current?.sessionId === sessionId ? last.current.guidance : null;
    last.current = { sessionId, guidance };
    const announcement = announcementFor(previous, guidance);
    if (announcement) {
      if (voice) say(announcement.speech);
      if (haptics) buzz(announcement.strength);
    }
    if (showsNotification) {
      const { title, body } = tripNotificationContent(guidance);
      const alert = announcement?.strength === 'alert';
      const key = `${title}\n${body}`;
      if (alert || notified.current !== key) {
        notified.current = key;
        void showTripNotification(title, body, alert);
      }
    }
  }, [guidance, haptics, sessionId, showsNotification, voice]);

  // The notification goes when the trip does, or when the rider turns it off mid-trip.
  const tripActive = sessionId != null;
  useEffect(() => {
    if ((tripActive && showsNotification) || notified.current === null) return;
    notified.current = null;
    void clearTripNotification();
  }, [showsNotification, tripActive]);

  const announcedArrival = useRef<string | null>(null);
  useEffect(() => {
    if (!arrivedDestination) {
      announcedArrival.current = null;
      return;
    }
    if (announcedArrival.current === arrivedDestination) return;
    announcedArrival.current = arrivedDestination;
    if (voice) say(`You’ve arrived at ${arrivedDestination}.`);
    if (haptics) buzz('arrived');
  }, [arrivedDestination, haptics, voice]);

  // Turning the voice off mid-sentence stops it.
  useEffect(() => {
    if (voice) return;
    stopSpeaking();
  }, [voice]);
}

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Turns smaller than this (degrees) are ignored, so compass jitter doesn't redraw the map. */
const MIN_TURN_DEGREES = 4;
/**
 * How far each reading pulls the shown heading toward it. Android's compass reports many noisy
 * readings a second; following each one made the beam shake, so it eases toward them instead.
 */
const SMOOTHING = 0.2;

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * Which way the phone is facing, in degrees clockwise from north, or null when it can't tell (no
 * compass, a desktop browser, no permission). The value is unwrapped (359 then 1 reads as 359 then
 * 361) so a rotation animated toward it never spins the long way round.
 */
export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Native readings are smoothed (see SMOOTHING); the web's arrive steady and the beam eases there.
    const smoothing = Platform.OS === 'web' ? 1 : SMOOTHING;
    let smoothed: number | null = null;
    const update = (degrees: number) => {
      if (cancelled || !Number.isFinite(degrees)) return;
      // The nearest equivalent of `degrees` to the running heading, so turns stay continuous.
      smoothed = smoothed == null ? degrees : smoothed + ((((degrees - smoothed) % 360) + 540) % 360 - 180) * smoothing;
      const next = smoothed;
      setHeading((previous) => (previous == null || Math.abs(next - previous) >= MIN_TURN_DEGREES ? next : previous));
    };

    if (Platform.OS !== 'web') {
      let subscription: { remove: () => void } | null = null;
      (async () => {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted' || cancelled || typeof Location.watchHeadingAsync !== 'function') return;
          subscription = await Location.watchHeadingAsync(({ magHeading, trueHeading }) => update(trueHeading >= 0 ? trueHeading : magHeading));
          if (cancelled) subscription.remove();
        } catch {
          // No compass: no beam.
        }
      })();
      return () => {
        cancelled = true;
        subscription?.remove();
      };
    }

    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return undefined;
    // iOS Safari reports the compass directly; Chrome reports an absolute alpha (counterclockwise).
    const onOrientation = (event: Event) => {
      const { absolute, alpha, webkitCompassHeading } = event as CompassEvent;
      if (typeof webkitCompassHeading === 'number') update(webkitCompassHeading);
      else if (absolute && typeof alpha === 'number') update((360 - alpha) % 360);
    };
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    // iOS asks for motion access, and only from a tap: the rider's first tap anywhere asks once.
    const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    const askOnTap = () => {
      requestPermission?.().catch(() => undefined);
      window.removeEventListener('click', askOnTap);
    };
    if (requestPermission) window.addEventListener('click', askOnTap);
    return () => {
      cancelled = true;
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('click', askOnTap);
    };
  }, []);

  return heading;
}

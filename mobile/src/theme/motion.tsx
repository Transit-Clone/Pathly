import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, StyleSheet } from 'react-native';

import { useAppSettings } from './AppSettings';

export const useNativeDriver = Platform.OS !== 'web';

const LAYOUT_EASE = LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

/** Eases the next layout change (expanding panels, filtered lists, swapped tab content). */
export function animateNextLayout(reducedMotion: boolean) {
  if (!reducedMotion) LayoutAnimation.configureNext(LAYOUT_EASE);
}

/** Hook form of `animateNextLayout` that reads the rider's motion preference. */
export function useLayoutEase() {
  const { reducedMotionActive } = useAppSettings();
  return () => animateNextLayout(reducedMotionActive);
}

/** Fades a screen in with a slight upward settle when it mounts. Remount it (via `key`) to replay. */
export function ScreenTransition({ children }: { children: ReactNode }) {
  const { reducedMotionActive } = useAppSettings();
  const [progress] = useState(() => new Animated.Value(reducedMotionActive ? 1 : 0));

  useEffect(() => {
    if (reducedMotionActive) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver }).start();
  }, [progress, reducedMotionActive]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={[styles.fill, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, StyleSheet, View } from 'react-native';

import { useAppSettings, useTheme } from './AppSettings';

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
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(reducedMotionActive ? 1 : 0));

  useEffect(() => {
    if (reducedMotionActive) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver }).start();
  }, [progress, reducedMotionActive]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  // The new page is mostly there from the first frame and only firms up, so there is never a
  // blank (white, or in dark mode black) moment between pages that reads like a failed load.
  // The theme's surface sits behind for the little that shows through.
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <Animated.View style={[styles.fill, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

/**
 * Gives its child a quick spring "pop" each time `active` turns true (not on first render) —
 * the little reward when a route or place is starred. Still under reduced motion.
 */
export function PopOnActivate({ active, children }: { active: boolean; children: ReactNode }) {
  const { reducedMotionActive } = useAppSettings();
  const [scale] = useState(() => new Animated.Value(1));
  const wasActive = useRef(active);

  useEffect(() => {
    const turnedOn = active && !wasActive.current;
    wasActive.current = active;
    if (!turnedOn || reducedMotionActive) return;
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 16, useNativeDriver }).start();
  }, [active, reducedMotionActive, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

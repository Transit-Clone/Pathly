import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';

import { useAppSettings, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { useNativeDriver } from '../theme/motion';
import { radii } from '../theme/shape';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';

const SHOW_MS = 2200;

/** A confirmation to pop up; a new `id` replays it even when the text repeats. */
export type ToastMessage = { text: string; id: number };

/**
 * A short confirmation ("Text size set to Large") that springs up from the bottom of the screen,
 * stays a moment, and fades away, instead of a line of text left on the page.
 */
export function Toast({ message, onHidden }: { message: ToastMessage | null; onHidden: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { reducedMotionActive } = useAppSettings();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return undefined;
    progress.setValue(reducedMotionActive ? 1 : 0);
    const enter = reducedMotionActive
      ? null
      : Animated.spring(progress, { toValue: 1, speed: 16, bounciness: 9, useNativeDriver });
    enter?.start();
    const timer = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver }).start(({ finished }) => {
        if (finished) onHidden();
      });
    }, SHOW_MS);
    return () => {
      clearTimeout(timer);
      enter?.stop();
    };
  }, [message, onHidden, progress, reducedMotionActive]);

  if (!message) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.toast, { opacity: progress, transform: [{ translateY }, { scale }] }]}
      testID="settings-toast"
    >
      <Icon color={colors.onPrimary} name="ok" size={18} />
      <Text numberOfLines={2} style={styles.text}>{message.text}</Text>
    </Animated.View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flexShrink: 1, color: colors.onPrimary, fontFamily: fontFamilies.bold, fontSize: 14 },
});

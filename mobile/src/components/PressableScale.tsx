import { forwardRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';

import { useAppSettings } from '../theme/AppSettings';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** Scale while pressed; small values read as a soft, physical press. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pressable that eases down in scale and opacity while touched and springs back on release,
 * instead of snapping between states. Falls back to an instant opacity change under reduced motion.
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { disabled, onPressIn, onPressOut, pressedScale = 0.97, style, ...rest },
  ref,
) {
  const { reducedMotionActive } = useAppSettings();
  const [progress] = useState(() => new Animated.Value(0));

  const animateTo = (toValue: number) => {
    const useNativeDriver = Platform.OS !== 'web';
    if (reducedMotionActive) {
      progress.setValue(toValue);
      return;
    }
    Animated.spring(progress, { toValue, speed: 40, bounciness: toValue === 0 ? 6 : 0, useNativeDriver }).start();
  };

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reducedMotionActive ? 1 : pressedScale] });
  // Scales the caller's own opacity (e.g. a faded "scheduled" tile) rather than replacing it,
  // which previously reset every pressable to fully opaque at rest.
  const flatOpacity = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof flatOpacity === 'number' ? flatOpacity : 1;
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [baseOpacity, baseOpacity * 0.78] });

  return (
    <AnimatedPressable
      {...rest}
      ref={ref}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        animateTo(1);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        animateTo(0);
        onPressOut?.(event);
      }}
      style={[style, { opacity, transform: [{ scale }] }]}
    />
  );
});

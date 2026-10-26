import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { useAppSettings, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { FitText } from './FitText';

const HEIGHT = 46;
const PADDING = 4;
/** A swipe across the switch this far (pt) changes direction, as a tap on the other side does. */
const SWIPE_THRESHOLD = 24;

type DirectionSwitchProps = {
  /** 0 is the left side, 1 the right. */
  activeIndex: number;
  color: string;
  /** Each side's destination, shown on it. */
  labels: readonly [string, string];
  onChange: (index: number) => void;
};

/** Dark text on light line colors (the N/Q/R's yellow), white on the rest. */
function textOn(color: string, light: string, dark: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return light;
  const value = parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? dark : light;
}

/**
 * A line's two directions as one wide oval: each half names a destination, and the knob, in the
 * line's color, glides under the chosen one. Tap a side or swipe across the switch.
 */
export function DirectionSwitch({ activeIndex, color, labels, onChange }: DirectionSwitchProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { reducedMotionActive } = useAppSettings();
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(activeIndex));
  const half = Math.max(0, (width - PADDING * 2) / 2);

  useEffect(() => {
    if (reducedMotionActive) {
      position.setValue(activeIndex);
      return;
    }
    // One smooth glide, no overshoot.
    Animated.timing(position, { toValue: activeIndex, duration: 260, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [activeIndex, position, reducedMotionActive]);

  // A horizontal swipe anywhere on the switch picks the side it points to.
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) >= SWIPE_THRESHOLD) onChange(gesture.dx > 0 ? 1 : 0);
    },
  }), [onChange]);

  const translateX = position.interpolate({ inputRange: [0, 1], outputRange: [0, half], extrapolate: 'clamp' });
  const selectedText = textOn(color, colors.white, '#111111');

  return (
    <View
      {...swipe.panHandlers}
      accessibilityRole="radiogroup"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.track}
      testID="route-direction-switch"
    >
      {half > 0 ? <Animated.View pointerEvents="none" style={[styles.knob, { width: half, backgroundColor: color, transform: [{ translateX }] }]} /> : null}
      {labels.map((label, index) => {
        const selected = index === activeIndex;
        return (
          <Pressable
            key={index}
            accessibilityLabel={`Show ${label} predictions`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(index)}
            style={styles.side}
            testID={`route-direction-switch-${index}`}
          >
            <FitText minimumScale={0.5} style={[styles.label, { color: selected ? selectedText : colors.mutedInk }]} testID={selected ? 'route-detail-destination' : undefined}>
              {label}
            </FitText>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  track: {
    width: '100%',
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    padding: PADDING,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.surfaceMuted,
  },
  knob: {
    position: 'absolute',
    top: PADDING,
    left: PADDING,
    height: HEIGHT - PADDING * 2,
    borderRadius: (HEIGHT - PADDING * 2) / 2,
  },
  side: {
    flex: 1,
    height: HEIGHT - PADDING * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    textAlign: 'center',
  },
});

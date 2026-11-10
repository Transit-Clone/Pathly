import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { useAppSettings, useTheme } from '../theme/AppSettings';

const TRACK_WIDTH = 50;
const TRACK_HEIGHT = 30;
const KNOB = 24;
const INSET = (TRACK_HEIGHT - KNOB) / 2;
const TRAVEL = TRACK_WIDTH - KNOB - INSET * 2;
/** How much wider the knob grows while a finger is on it, like a squeezed bead. */
const PRESS_STRETCH = 6;

type AnimatedSwitchProps = {
  value: boolean;
  /** Left out for a switch that only shows its row's state (the row itself is what's tapped). */
  onValueChange?: (value: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * An on/off switch that moves: the knob springs across with a little settle, the track's color
 * fades between off and on, and the knob stretches toward its travel while pressed. The platform
 * switch just snaps on Android. With reduced motion it changes at once.
 */
export function AnimatedSwitch({ accessibilityLabel, onValueChange, testID, value }: AnimatedSwitchProps) {
  const { colors } = useTheme();
  const { reducedMotionActive } = useAppSettings();
  // The knob's slide (native driver) and the track's color (JS driver) are separate values: one
  // Animated.Value can't run on both drivers.
  const [slide] = useState(() => new Animated.Value(value ? 1 : 0));
  const [tint] = useState(() => new Animated.Value(value ? 1 : 0));
  const [press] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const to = value ? 1 : 0;
    if (reducedMotionActive) {
      slide.setValue(to);
      tint.setValue(to);
      return;
    }
    Animated.parallel([
      Animated.spring(slide, { toValue: to, speed: 16, bounciness: 9, useNativeDriver: true }),
      Animated.timing(tint, { toValue: to, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [reducedMotionActive, slide, tint, value]);

  const squeeze = (to: number) => {
    if (reducedMotionActive) return;
    Animated.spring(press, { toValue: to, speed: 30, bounciness: 0, useNativeDriver: true }).start();
  };

  const backgroundColor = tint.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  // Stretching from the side it rests on: pulled toward the middle, not out of the track.
  const stretchShift = Animated.multiply(press, slide.interpolate({ inputRange: [0, 1], outputRange: [PRESS_STRETCH / 2, -PRESS_STRETCH / 2] }));
  const scaleX = press.interpolate({ inputRange: [0, 1], outputRange: [1, (KNOB + PRESS_STRETCH) / KNOB] });

  const track = (
    <Animated.View style={[styles.track, { backgroundColor }]}>
      <Animated.View style={[styles.knob, { transform: [{ translateX: Animated.add(translateX, stretchShift) }, { scaleX }] }]} />
    </Animated.View>
  );

  if (!onValueChange) {
    return <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants" pointerEvents="none">{track}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      onPressIn={() => squeeze(1)}
      onPressOut={() => squeeze(0)}
      testID={testID}
    >
      {track}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: INSET,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
});

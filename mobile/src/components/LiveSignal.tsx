import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppSettings } from '../theme/AppSettings';

type LiveSignalProps = {
  color?: string;
  /** Placement supplied by the caller, typically absolute beside a number so the number stays centered. */
  style?: StyleProp<ViewStyle>;
};

const SIZE = 14;
/** Width a caller should mirror on the other side of a number so the number stays centered. */
export const LIVE_SIGNAL_WIDTH = SIZE + 2;
const STROKE = 2.4;
const PULSE_LOW = 0.25;
const PULSE_HALF_MS = 900;
const OUTER_ARC_DELAY_MS = 450;

const arcs = [
  { d: 'M2.6 6.4 A5 5 0 0 1 7.6 11.4', delay: 0 },
  { d: 'M2.6 1.9 A9.5 9.5 0 0 1 12.1 11.4', delay: OUTER_ARC_DELAY_MS },
] as const;

/** Two-arc live-GPS signal whose arcs blink in turn, unless reduced motion is on. */
export function LiveSignal({ color = '#FFFFFF', style }: LiveSignalProps) {
  const { reducedMotionActive } = useAppSettings();
  const [opacities] = useState(() => arcs.map(() => new Animated.Value(1)));

  useEffect(() => {
    if (reducedMotionActive) {
      opacities.forEach((opacity) => opacity.setValue(1));
      return undefined;
    }
    const useNativeDriver = Platform.OS !== 'web';
    const easing = Easing.inOut(Easing.quad);
    const pulses = opacities.map((opacity, index) => {
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: PULSE_LOW, duration: PULSE_HALF_MS, easing, useNativeDriver }),
          Animated.timing(opacity, { toValue: 1, duration: PULSE_HALF_MS, easing, useNativeDriver }),
        ]),
      );
      const delay = arcs[index]!.delay;
      return delay > 0 ? Animated.sequence([Animated.delay(delay), blink]) : blink;
    });
    pulses.forEach((pulse) => pulse.start());
    return () => {
      pulses.forEach((pulse) => pulse.stop());
      opacities.forEach((opacity) => opacity.setValue(1));
    };
  }, [opacities, reducedMotionActive]);

  return (
    <View
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.signal, style]}
      testID="live-gps-signal"
    >
      {arcs.map((arc, index) => (
        <Animated.View key={arc.d} style={[StyleSheet.absoluteFill, { opacity: opacities[index] }]} testID={`live-gps-arc-${index}`}>
          <Svg height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
            <Path d={arc.d} fill="none" stroke={color} strokeLinecap="round" strokeWidth={STROKE} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  signal: {
    width: SIZE,
    height: SIZE,
  },
});

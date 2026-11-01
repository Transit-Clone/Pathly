import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { BeanAvatar } from '../avatars/BeanAvatarImage';
import { beanWithMood, type BeanMood } from '../avatars/beanAvatar';
import { useAppSettings } from '../theme/AppSettings';
import { useNativeDriver } from '../theme/motion';

/**
 * - pop: springs in once when it appears (arrival).
 * - bob: a slow float while something loads.
 * Both are skipped under reduced motion.
 */
export type MascotMotion = 'none' | 'pop' | 'bob';

type MascotProps = {
  /** The face for this moment, on the rider's own color and hair. */
  mood?: BeanMood;
  motion?: MascotMotion;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The rider's own Pathling, standing in on loading and empty screens (before sign-in, the default
 * one). Decorative: screen readers skip it, and the text beside it carries the meaning.
 */
export function Mascot({ mood = 'own', motion = 'none', size = 72, style, testID = 'mascot' }: MascotProps) {
  const { avatar } = useAuth();
  const { reducedMotionActive } = useAppSettings();
  const [progress] = useState(() => new Animated.Value(motion === 'pop' && !reducedMotionActive ? 0 : 1));
  const [float] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducedMotionActive) {
      progress.setValue(1);
      return undefined;
    }
    if (motion === 'pop') {
      Animated.spring(progress, { toValue: 1, speed: 10, bounciness: 14, useNativeDriver }).start();
      return undefined;
    }
    if (motion === 'bob') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(float, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    return undefined;
  }, [float, motion, progress, reducedMotionActive]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] });

  return (
    <Animated.View
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, opacity: progress, transform: [{ scale }, { translateY }] }, style]}
      testID={testID}
    >
      <BeanAvatar config={beanWithMood(avatar, mood)} size={size} />
    </Animated.View>
  );
}

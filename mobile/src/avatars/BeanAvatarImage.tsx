import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useAppSettings } from '../theme/AppSettings';

import { beanAvatarSvg, type BeanAvatarConfig } from './beanAvatar';

type BeanAvatarProps = {
  config?: BeanAvatarConfig;
  size?: number;
  animated?: boolean;
  /** Omit when adjacent text already identifies the person. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Same SVG renderer on web, iOS, and Android; no bitmap exports or downloads required. */
export function BeanAvatar({ config, size = 48, animated = false, accessibilityLabel, style, testID }: BeanAvatarProps) {
  const { reducedMotionActive } = useAppSettings();
  const [idle] = useState(() => new Animated.Value(0));
  const moving = animated && !reducedMotionActive;
  useEffect(() => {
    if (!moving) { idle.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(idle, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(idle, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); idle.setValue(0); };
  }, [idle, moving]);
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[{ width: size, height: size }, style]}
      testID={testID}
    >
      <Animated.View style={moving ? { transform: [
        { translateY: idle.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.025] }) },
        { rotate: idle.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
      ] } : undefined}>
        <SvgXml accessible={false} xml={beanAvatarSvg(config)} width={size} height={size} />
      </Animated.View>
    </View>
  );
}

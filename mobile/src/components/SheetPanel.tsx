import { useEffect, useState } from 'react';
import { Animated, Easing, useWindowDimensions, type ViewProps } from 'react-native';

import { useAppSettings } from '../theme/AppSettings';

/** How long the sheet takes to rise into place. */
const RISE_MS = 300;

/**
 * A bottom sheet's panel that rises into place when its popup opens. Its Modal fades (the dim
 * backdrop fades in where it stands), so only the panel itself moves. With reduced motion it is
 * simply there.
 */
export function SheetPanel({ children, style, ...rest }: ViewProps) {
  const { reducedMotionActive } = useAppSettings();
  const { height } = useWindowDimensions();
  const [rise] = useState(() => new Animated.Value(reducedMotionActive ? 0 : 1));
  useEffect(() => {
    if (reducedMotionActive) {
      rise.setValue(0);
      return;
    }
    // Eased to a stop rather than sprung: an overshoot would lift the sheet off the screen's edge.
    Animated.timing(rise, { toValue: 0, duration: RISE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reducedMotionActive, rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.6] });
  return <Animated.View {...rest} style={[style, { transform: [{ translateY }] }]}>{children}</Animated.View>;
}

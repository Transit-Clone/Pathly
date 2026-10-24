import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { useAppSettings, useTheme } from '../theme/AppSettings';
import { useNativeDriver } from '../theme/motion';

/**
 * - happy: the app icon's face — sign-in, favorites, the support ask.
 * - celebrate: arrival.
 * - thinking: loading and "nothing found yet".
 * - worried: live data or GPS trouble.
 * - sleepy: nothing here yet (no recent trips).
 */
export type MascotPose = 'happy' | 'celebrate' | 'thinking' | 'worried' | 'sleepy';

/**
 * - pop: springs in once when it appears (arrival).
 * - bob: a slow float while something loads.
 * Both are skipped under reduced motion.
 */
export type MascotMotion = 'none' | 'pop' | 'bob';

type MascotProps = {
  pose?: MascotPose;
  motion?: MascotMotion;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// The "P" from the app icon (assets/pathly-app-store-1024.png), traced in its 1024 grid. Its
// tail is the path Pathly is named for; the groove across it is drawn in the background color.
const BODY = 'M258 235C262 190 300 172 350 170L590 168C720 168 830 250 830 400C830 520 740 595 610 605C520 612 432 626 396 680C370 720 366 780 353 830C346 858 322 868 290 868L236 868C206 868 190 850 195 820L215 655Z';
const GROOVE = 'M222 650C330 562 470 532 596 524';
const VIEW_BOX = '150 120 760 780';

function Face({ pose, ink, accent }: { pose: MascotPose; ink: string; accent: string }) {
  const stroke = { stroke: ink, strokeLinecap: 'round' as const, fill: 'none' };
  switch (pose) {
    case 'celebrate':
      return (
        <G>
          {/* Eyes squeezed shut with joy, a wide open smile, and two sparkles. */}
          <Path d="M386 398Q418 352 450 398" strokeWidth={26} {...stroke} />
          <Path d="M633 374Q665 328 697 374" strokeWidth={26} {...stroke} />
          <Path d="M490 420Q545 418 600 410Q590 482 545 486Q498 488 490 420Z" fill={ink} />
          <Path d="M800 170l14 38 38 14-38 14-14 38-14-38-38-14 38-14z" fill={accent} />
          <Path d="M868 300l9 24 24 9-24 9-9 24-9-24-24-9 24-9z" fill={accent} />
        </G>
      );
    case 'thinking':
      return (
        <G>
          {/* Looking up and to the side, mouth pursed, with a thought bubble. */}
          <Ellipse cx={428} cy={378} fill={ink} rx={30} ry={40} />
          <Ellipse cx={675} cy={352} fill={ink} rx={30} ry={40} />
          <Path d="M520 438L580 430" strokeWidth={24} {...stroke} />
          <Circle cx={790} cy={200} fill={accent} r={22} />
          <Circle cx={845} cy={150} fill={accent} r={16} />
          <Circle cx={885} cy={112} fill={accent} r={11} />
        </G>
      );
    case 'worried':
      return (
        <G>
          {/* Raised brows, a wobbly frown, and a sweat drop. */}
          <Ellipse cx={418} cy={398} fill={ink} rx={30} ry={42} />
          <Ellipse cx={665} cy={373} fill={ink} rx={30} ry={42} />
          <Path d="M380 330L452 318" strokeWidth={20} {...stroke} />
          <Path d="M630 300L700 300" strokeWidth={20} {...stroke} />
          <Path d="M500 460Q522 430 545 450Q568 470 592 440" strokeWidth={24} {...stroke} />
          <Path d="M770 270C770 270 800 310 800 330A30 30 0 0 1 740 330C740 310 770 270 770 270Z" fill={accent} />
        </G>
      );
    case 'sleepy':
      return (
        <G>
          {/* Closed eyes, a small content smile, and a "z". */}
          <Path d="M388 392Q418 420 448 392" strokeWidth={24} {...stroke} />
          <Path d="M635 368Q665 396 695 368" strokeWidth={24} {...stroke} />
          <Path d="M520 440Q545 456 570 436" strokeWidth={22} {...stroke} />
          <Path d="M790 170H850L790 230H850" strokeWidth={20} strokeLinejoin="round" {...stroke} stroke={accent} />
        </G>
      );
    default:
      return (
        <G>
          <Ellipse cx={418} cy={393} fill={ink} rx={32} ry={44} />
          <Ellipse cx={665} cy={368} fill={ink} rx={32} ry={44} />
          <Path d="M503 425Q545 474 588 413" strokeWidth={26} {...stroke} />
        </G>
      );
  }
}

/**
 * Pathly, the app's mascot. Drawn in the brand blue with its face cut out in the surface color, so
 * it reads on light and dark backgrounds alike. Decorative: screen readers skip it, and the text
 * beside it carries the meaning.
 */
export function Mascot({ motion = 'none', pose = 'happy', size = 72, style, testID = 'mascot' }: MascotProps) {
  const { colors } = useTheme();
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
      style={[{ width: size, height: size * (780 / 760), opacity: progress, transform: [{ scale }, { translateY }] }, style]}
      testID={testID}
    >
      <Svg height="100%" viewBox={VIEW_BOX} width="100%">
        <Path d={BODY} fill={colors.primary} />
        <Path d={GROOVE} fill="none" stroke={colors.surface} strokeLinecap="round" strokeWidth={34} />
        <Face accent={colors.highlight} ink={colors.surface} pose={pose} />
      </Svg>
    </Animated.View>
  );
}

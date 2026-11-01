import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { BeanAvatar } from '../avatars/BeanAvatarImage';
import type { BeanAvatarConfig } from '../avatars/beanAvatar';
import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { useNativeDriver } from '../theme/motion';
import { radii } from '../theme/shape';
import { typography } from '../theme/typography';

const TALK_MOUTH_MS = 200;
/** How long its mouth moves, how long a line stays up, and the quiet before the next one. */
const TALK_MS = 2600;
const LINE_MS = 8000;
const IDLE_MS = 16000;

/** What the rider's own Pathling says on the settings page. */
const SETTINGS_LINES = [
  'Change whatever you like. I look good either way.',
  'Your trains are running. Probably.',
  'I would stand clear of the closing doors, but I like the thrill.',
  'Have you tried turning the subway off and on again?',
  'I checked. It is still two minutes away.',
  'You can change my hair under Account.',
];

/** False when the rider turned Pathling animations off, or reduced motion is on. */
export function usePathlingsMove(): boolean {
  const { easyMode, pathlingMotion, reducedMotionActive } = useAppSettings();
  return pathlingMotion && !easyMode && !reducedMotionActive;
}

type LivelyPathlingProps = {
  config: BeanAvatarConfig;
  size: number;
  /** Quickens the bob and moves its mouth. */
  talking?: boolean;
  /** Starts the bob later, so a group doesn't move in step. */
  delayMs?: number;
  testID?: string;
};

/** A Pathling that gently bobs, and whose mouth moves while it talks; still when animations are off. */
export function LivelyPathling({ config, delayMs = 0, size, talking = false, testID }: LivelyPathlingProps) {
  const moves = usePathlingsMove();
  const [bob] = useState(() => new Animated.Value(0));
  const [mouthOpen, setMouthOpen] = useState(false);
  const duration = talking ? 320 : 1300;

  useEffect(() => {
    if (!moves) {
      bob.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delayMs),
      Animated.timing(bob, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      Animated.timing(bob, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob, delayMs, duration, moves]);

  useEffect(() => {
    if (!moves || !talking) return undefined;
    const flap = setInterval(() => setMouthOpen((open) => !open), TALK_MOUTH_MS);
    return () => {
      clearInterval(flap);
      setMouthOpen(false);
    };
  }, [moves, talking]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.07] });
  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <BeanAvatar config={mouthOpen ? { ...config, mouth: 'oh' } : config} size={size} testID={testID} />
    </Animated.View>
  );
}

/** The rider's Pathling at the top of settings, saying something now and then. Decorative: screen readers skip the talk. */
export function SettingsPathling({ size, testID }: { size: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const { avatar } = useAuth();
  const moves = usePathlingsMove();
  const [start] = useState(() => Math.floor(Math.random() * SETTINGS_LINES.length));
  const [step, setStep] = useState(0);
  const [saying, setSaying] = useState(true);
  const [talking, setTalking] = useState(true);

  useEffect(() => {
    if (!moves) return undefined;
    const next = setTimeout(() => {
      if (!saying) {
        setStep((current) => current + 1);
        setTalking(true);
      }
      setSaying(!saying);
    }, saying ? LINE_MS : IDLE_MS);
    return () => clearTimeout(next);
  }, [moves, saying]);

  useEffect(() => {
    if (!moves || !talking) return undefined;
    const quiet = setTimeout(() => setTalking(false), TALK_MS);
    return () => clearTimeout(quiet);
  }, [moves, step, talking]);

  return (
    <View style={styles.stage}>
      {moves ? (
        // A fixed height, so a longer line never moves the page below.
        <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants" style={styles.bubbleRow}>
          {saying ? (
            <View style={styles.bubble}>
              <Text numberOfLines={2} style={styles.bubbleText} testID="settings-pathling-line">{SETTINGS_LINES[(start + step) % SETTINGS_LINES.length]}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <LivelyPathling config={avatar} size={size} talking={talking} testID={testID} />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  stage: { alignItems: 'center' },
  bubbleRow: { height: 58, justifyContent: 'flex-end', marginBottom: 8 },
  bubble: { maxWidth: 280, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.surface },
  bubbleText: { color: colors.ink, textAlign: 'center', ...typography.metadata },
});

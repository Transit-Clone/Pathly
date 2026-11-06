import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { randomBeanAvatar } from '../avatars/beanAvatar';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii } from '../theme/shape';
import { LivelyPathling, usePathlingsMove } from './LivelyPathling';

const LINE_MS = 5000;

/** Short back-and-forths; the beans take turns saying each line. */
export const CHATS: readonly (readonly string[])[] = [
  ['Is this the express?', 'Only if you believe in it.'],
  ['Two minutes away!', 'It said that ten minutes ago.', 'Time is a suggestion.'],
  ['Why are you standing so close?', "It's rush hour.", 'We are the only ones here.'],
  ['I saved us a seat.', "We don't have legs."],
  ['Stand clear of the closing doors.', 'There are no doors here.', 'I just like saying it.'],
  ['Which way to the train?', 'Sign in and we can all find out.'],
  ['Is that a pigeon on the platform?', 'He has a monthly pass.', 'Respect.'],
  ['Next stop, snacks.', 'That is not a stop.', 'It is if you believe.'],
  ['I forgot my password.', 'Tap "Forgot password?"', 'I forgot where that is too.'],
  ['Did we just miss it?', 'There is another in eight minutes.', 'Eight whole minutes?!'],
  ['Who has the window seat?', 'We are all window seats.'],
  ['Is it a local or an express?', 'Yes.'],
  ['Why is it called rush hour?', 'Nobody is rushing.', 'Everybody is rushing.'],
  ['Sign in so I can learn your favorite lines.', 'Mine is all of them.'],
  ['Ever ridden the ferry?', 'I get seasick on escalators.'],
  ['Do you think the bus can see us?', 'Wave harder.'],
];
const LINES = CHATS.flatMap((lines, chat) => lines.map((text, index) => ({ text, speaker: (chat + index) % 3 })));

const BUBBLE_ALIGN = ['flex-start', 'center', 'flex-end'] as const;

/** Three random Pathlings chatting above the sign-in form. Decorative: screen readers skip it. */
export function PathlingChat({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  const moves = usePathlingsMove();
  const [beans] = useState(() => [randomBeanAvatar(), randomBeanAvatar(), randomBeanAvatar()]);
  const [start] = useState(() => {
    // Always opens on a chat's first line.
    const firsts = LINES.flatMap((line, index) => (CHATS.some((chat) => chat[0] === line.text) ? [index] : []));
    return firsts[Math.floor(Math.random() * firsts.length)] ?? 0;
  });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!moves) return undefined;
    const timer = setInterval(() => setStep((current) => current + 1), LINE_MS);
    return () => clearInterval(timer);
  }, [moves]);

  const line = LINES[(start + step) % LINES.length]!;
  return (
    <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants" style={[styles.stage, style]} testID="auth-pathlings">
      {/* A fixed height, so a longer line never moves the form below. */}
      <View style={styles.bubbleRow}>
        <View style={[styles.bubble, { alignSelf: BUBBLE_ALIGN[line.speaker] }]}>
          <Text numberOfLines={2} style={styles.bubbleText} testID="auth-pathlings-line">{line.text}</Text>
        </View>
      </View>
      <View style={styles.beans}>
        {beans.map((bean, index) => (
          // The one talking stands a little taller.
          <View key={index} style={index === line.speaker ? styles.speaking : null}>
            <LivelyPathling config={bean} delayMs={index * 240} size={64} talking={index === line.speaker} />
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  stage: { height: 136, justifyContent: 'flex-end' },
  bubbleRow: { height: 60, justifyContent: 'flex-end', marginBottom: 8 },
  bubble: { maxWidth: '78%', paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.surface },
  bubbleText: { color: colors.ink, ...typography.metadata },
  beans: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  speaking: { transform: [{ translateY: -4 }] },
});

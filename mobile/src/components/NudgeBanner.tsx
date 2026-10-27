import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { NudgeKind } from '../data/nudgePrompt';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const COPY: Record<NudgeKind, { icon: 'edit' | 'heart'; text: string; action: string; hint: string }> = {
  feedback: { icon: 'edit', text: 'How is Pathly working for you?', action: 'Feedback', hint: 'Opens a short feedback survey' },
  donate: { icon: 'heart', text: 'Free, built by students', action: 'Tip', hint: "Opens Pathly's donation page" },
};

/** A one-line ask under the home search bar: feedback or a tip, with a close button (see useNudgePrompt). */
export function NudgeBanner({ kind, onAct, onDismiss, style }: { kind: NudgeKind; onAct: () => void; onDismiss: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = COPY[kind];
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, style]} testID={`nudge-${kind}`}>
      <Icon color={kind === 'donate' ? colors.red : colors.primary} filled={true} name={copy.icon} size={15} />
      <Text numberOfLines={1} style={styles.text}>{copy.text}</Text>
      <PressableScale accessibilityHint={copy.hint} accessibilityRole="link" hitSlop={6} onPress={onAct} style={styles.action} testID={`nudge-${kind}-act`}>
        <Text style={styles.actionText}>{copy.action}</Text>
      </PressableScale>
      <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onDismiss} style={styles.close} testID={`nudge-${kind}-close`}>
        <Icon color={colors.mutedInk} name="close" size={14} />
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  banner: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  text: { minWidth: 0, flex: 1, color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 12 },
  action: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.blueSoft },
  actionText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  close: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});

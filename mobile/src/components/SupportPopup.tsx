import { useMemo, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { STUDENT_DISCLAIMER } from '../data/supportPrompt';
import { useAppSettings, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { useNativeDriver } from '../theme/motion';
import { radii } from '../theme/shape';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';

/** How far a drag must go (in any direction) to throw the popup away, or how fast. */
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 0.6;
/** How far a thrown popup flies before it's gone. */
const THROW_DISTANCE = 600;

/**
 * Where a released drag throws the popup, or null to spring it back: any direction counts, along
 * whichever axis the drag mostly went.
 */
export function swipeDismissTarget(dx: number, dy: number, vx = 0, vy = 0): { x: number; y: number } | null {
  const far = Math.hypot(dx, dy) >= SWIPE_DISTANCE || Math.hypot(vx, vy) >= SWIPE_VELOCITY;
  if (!far) return null;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dx / length) * THROW_DISTANCE, y: (dy / length) * THROW_DISTANCE };
}

type SupportPopupProps = {
  /** Swiped away or closed: it asks again some weeks later. */
  onDismiss: () => void;
  onFeedback: () => void;
  onNeverAsk: () => void;
  onSupport: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The home screen's occasional ask (useSupportPopup): support Pathly with a tip, or take a quick
 * survey. Swipes away in any direction; "Don't ask again" turns it off for good (also in Settings).
 */
export function SupportPopup({ onDismiss, onFeedback, onNeverAsk, onSupport, style }: SupportPopupProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { reducedMotionActive } = useAppSettings();
  const [offset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const responder = useMemo(() => PanResponder.create({
    // A tap still reaches the buttons; only a real drag moves the popup.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
    onPanResponderMove: (_event, gesture) => offset.setValue({ x: gesture.dx, y: gesture.dy }),
    onPanResponderRelease: (_event, gesture) => {
      const target = swipeDismissTarget(gesture.dx, gesture.dy, gesture.vx, gesture.vy);
      if (!target) {
        Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver }).start();
        return;
      }
      if (reducedMotionActive) {
        onDismiss();
        return;
      }
      Animated.timing(offset, { toValue: target, duration: 180, useNativeDriver }).start(() => onDismiss());
    },
    onPanResponderTerminate: () => Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver }).start(),
  }), [offset, onDismiss, reducedMotionActive]);
  const fade = offset.x.interpolate({ inputRange: [-240, 0, 240], outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' });

  return (
    <Animated.View
      accessibilityHint="Swipe away to close"
      accessibilityLiveRegion="polite"
      style={[styles.card, style, { opacity: fade, transform: offset.getTranslateTransform() }]}
      testID="support-popup"
      {...responder.panHandlers}
    >
      <View style={styles.row}>
        <Mascot mood="happy" motion="pop" size={44} />
        <View style={styles.copy}>
          <Text style={styles.title}>Enjoying Pathly?</Text>
          <Text style={styles.body}>{`${STUDENT_DISCLAIMER} A tip, or a minute of feedback, helps a lot.`}</Text>
        </View>
        <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onDismiss} style={styles.close} testID="support-popup-close">
          <Icon color={colors.mutedInk} name="close" size={16} />
        </PressableScale>
      </View>
      <View style={styles.actions}>
        <PressableScale accessibilityHint="Opens a short feedback survey" accessibilityRole="link" onPress={onFeedback} style={[styles.action, styles.feedback]} testID="support-popup-feedback">
          <Icon color={colors.primary} filled={true} name="edit" size={15} />
          <Text style={styles.feedbackText}>Quick survey</Text>
        </PressableScale>
        <PressableScale accessibilityHint="Opens Pathly's donation page" accessibilityRole="link" onPress={onSupport} style={[styles.action, styles.support]} testID="support-popup-support">
          <Icon color={colors.onHighlight} filled={true} name="heart" size={15} />
          <Text style={styles.supportText}>Support Pathly</Text>
        </PressableScale>
      </View>
      <PressableScale accessibilityHint="Turns these popups off. You can turn them back on in Settings, Notifications." accessibilityRole="button" hitSlop={6} onPress={onNeverAsk} style={styles.never} testID="support-popup-never">
        <Text style={styles.neverText}>{"Don't ask again"}</Text>
      </PressableScale>
    </Animated.View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    padding: 14,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  copy: { minWidth: 0, flex: 1 },
  title: { color: colors.ink, ...typography.bodyStrong },
  body: { marginTop: 3, color: colors.mutedInk, ...typography.metadata, lineHeight: 18 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radii.pill },
  feedback: { backgroundColor: colors.blueSoft },
  feedbackText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  support: { backgroundColor: colors.highlight },
  supportText: { color: colors.onHighlight, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  never: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, marginTop: 4 },
  neverText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 12 },
});

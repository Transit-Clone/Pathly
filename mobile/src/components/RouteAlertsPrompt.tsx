import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ROUTE_ALERT_OPTIONS, type RouteAlertSetting } from '../data/savedRoutes';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';

type RouteAlertsPromptProps = {
  /** The saved line's name ("1 train", "Port Jefferson Branch"); null hides the prompt. */
  routeName: string | null;
  onChoose: (setting: RouteAlertSetting) => void;
};

/**
 * Asked once, right after a line is saved: when should Pathly push its service alerts? Dismissing
 * it is the same as Off; Settings -> Notifications changes it later.
 */
export function RouteAlertsPrompt({ onChoose, routeName }: RouteAlertsPromptProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <Modal animationType="slide" onRequestClose={() => onChoose('off')} statusBarTranslucent={true} transparent={true} visible={routeName != null}>
      {/* A sheet from the bottom, like a stop's transfers sheet. */}
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Not now" onPress={() => onChoose('off')} style={styles.backdrop} testID="route-alerts-prompt-backdrop" />
        <View accessibilityRole="alert" accessibilityViewIsModal={true} style={styles.sheet} testID="route-alerts-prompt">
          <View style={styles.header}>
            <Mascot pose="happy" size={40} />
            <Text style={styles.title}>{`Saved ${routeName ?? ''}`}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={() => onChoose('off')} testID="route-alerts-prompt-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <Text style={styles.body}>Want a notification when it has delays or service changes?</Text>
          <View style={styles.options}>
            {ROUTE_ALERT_OPTIONS.filter((option) => option.value !== 'off').map((option) => (
              <PressableScale
                accessibilityHint={option.detail}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                key={option.value}
                onPress={() => onChoose(option.value)}
                style={styles.option}
                testID={`route-alerts-prompt-${option.value}`}
              >
                <Icon color={colors.primary} filled={option.value === 'all'} name="bell" size={22} />
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDetail}>{option.detail}</Text>
                </View>
              </PressableScale>
            ))}
          </View>
          <PressableScale accessibilityRole="button" onPress={() => onChoose('off')} style={styles.notNow} testID="route-alerts-prompt-off">
            <Text style={styles.notNowText}>Not now</Text>
          </PressableScale>
          <Text style={styles.footnote}>Change this anytime in Settings → Notifications.</Text>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  body: { marginTop: 10, color: colors.mutedInk, ...typography.body, fontSize: 15 },
  options: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.blueSoft },
  optionCopy: { flex: 1 },
  optionLabel: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  optionDetail: { marginTop: 1, color: colors.mutedInk, ...typography.metadata },
  notNow: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 23, backgroundColor: colors.background },
  notNowText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  footnote: { marginTop: 10, color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
});

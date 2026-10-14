import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { PressableScale } from './PressableScale';

type ConfirmDialogProps = {
  body: string;
  cancelLabel?: string;
  confirmLabel: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  testID: string;
  title: string;
  visible: boolean;
};

/** A centered yes/no prompt; React Native's Alert has no buttons on web, so this is drawn in-app. */
export function ConfirmDialog({ body, cancelLabel = 'Cancel', confirmLabel, destructive = false, onCancel, onConfirm, testID, title, visible }: ConfirmDialogProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent={true} transparent={true} visible={visible}>
      <View style={styles.center}>
        <Pressable accessibilityLabel={cancelLabel} onPress={onCancel} style={StyleSheet.absoluteFill} testID={`${testID}-backdrop`} />
        <View accessibilityRole="alert" accessibilityViewIsModal={true} style={styles.card} testID={testID}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <PressableScale accessibilityRole="button" onPress={onCancel} style={[styles.button, styles.cancelButton]} testID={`${testID}-cancel`}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </PressableScale>
            <PressableScale accessibilityRole="button" onPress={onConfirm} style={[styles.button, destructive ? styles.destructiveButton : styles.confirmButton]} testID={`${testID}-confirm`}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.scrim },
  card: { width: '100%', maxWidth: 360, padding: 20, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  body: { marginTop: 6, color: colors.mutedInk, ...typography.body, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  button: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  cancelButton: { backgroundColor: colors.background },
  confirmButton: { backgroundColor: colors.primary },
  destructiveButton: { backgroundColor: colors.red },
  cancelText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  confirmText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});

import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { PressableScale } from './PressableScale';

export const SHEET_HANDLE_HEIGHT = 24;
/** Any scroll beyond this counts as "moved off rest", so a handle tap collapses instead of expanding. */
export const SHEET_AT_REST_TOLERANCE = 8;

/**
 * The grip at the top of a scrolling sheet. It sits inside the page scroll, so dragging it on
 * native already scrolls the sheet like the rest of the page; tapping it (and clicking on web,
 * where mouse drags don't scroll) jumps between the resting and expanded positions.
 */
export function SheetHandle({ accessibilityHint, accessibilityLabel, onPress, testID }: { accessibilityHint: string; accessibilityLabel: string; onPress: () => void; testID: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <PressableScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.dragHandle}
      testID={testID}
    >
      <View style={styles.dragHandleGrip} />
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  dragHandle: {
    height: SHEET_HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});

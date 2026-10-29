import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { PressableScale } from './PressableScale';

export const SHEET_HANDLE_HEIGHT = 24;
/** Any scroll beyond this counts as "moved off rest", so a handle tap collapses instead of expanding. */
export const SHEET_AT_REST_TOLERANCE = 8;
/** Movement under this counts as a tap on a draggable grip, not a drag. */
const HANDLE_TAP_SLOP = 6;

type SheetHandleProps = {
  accessibilityHint: string;
  accessibilityLabel: string;
  /** Dragging the grip: called once as it's let go, with how far it moved (down is positive). */
  onDrag?: (dy: number) => void;
  /** False while the page has lowered its sheet to show more of the map. */
  expanded?: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * The grip at the top of a scrolling sheet. It sits inside the page scroll, so dragging it on
 * native already scrolls the sheet like the rest of the page; tapping it (and clicking on web,
 * where mouse drags don't scroll) jumps between the resting and expanded positions. With `onDrag`,
 * the grip takes drags itself (mouse and touch alike) and tells the page how far it moved.
 */
export function SheetHandle({ accessibilityHint, accessibilityLabel, expanded, onDrag, onPress, testID }: SheetHandleProps) {
  const styles = useThemedStyles(createStyles);
  const latest = useRef({ onDrag, onPress });
  useEffect(() => {
    latest.current = { onDrag, onPress };
  });
  // The ref is only read inside gesture callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dy) < HANDLE_TAP_SLOP) latest.current.onPress();
      else latest.current.onDrag?.(gesture.dy);
    },
  }));

  if (onDrag) {
    return (
      <View
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        accessible={true}
        onAccessibilityTap={onPress}
        style={styles.dragHandle}
        testID={testID}
        {...responder.panHandlers}
      >
        <View style={styles.dragHandleGrip} />
      </View>
    );
  }
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

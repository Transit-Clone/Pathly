import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';

export const WHEEL_ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PADDING_ROWS = Math.floor(VISIBLE_ROWS / 2);
/** Web has no momentum-end event: the wheel settles once scrolling has paused this long. */
const WEB_SETTLE_MS = 120;
const isWeb = Platform.OS === 'web';
/** Longest a wheel's own glide to a new value takes. */
const GLIDE_MS = 700;

type WheelColumnProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  items: readonly { label: string; testID: string }[];
  onSelect: (index: number) => void;
  selectedIndex: number;
  /** Tapping the picked value turns it into a text field, for typing a value instead of scrolling. */
  typeable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
};

/** The item a typed value names: the same number ("7" is "07"), else the first label it starts. */
export function wheelItemFor(items: readonly { label: string }[], text: string): number {
  const typed = text.trim().toLowerCase();
  if (!typed) return -1;
  if (/^\d+$/.test(typed)) return items.findIndex((item) => /^\d+$/.test(item.label) && Number(item.label) === Number(typed));
  return items.findIndex((item) => item.label.toLowerCase().startsWith(typed));
}

/** A snapping scroll wheel whose items can also be tapped directly, or typed when `typeable`. */
export function WheelColumn({ accessibilityLabel, disabled = false, items, keyboardType = 'number-pad', onSelect, selectedIndex, testID, typeable = false }: WheelColumnProps) {
  const styles = useThemedStyles(createStyles);
  const [typing, setTyping] = useState<string | null>(null);
  const typeValue = (text: string) => {
    setTyping(text);
    const index = wheelItemFor(items, text);
    if (index >= 0 && index !== selectedIndex) onSelect(index);
  };
  const scrollRef = useRef<ScrollView>(null);
  const webSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
  }, []);

  // Opens straight on the picked value (web ignores the initial contentOffset); later changes glide.
  const placed = useRef(false);
  // While the wheel glides itself to a value, its scroll events aren't the rider picking one
  // (web would otherwise settle on whatever number it passes); a drag mid-glide takes over again.
  const gliding = useRef<{ to: number; until: number } | null>(null);
  useEffect(() => {
    const to = selectedIndex * WHEEL_ITEM_HEIGHT;
    gliding.current = { to, until: Date.now() + GLIDE_MS };
    scrollRef.current?.scrollTo({ y: to, animated: placed.current });
    placed.current = true;
  }, [selectedIndex]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => settleAt(event.nativeEvent.contentOffset.y);
  const settleAt = (offsetY: number) => {
    const index = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    if (clamped !== selectedIndex) onSelect(clamped);
    else scrollRef.current?.scrollTo({ y: clamped * WHEEL_ITEM_HEIGHT, animated: true });
  };

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.column, disabled && styles.disabled]}>
      <View pointerEvents="none" style={styles.highlight} />
      {typing != null ? (
        <TextInput
          accessibilityLabel={`Type ${accessibilityLabel.toLowerCase()}`}
          autoFocus={true}
          keyboardType={keyboardType}
          maxLength={2}
          onBlur={() => setTyping(null)}
          onChangeText={typeValue}
          onSubmitEditing={() => setTyping(null)}
          returnKeyType="done"
          selectTextOnFocus={true}
          style={[styles.highlight, styles.typing]}
          testID={testID ? `${testID}-input` : undefined}
          value={typing}
        />
      ) : null}
      <ScrollView
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onMomentumScrollEnd={settle}
        // Web: the browser snaps rows into place (scroll-snap below); the number is picked once it stops.
        onScroll={isWeb ? (event) => {
          const offsetY = event.nativeEvent.contentOffset.y;
          const glide = gliding.current;
          if (glide && Date.now() < glide.until) {
            if (Math.abs(offsetY - glide.to) < 1) gliding.current = null;
            return;
          }
          gliding.current = null;
          if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
          webSettleTimer.current = setTimeout(() => settleAt(offsetY), WEB_SETTLE_MS);
        } : undefined}
        scrollEventThrottle={isWeb ? 16 : undefined}
        onScrollEndDrag={(event) => {
          if (!event.nativeEvent.velocity?.y) settle(event);
        }}
        ref={scrollRef}
        scrollEnabled={!disabled}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        style={isWeb ? styles.webSnap : undefined}
      >
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={item.testID}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => (selected && typeable ? setTyping(item.label) : onSelect(index))}
              style={[styles.item, isWeb && styles.webSnapItem]}
              testID={item.testID}
            >
              <Text style={[styles.itemText, selected && styles.selectedText]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  column: { flex: 1, height: WHEEL_ITEM_HEIGHT * VISIBLE_ROWS, overflow: 'hidden' },
  disabled: { opacity: 0.35 },
  highlight: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT * PADDING_ROWS,
    right: 4,
    left: 4,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
  },
  typing: { zIndex: 2, color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22, textAlign: 'center' },
  content: { paddingVertical: WHEEL_ITEM_HEIGHT * PADDING_ROWS },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  // CSS scroll snapping (react-native-web passes these through): rows always land on a number.
  webSnap: { scrollSnapType: 'y mandatory' } as object,
  webSnapItem: { scrollSnapAlign: 'center' } as object,
  itemText: { color: colors.mutedInk, fontFamily: fontFamilies.semibold, fontSize: 18 },
  selectedText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22 },
});

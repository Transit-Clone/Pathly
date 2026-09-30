import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';

export const WHEEL_ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PADDING_ROWS = Math.floor(VISIBLE_ROWS / 2);

type WheelColumnProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  items: readonly { label: string; testID: string }[];
  onSelect: (index: number) => void;
  selectedIndex: number;
};

/** A snapping scroll wheel whose items can also be tapped directly. */
export function WheelColumn({ accessibilityLabel, disabled = false, items, onSelect, selectedIndex }: WheelColumnProps) {
  const styles = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: true });
  }, [selectedIndex]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    if (clamped !== selectedIndex) onSelect(clamped);
    else scrollRef.current?.scrollTo({ y: clamped * WHEEL_ITEM_HEIGHT, animated: true });
  };

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.column, disabled && styles.disabled]}>
      <View pointerEvents="none" style={styles.highlight} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          if (!event.nativeEvent.velocity?.y) settle(event);
        }}
        ref={scrollRef}
        scrollEnabled={!disabled}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
      >
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={item.testID}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(index)}
              style={styles.item}
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
  content: { paddingVertical: WHEEL_ITEM_HEIGHT * PADDING_ROWS },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.mutedInk, fontFamily: fontFamilies.semibold, fontSize: 18 },
  selectedText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 22 },
});

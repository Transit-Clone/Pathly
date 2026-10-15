import { useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';

import type { SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/** Matches the search page's content width. */
const MAX_PAGE_WIDTH = 540;
const SIDE_PADDING = 16;
const GAP = 10;
/** Cards per screen width: two whole ones, with the third peeking in so the strip reads as swipeable. */
const CARDS_PER_VIEW = 2.35;
/** A mouse drag shorter than this (px) is a click on the card. */
const DRAG_THRESHOLD = 8;
const isWeb = Platform.OS === 'web';

/** A saved place's icon from the name it was saved under: home, work, school, or a pin. */
export function savedPlaceIcon(name: string): IconName {
  const lower = name.toLowerCase();
  if (/\b(home|house|apartment|apt)\b/.test(lower)) return 'home';
  if (/\b(work|office|job)\b/.test(lower)) return 'work';
  if (/\b(school|university|college|campus|academy)\b/.test(lower)) return 'school';
  return 'place';
}

type SavedPlacesStripProps = {
  places: readonly SavedLocation[];
  onSelect: (place: SavedLocation) => void;
};

/** Saved places in a row the rider swipes through, one tap from a trip, as in Google Maps. */
export function SavedPlacesStrip({ onSelect, places }: SavedPlacesStripProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // react-native-web's horizontal ScrollView scrolls by touch and trackpad but not by mouse drag,
  // so on web a drag across the cards scrolls the row here, while a plain click still opens one.
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const dragStartX = useRef<number | null>(null);
  if (places.length === 0) return null;
  const pageWidth = Math.min(width, MAX_PAGE_WIDTH);
  const cardWidth = Math.round((pageWidth - SIDE_PADDING - GAP * 2) / CARDS_PER_VIEW);

  const pressIn = (event: GestureResponderEvent) => {
    dragStartX.current = event.nativeEvent.pageX;
  };
  const pressOut = (event: GestureResponderEvent, place: SavedLocation) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= DRAG_THRESHOLD) {
      onSelect(place);
      return;
    }
    scrollRef.current?.scrollTo({ x: Math.max(0, scrollX.current - dx), animated: true });
  };

  return (
    <ScrollView
      accessibilityLabel="Saved places"
      contentContainerStyle={styles.row}
      decelerationRate="fast"
      horizontal={true}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => {
        scrollX.current = event.nativeEvent.contentOffset.x;
      }}
      ref={scrollRef}
      scrollEventThrottle={32}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={cardWidth + GAP}
      style={styles.strip}
      testID="search-saved-places"
    >
      {places.map((place) => {
        const { name, streetAddress } = place.address;
        return (
          <PressableScale
            key={place.id}
            accessibilityHint="Plans a trip to this saved place"
            accessibilityLabel={streetAddress ? `${name}, ${streetAddress}` : name}
            accessibilityRole="button"
            onPress={isWeb ? undefined : () => onSelect(place)}
            onPressIn={isWeb ? pressIn : undefined}
            onPressOut={isWeb ? (event) => pressOut(event, place) : undefined}
            style={[styles.card, { width: cardWidth }]}
            testID={`search-saved-place-${place.id}`}
          >
            <View style={styles.icon}>
              <Icon color={colors.primary} filled={true} name={savedPlaceIcon(name)} size={18} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.name}>{name}</Text>
              {streetAddress ? <Text numberOfLines={1} style={styles.address}>{streetAddress}</Text> : null}
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  strip: { flexGrow: 0 },
  row: { gap: GAP, paddingTop: 12, paddingHorizontal: SIDE_PADDING },
  card: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  copy: { minWidth: 0, flex: 1 },
  name: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  address: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 12 },
});

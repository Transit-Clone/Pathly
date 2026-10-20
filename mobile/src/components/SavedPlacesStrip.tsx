import { useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';

import { addressAfterName } from '../data/placesSearch';
import { findLabeledLocation, savedPlaceName, sortSavedLocations, type Location, type SavedLocation } from '../data/userData';
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

/** A saved place's icon from the name it was saved under (its label, when it has one): home, work, school, or a pin. */
export function savedPlaceIcon(name: string): IconName {
  const lower = name.toLowerCase();
  if (/\b(home|house|apartment|apt)\b/.test(lower)) return 'home';
  if (/\b(work|office|job)\b/.test(lower)) return 'work';
  if (/\b(school|university|college|campus|academy)\b/.test(lower)) return 'school';
  return 'place';
}

/** A saved place's two lines: what the rider calls it, then the place itself. */
export function savedPlaceLines(place: SavedLocation): { title: string; subtitle: string } {
  const { name, streetAddress } = place.address;
  const title = savedPlaceName(place.address);
  // A labelled place shows the place it is under its label; an unlabelled one, its address.
  return { title, subtitle: title === name ? addressAfterName(name, streetAddress) : name };
}

/** A saved place's icon: the one the rider picked, else one that follows from its name. */
export function savedLocationIcon(location: Location): IconName {
  return location.icon ?? savedPlaceIcon(savedPlaceName(location));
}

type StripCard = {
  key: string;
  icon: IconName;
  title: string;
  subtitle: string;
  label: string;
  hint: string;
  onPress: () => void;
  testID: string;
  muted?: boolean;
};

type SavedPlacesStripProps = {
  places: readonly SavedLocation[];
  onSelect: (place: SavedLocation) => void;
  /** When set, the row offers Set home and Set work until they're saved, and Add at the end. */
  onAdd?: (label?: 'Home' | 'Work') => void;
};

/** Saved places in a row the rider swipes through, one tap from a trip, as in Google Maps. */
export function SavedPlacesStrip({ onAdd, onSelect, places }: SavedPlacesStripProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // react-native-web's horizontal ScrollView scrolls by touch and trackpad but not by mouse drag,
  // so on web a drag across the cards scrolls the row here, while a plain click still opens one.
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const dragStartX = useRef<number | null>(null);
  const cards: StripCard[] = sortSavedLocations(places).map((place) => {
    const { title, subtitle } = savedPlaceLines(place);
    return {
      key: place.id,
      icon: savedLocationIcon(place.address),
      title,
      subtitle,
      label: subtitle ? `${title}, ${subtitle}` : title,
      hint: 'Plans a trip to this saved place',
      onPress: () => onSelect(place),
      testID: `search-saved-place-${place.id}`,
    };
  });
  if (onAdd) {
    const missing = (['Home', 'Work'] as const).filter((label) => !findLabeledLocation(places, label));
    cards.unshift(...missing.map((label): StripCard => ({
      key: `set-${label}`,
      icon: label === 'Home' ? 'home' : 'work',
      title: label,
      subtitle: 'Set location',
      label: `Set ${label.toLowerCase()}`,
      hint: `Searches for your ${label.toLowerCase()} address to save it`,
      onPress: () => onAdd(label),
      testID: `search-set-${label.toLowerCase()}`,
      muted: true,
    })));
    cards.push({
      key: 'add',
      icon: 'add',
      title: 'Add',
      subtitle: 'Save a place',
      label: 'Add a saved place',
      hint: 'Searches for a place to save',
      onPress: () => onAdd(),
      testID: 'search-add-saved-place',
      muted: true,
    });
  }
  if (cards.length === 0) return null;
  const pageWidth = Math.min(width, MAX_PAGE_WIDTH);
  const cardWidth = Math.round((pageWidth - SIDE_PADDING - GAP * 2) / CARDS_PER_VIEW);

  const pressIn = (event: GestureResponderEvent) => {
    dragStartX.current = event.nativeEvent.pageX;
  };
  const pressOut = (event: GestureResponderEvent, card: StripCard) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= DRAG_THRESHOLD) {
      card.onPress();
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
      {cards.map((card) => (
        <PressableScale
          key={card.key}
          accessibilityHint={card.hint}
          accessibilityLabel={card.label}
          accessibilityRole="button"
          onPress={isWeb ? undefined : card.onPress}
          onPressIn={isWeb ? pressIn : undefined}
          onPressOut={isWeb ? (event) => pressOut(event, card) : undefined}
          style={[styles.card, card.muted && styles.cardMuted, { width: cardWidth }]}
          testID={card.testID}
        >
          <View style={styles.icon}>
            <Icon color={colors.primary} filled={!card.muted} name={card.icon} size={18} />
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.name}>{card.title}</Text>
            {card.subtitle ? <Text numberOfLines={1} style={styles.address}>{card.subtitle}</Text> : null}
          </View>
        </PressableScale>
      ))}
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
  cardMuted: { borderStyle: 'dashed' },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  copy: { minWidth: 0, flex: 1 },
  name: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  address: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 12 },
});

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { departureDisplay, directionDestination, type RouteDetail, type TransitDirection } from '../data/transit';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { PressableScale } from './PressableScale';

type TransitCardProps = {
  onPress: () => void;
  /** Saved by the rider: shown first in Nearby with a small star. */
  saved?: boolean;
  route: RouteDetail;
};

const CARD_HORIZONTAL_MARGIN = 8;
// How far a touch/mouse-down has to travel before it's treated as a swipe instead of a tap.
const SWIPE_THRESHOLD = 24;

function PageBody({ index, item, route, styles }: {
  index: number;
  item: TransitDirection;
  route: RouteDetail;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.routeName} testID={`transit-${route.id}-title`}>
          {route.shortName || route.routeName}
        </Text>
        <Text numberOfLines={1} style={styles.direction}>{directionDestination(item.direction)}</Text>
        <Text numberOfLines={1} style={styles.stopName}>{item.stopName}</Text>
      </View>

      {item.unavailable ? (
        <View style={styles.timing} testID={`transit-${route.id}-arrival-${index}`}>
          {route.liveStatus === 'loading' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.unavailableText}>{'—'}</Text>}
        </View>
      ) : (
        <View style={[styles.timing, !item.live && styles.scheduledTiming]}>
          <View style={styles.timeRow}>
            {item.live ? <View style={styles.signalSpacer} /> : null}
            <Text style={styles.minutes} testID={`transit-${route.id}-arrival-${index}`}>
              {departureDisplay(item.minutes).value}
            </Text>
            {item.live ? <LiveSignal style={styles.signal} /> : null}
          </View>
          <Text style={styles.minuteUnit}>{departureDisplay(item.minutes).unit}</Text>
        </View>
      )}
    </>
  );
}

export function TransitCard({ onPress, route, saved = false }: TransitCardProps) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 540) - CARD_HORIZONTAL_MARGIN * 2;
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const updatePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  // Opens on whichever direction's next train is actually sooner, not always the first one —
  // otherwise a much closer train in the other direction could sit hidden behind a farther one
  // shown first just because of tab order. Only acts once both directions have genuine live
  // data (never guesses off the illustrative mock numbers), and only on first load. Adjusted
  // during render (React's documented pattern for this) rather than in an effect, since it's
  // a one-time derivation from props, not a subscription.
  const [hasAutoSelectedPage, setHasAutoSelectedPage] = useState(false);
  if (!hasAutoSelectedPage) {
    const [first, second] = route.directions;
    if (first.live && second.live && !first.unavailable && !second.unavailable) {
      setHasAutoSelectedPage(true);
      if (second.minutes < first.minutes) setActivePage(1);
    }
  }

  // On native, the ScrollView's own scroll position (not `activePage`) decides which page is
  // actually visible, so it's kept in sync here — covers the auto-select above and is a no-op
  // (already there) after the user's own scroll gesture updates `activePage` instead.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activePage * pageWidth, animated: false });
  }, [activePage, pageWidth]);

  const accessibilityLabelFor = (item: TransitDirection) => {
    if (item.unavailable) {
      return `${route.agency} ${route.routeName}. ${directionDestination(item.direction)}. ${item.stopName}. ${route.liveStatus === 'loading' ? 'Loading live data.' : 'Live data unavailable.'}`;
    }
    const timing = departureDisplay(item.minutes).accessibility;
    return `${route.agency} ${route.routeName}. ${directionDestination(item.direction)}. ${item.stopName}. ${timing}, ${item.live ? 'live GPS prediction' : 'scheduled time'}.`;
  };

  // react-native-web doesn't reliably hand a drag off from a nested Pressable to its parent
  // ScrollView (the same class of gesture conflict already hit with the bottom sheet's drag
  // handle) — a swipe attempt there just registers as a tap. Native keeps the ScrollView
  // paging below, which already works correctly there. On web, a single Pressable spanning
  // the active page tracks press-start/press-end position itself (Pressable already
  // normalizes touch and mouse input) and decides tap-vs-swipe from the horizontal distance.
  const dragStartX = useRef<number | null>(null);

  const handlePressIn = (event: GestureResponderEvent) => {
    dragStartX.current = event.nativeEvent.pageX;
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= SWIPE_THRESHOLD) {
      onPress();
      return;
    }
    const direction = dx < 0 ? 1 : -1;
    setActivePage((current) => Math.min(Math.max(current + direction, 0), route.directions.length - 1));
  };

  const webActiveDirection = route.directions[activePage] ?? route.directions[0];

  return (
    <View
      style={[styles.card, { backgroundColor: route.color }]}
      testID={`route-card-${route.id}`}
    >
      {Platform.OS === 'web' ? (
        <PressableScale
          accessibilityHint="Opens route details. Swipe horizontally for the other direction."
          accessibilityLabel={accessibilityLabelFor(webActiveDirection)}
          accessibilityRole="button"
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.page, { width: pageWidth }]}
          testID={`route-card-${route.id}-${activePage === 0 ? 'primary' : 'alternate'}`}
        >
          <PageBody index={activePage} item={webActiveDirection} route={route} styles={styles} />
        </PressableScale>
      ) : (
        <ScrollView
          ref={scrollRef}
          decelerationRate="fast"
          horizontal={true}
          onMomentumScrollEnd={updatePage}
          pagingEnabled={true}
          showsHorizontalScrollIndicator={false}
          testID={`transit-${route.id}-directions`}
        >
          {route.directions.map((item, index) => (
            <PressableScale
              key={`${item.direction}-${index}`}
              accessibilityHint="Opens route details. Swipe horizontally for the other direction."
              accessibilityLabel={accessibilityLabelFor(item)}
              accessibilityRole="button"
              onPress={onPress}
              style={[styles.page, { width: pageWidth }]}
              testID={`route-card-${route.id}-${index === 0 ? 'primary' : 'alternate'}`}
            >
              <PageBody index={index} item={item} route={route} styles={styles} />
            </PressableScale>
          ))}
        </ScrollView>
      )}

      {saved ? <View pointerEvents="none" style={styles.savedBadge} testID={`route-card-${route.id}-saved`}><Icon color="rgba(255,255,255,0.9)" filled={true} name="favorite" size={12} /></View> : null}
      <View accessibilityElementsHidden={true} style={styles.pageDots}>
        {route.directions.map((item, index) => (
          <View
            key={`${item.direction}-${index}`}
            style={[styles.pageDot, index === activePage && styles.activePageDot]}
          />
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    height: 104,
    overflow: 'hidden',
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    marginVertical: 3,
    borderRadius: 14,
  },
  page: {
    height: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 18,
  },
  copy: { minWidth: 0, flex: 1 },
  routeName: { color: colors.white, ...typography.displayTime },
  direction: {
    marginTop: 3,
    color: colors.white,
    ...typography.bodyStrong,
    fontSize: 13,
  },
  stopName: {
    marginTop: 2,
    color: colors.white,
    ...typography.metadata,
    opacity: 0.84,
  },
  timing: { minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  scheduledTiming: { opacity: 0.68 },
  unavailableText: {
    color: colors.white,
    opacity: 0.68,
    ...typography.displayTime,
    fontSize: 24,
  },
  dueText: {
    color: colors.white,
    ...typography.displayTime,
    fontSize: 22,
    lineHeight: 34,
  },
  timeRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  // The spacer mirrors the signal so the number stays centered over "minutes".
  signalSpacer: { width: LIVE_SIGNAL_WIDTH },
  signal: { marginLeft: 2, marginTop: 1 },
  savedBadge: { position: 'absolute', top: 6, right: 8 },
  minutes: {
    color: colors.white,
    ...typography.displayTime,
    fontSize: 35,
    lineHeight: 34,
  },
  minuteUnit: {
    marginTop: -1,
    color: colors.white,
    ...typography.label,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'none',
  },
  provenance: {
    marginTop: 5,
    color: colors.white,
    ...typography.label,
    fontSize: 9,
    lineHeight: 11,
    textTransform: 'uppercase',
  },
  pageDots: {
    position: 'absolute',
    right: 0,
    bottom: 9,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  activePageDot: { width: 14, backgroundColor: colors.white },
});

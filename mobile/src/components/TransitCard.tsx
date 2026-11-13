import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { useViewportSize } from '../hooks/useViewportSize';
import { useRouteColor } from '../data/routeColors';
import { departureDisplay, directionDestination, preferredDirectionIndex, type RouteDetail, type TransitDirection } from '../data/transit';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { FitText } from './FitText';
import { Icon } from './Icon';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { PressableScale } from './PressableScale';
import { afterClick } from './afterClick';
import { useSkeletonPulse } from './Skeleton';
import { usesWebMouseDrag } from './webMouseDrag';
import { radii } from '../theme/shape';

type TransitCardProps = {
  /** With the direction shown on the card when it was pressed (by `directions` index). */
  onPress: (directionIndex: number) => void;
  /** Saved by the rider: shown first in Nearby with a small star. */
  saved?: boolean;
  route: RouteDetail;
};

const CARD_HORIZONTAL_MARGIN = 8;
// How far a touch/mouse-down has to travel before it's treated as a swipe instead of a tap.
const SWIPE_THRESHOLD = 24;
/**
 * A drag counts as a page swipe once its sideways part is at least this share of its up-down part
 * (about 55° from horizontal), so a swipe needn't be dead level; a steeper drag scrolls the list.
 */
const SWIPE_SLOPE = 0.7;
/** On phones a gentle drag this far (pt) turns the page; the page already follows the finger. */
const PAGE_TURN_DISTANCE = 12;
/** How far a finger moves before the card claims the drag from the list. */
const CLAIM_DISTANCE = 6;
/** A quick flick turns the page even when it's shorter than PAGE_TURN_DISTANCE (points per ms). */
const FLICK_VELOCITY = 0.15;

/** A pulsing block where the minutes will appear, while the first live times load. */
function TimePlaceholder({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const opacity = useSkeletonPulse();
  return (
    <Animated.View style={[styles.timePlaceholder, { opacity }]} testID="transit-time-placeholder">
      <View style={styles.timePlaceholderNumber} />
      <View style={styles.timePlaceholderUnit} />
    </Animated.View>
  );
}

function PageBody({ index, item, route, styles }: {
  index: number;
  item: TransitDirection;
  route: RouteDetail;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <>
      <View style={styles.copy}>
        <FitText style={styles.routeName} testID={`transit-${route.id}-title`}>
          {route.shortName || route.routeName}
        </FitText>
        <FitText style={styles.direction}>{directionDestination(item.direction)}</FitText>
        <Text numberOfLines={1} style={styles.stopName}>{item.stopName}</Text>
      </View>

      {item.unavailable ? (
        <View style={styles.timing} testID={`transit-${route.id}-arrival-${index}`}>
          {route.liveStatus === 'loading' ? <TimePlaceholder styles={styles} /> : <Text style={styles.unavailableText}>{'—'}</Text>}
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

/**
 * Which direction a card opens on: the first, unless the rider is at or near the end of that
 * direction's line (or clearly at the other end's stop), where the other way is the one they'd
 * ride. Known from the stops themselves, so the card opens there at once: it never flips over
 * when live times arrive as the rider scrolls.
 */
export function openingDirectionIndex(route: RouteDetail): 0 | 1 {
  return preferredDirectionIndex(route.directions) ?? 0;
}

export function TransitCard({ onPress, route, saved = false }: TransitCardProps) {
  const styles = useThemedStyles(createStyles);
  const routeColor = useRouteColor();
  const { width } = useViewportSize();
  const pageWidth = Math.min(width, 540) - CARD_HORIZONTAL_MARGIN * 2;
  const [activePage, setActivePage] = useState<number>(() => openingDirectionIndex(route));

  // Native: the pages sit in a row that follows the finger, then settles on `activePage`. A
  // horizontal scroller nested in the vertical list only took dead-level swipes on Android (the list
  // claimed anything at an angle), so the card claims sideways-ish drags itself instead. It starts
  // already on the opening page, so nothing slides into place as the card appears.
  const [slide] = useState(() => new Animated.Value(-activePage * pageWidth));
  const pageCount = route.directions.length;
  useEffect(() => {
    Animated.spring(slide, { toValue: -activePage * pageWidth, bounciness: 0, speed: 18, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [activePage, pageWidth, slide]);
  const swipe = useMemo(() => {
    const settle = () => Animated.spring(slide, { toValue: -activePage * pageWidth, bounciness: 0, speed: 18, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => pageCount > 1 && Math.abs(gesture.dx) > CLAIM_DISTANCE && Math.abs(gesture.dx) > Math.abs(gesture.dy) * SWIPE_SLOPE,
      // Once the card has the swipe, the list mustn't take it back mid-drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => slide.setValue(-activePage * pageWidth + gesture.dx),
      onPanResponderRelease: (_event, gesture) => {
        const step = gesture.dx < -PAGE_TURN_DISTANCE || gesture.vx < -FLICK_VELOCITY ? 1 : gesture.dx > PAGE_TURN_DISTANCE || gesture.vx > FLICK_VELOCITY ? -1 : 0;
        const next = Math.min(Math.max(activePage + step, 0), pageCount - 1);
        if (next === activePage) settle();
        else setActivePage(next);
      },
      onPanResponderTerminate: settle,
    });
  }, [activePage, pageCount, pageWidth, slide]);

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
  const dragStartY = useRef(0);

  const handlePressIn = (event: GestureResponderEvent) => {
    dragStartX.current = event.nativeEvent.pageX;
    dragStartY.current = event.nativeEvent.pageY;
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    // A vertical drag scrolled the list; it isn't a tap on the card under the finger.
    if (Math.abs(event.nativeEvent.pageY - dragStartY.current) > SWIPE_THRESHOLD) return;
    if (Math.abs(dx) <= SWIPE_THRESHOLD) {
      afterClick(() => onPress(activePage));
      return;
    }
    const direction = dx < 0 ? 1 : -1;
    setActivePage((current) => Math.min(Math.max(current + direction, 0), route.directions.length - 1));
  };

  const webActiveDirection = route.directions[activePage] ?? route.directions[0];

  return (
    <View
      style={[styles.card, { backgroundColor: routeColor(route.color) }]}
      testID={`route-card-${route.id}`}
    >
      {usesWebMouseDrag ? (
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
        <Animated.View
          {...swipe.panHandlers}
          style={{ flexDirection: 'row', width: pageWidth * pageCount, transform: [{ translateX: slide }] }}
          testID={`transit-${route.id}-directions`}
        >
          {route.directions.map((item, index) => (
            <PressableScale
              key={`${item.direction}-${index}`}
              accessibilityHint="Opens route details. Swipe horizontally for the other direction."
              accessibilityLabel={accessibilityLabelFor(item)}
              accessibilityRole="button"
              onPress={() => onPress(index)}
              style={[styles.page, { width: pageWidth }]}
              testID={`route-card-${route.id}-${index === 0 ? 'primary' : 'alternate'}`}
            >
              <PageBody index={index} item={item} route={route} styles={styles} />
            </PressableScale>
          ))}
        </Animated.View>
      )}

      {saved ? <View pointerEvents="none" style={styles.savedBadge} testID={`route-card-${route.id}-saved`}><Icon color="rgba(255,255,255,0.9)" name="favorite" size={12} /></View> : null}
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
    borderRadius: radii.card,
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
  // Translucent white reads as gray on any route color.
  timePlaceholder: { alignItems: 'center', gap: 5 },
  timePlaceholderNumber: { width: 34, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.32)' },
  timePlaceholderUnit: { width: 30, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.24)' },
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
  // Two round dots; the shown direction's is solid white.
  activePageDot: { backgroundColor: colors.white },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyRouteLive } from '../data/applyRouteLive';
import type { RecentTripV1 } from '../data/navigationStorage';
import { useTransitLiveMap } from '../data/TransitLiveContext';
import type { RouteDetail } from '../data/transit';
import { sortSavedLocations, type SavedLocation } from '../data/userData';
import { useNow } from '../hooks/useNow';
import { useTouchScroll } from '../hooks/useTouchScroll';
import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase, useNativeDriver } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { AddSavedPlaceCard, SavedLocationCard } from './SavedLocationCard';
import { Mascot } from './Mascot';
import { NearbySkeleton } from './Skeleton';
import { TransitCard } from './TransitCard';
import { PressableScale } from './PressableScale';
import { RecentTripCard } from './RecentTripCard';
import { SHEET_AT_REST_TOLERANCE, SheetHandle } from './SheetHandle';
import { radii } from '../theme/shape';

export type TransitTabId = 'nearby' | 'recents' | 'favorites';

type TransitSheetProps = {
  activeTab: TransitTabId;
  /** Resolves a route id — the demo catalog's own or a dynamically-discovered one — to its full data, for pinned/favorited routes which can be either kind. */
  findRoute: (routeId: string) => RouteDetail | undefined;
  mapHeight: number;
  /** Every real nearby route for the rider's current location, across every configured agency (nearbyTransit.ts) — not a fixed handful of hand-picked lines. */
  nearbyRoutes: readonly RouteDetail[];
  nearbyStatus: 'loading' | 'loaded' | 'error';
  onOpenSavedLocation: (location: SavedLocation) => void;
  /** Starts saving a new place; offered under Favorites -> Places when set. */
  onAddSavedPlace?: () => void;
  /** Opens a fresh route search for a completed trip; stored provider results are never replayed. */
  onOpenRecentTrip: (trip: RecentTripV1) => void;
  onOpenRoute: (routeId: string) => void;
  onTabChange: (tab: TransitTabId) => void;
  /** Destinations saved with a trip's star (Firestore savedLocations), under Favorites -> Places. */
  savedLocations: readonly SavedLocation[];
  /** Routes saved with the star: listed first in Nearby when they run near the map's spot, and under Favorites -> Routes. */
  savedRouteIds: readonly string[];
  /** The saved routes that run near the map's spot (found by the nearby search); others wait under Favorites. */
  savedNearbyRouteIds?: ReadonlySet<string>;
  /** Completed local trips, newest first and already scoped to the signed-in account. */
  recentTrips: readonly RecentTripV1[];
  scrollY: Animated.Value;
  /** The route ids of the cards currently on screen in the active tab, whenever that set changes. */
  onVisibleRouteIdsChange?: (routeIds: readonly string[]) => void;
};

const TAB_ROW_HEIGHT = 44;
const TAB_ROW_PADDING = 16;
const TAB_GAP = 4;
const TRANSIT_CARD_HEIGHT = 104;
// Expanded = sheet scrolled up to just below the fixed search header (HomeScreen's 80pt top inset).
const EXPANDED_TOP = 80;

/** How long after a scroll or layout change the visible cards are recomputed. */
const VISIBILITY_THROTTLE_MS = 150;
const tabs: { id: TransitTabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  activeTab,
  findRoute,
  mapHeight,
  nearbyRoutes,
  nearbyStatus,
  onOpenSavedLocation,
  onAddSavedPlace,
  onOpenRecentTrip,
  onOpenRoute,
  onTabChange,
  onVisibleRouteIdsChange,
  recentTrips,
  savedLocations,
  savedNearbyRouteIds,
  savedRouteIds,
  scrollY,
}: TransitSheetProps) {
  const styles = useThemedStyles(createStyles);
  const liveMap = useTransitLiveMap();
  // Re-applies live data every 30 s so countdowns age and past departures drop between polls.
  const now = useNow(30_000);
  // A saved line leads Nearby only where it runs nearby (found by the nearby search, about a mile
  // out); elsewhere it waits under Favorites. Until that search answers, saved lines still show.
  const savedRoutes = savedRouteIds
    .filter((id) => nearbyStatus !== 'loaded' || !savedNearbyRouteIds || savedNearbyRouteIds.has(id))
    .map((id) => findRoute(id))
    .filter((route): route is RouteDetail => route != null)
    .map((route) => applyRouteLive(route, liveMap.get(route.id) ?? { status: 'error' }, now));
  const nearbyCards = nearbyRoutes
    .filter((route) => !savedRouteIds.includes(route.id))
    .map((route) => applyRouteLive(route, liveMap.get(route.id) ?? { status: 'error' }, now));
  // Keeps the sheet's resting height stable across tabs — the Nearby tab's own count varies with
  // the rider's real location, so this can't be a fixed constant. Never below three cards, so
  // the single-scroll page always has room to scroll the menu up.
  const tabContentMinHeight = Math.max(3, savedRoutes.length + nearbyCards.length) * TRANSIT_CARD_HEIGHT;
  const hasFavorites = savedRouteIds.length > 0 || savedLocations.length > 0;
  const ease = useLayoutEase();
  const { reducedMotionActive } = useAppSettings();
  const [tabsWidth, setTabsWidth] = useState(0);
  const [indicatorX] = useState(() => new Animated.Value(0));
  const tabWidth = Math.max(0, (tabsWidth - TAB_ROW_PADDING * 2 - TAB_GAP * (tabs.length - 1)) / tabs.length);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  useEffect(() => {
    const toValue = TAB_ROW_PADDING + activeIndex * (tabWidth + TAB_GAP);
    if (reducedMotionActive || tabWidth === 0) {
      indicatorX.setValue(toValue);
      return;
    }
    Animated.spring(indicatorX, { toValue, speed: 18, bounciness: 4, useNativeDriver }).start();
  }, [activeIndex, indicatorX, reducedMotionActive, tabWidth]);

  const pageScrollRef = useRef<ScrollViewInstance>(null);
  useTouchScroll(pageScrollRef);
  const scrollOffset = useRef(0);
  const expandedOffset = Math.max(0, mapHeight - EXPANDED_TOP);
  // The sheet is rebuilt at the top each time Home is shown (e.g. back from a route), but
  // HomeScreen keeps `scrollY`; without resetting it, a page scrolled before opening a route left
  // the location button faded out and shifted up on return.
  useEffect(() => {
    scrollY.setValue(0);
    scrollOffset.current = 0;
  }, [scrollY]);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      scrollOffset.current = value;
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);
  // Which route cards are on screen, so only those are polled for live data. Card positions are
  // measured by layout (section offsets add up to a page position) and compared with the page's
  // scroll window; a card not yet measured counts as visible. Recomputed shortly after scrolling,
  // layout, or the list changing, and reported only when the set changes.
  const cardRouteIds = activeTab === 'nearby'
    ? [...savedRoutes, ...nearbyCards].map((route) => route.id)
    : activeTab === 'favorites' ? savedRouteIds.filter((id) => findRoute(id) != null) : [];
  const cardRouteIdsKey = cardRouteIds.join(',');
  const layout = useRef({
    viewport: 0,
    sheet: 0,
    content: 0,
    sections: new Map<string, number>(),
    cards: new Map<string, { section: string; y: number; height: number }>(),
  });
  const shownCardIds = useRef<readonly string[]>([]);
  const reportedVisibleKey = useRef<string | null>(null);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibleRef = useRef(onVisibleRouteIdsChange);
  useEffect(() => {
    onVisibleRef.current = onVisibleRouteIdsChange;
  });
  const reportVisible = useCallback(() => {
    visibilityTimer.current = null;
    const { cards, content, sections, sheet, viewport } = layout.current;
    const top = scrollOffset.current;
    const visible = shownCardIds.current.filter((id) => {
      const card = cards.get(id);
      if (!card || viewport === 0) return true;
      const y = sheet + content + (sections.get(card.section) ?? 0) + card.y;
      return y < top + viewport && y + card.height > top;
    });
    const key = visible.join(',');
    if (key === reportedVisibleKey.current) return;
    reportedVisibleKey.current = key;
    onVisibleRef.current?.(visible);
  }, []);
  const scheduleVisible = useCallback(() => {
    if (visibilityTimer.current == null) visibilityTimer.current = setTimeout(reportVisible, VISIBILITY_THROTTLE_MS);
  }, [reportVisible]);
  useEffect(() => {
    shownCardIds.current = cardRouteIdsKey ? cardRouteIdsKey.split(',') : [];
    scheduleVisible();
  }, [cardRouteIdsKey, scheduleVisible]);
  useEffect(() => () => {
    if (visibilityTimer.current != null) clearTimeout(visibilityTimer.current);
  }, []);
  // Where scrolling reports through the Animated value (web, and JS-driven scrolls).
  useEffect(() => {
    const id = scrollY.addListener(scheduleVisible);
    return () => scrollY.removeListener(id);
  }, [scheduleVisible, scrollY]);
  const recordLayout = useCallback((part: 'viewport' | 'sheet' | 'content', event: LayoutChangeEvent) => {
    layout.current[part] = part === 'viewport' ? event.nativeEvent.layout.height : event.nativeEvent.layout.y;
    scheduleVisible();
  }, [scheduleVisible]);
  const recordSectionLayout = useCallback((section: string, event: LayoutChangeEvent) => {
    layout.current.sections.set(section, event.nativeEvent.layout.y);
    scheduleVisible();
  }, [scheduleVisible]);
  const recordCardLayout = useCallback((section: string, routeId: string, event: LayoutChangeEvent) => {
    layout.current.cards.set(routeId, { section, y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height });
    scheduleVisible();
  }, [scheduleVisible]);
  // Where the page settled: a native-driven Animated.Value doesn't report back to JS, so the
  // offset is taken from the scroll-end events.
  const onPageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    scheduleVisible();
  }, [scheduleVisible]);

  const toggleExpanded = () => {
    const target = scrollOffset.current <= SHEET_AT_REST_TOLERANCE ? expandedOffset : 0;
    // Recorded up front: the scrollY listener can't be relied on for natively driven scroll
    // values, and on short lists the page stops short of `target` anyway (still off rest).
    scrollOffset.current = target;
    pageScrollRef.current?.scrollTo({ y: target, animated: !reducedMotionActive });
  };

  return (
    <Animated.ScrollView
      automaticallyAdjustContentInsets={false}
      bounces={false}
      // The scroll view's own content wrapper spans the transparent map window too; without
      // box-none it swallows drags there (always on web) and the map underneath can't pan.
      contentContainerStyle={styles.pageContent}
      contentInsetAdjustmentBehavior="never"
      onLayout={(event) => recordLayout('viewport', event)}
      onMomentumScrollEnd={onPageScroll}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: Platform.OS !== 'web',
      })}
      onScrollEndDrag={onPageScroll}
      overScrollMode="never"
      pointerEvents="box-none"
      ref={pageScrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.pageScroll}
      testID={`${activeTab}-route-list`}
    >
      <View pointerEvents="box-none" style={{ height: mapHeight }} testID="transit-map-window" />
      <SafeAreaView
        edges={['bottom']}
        onLayout={(event) => recordLayout('sheet', event)}
        style={styles.sheet}
        testID="transit-sheet"
      >
        <SheetHandle
          accessibilityHint="Expands or collapses the transit list."
          accessibilityLabel="Transit list handle"
          onPress={toggleExpanded}
          testID="transit-sheet-handle"
        />
        <View accessibilityRole="tablist" onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width)} style={styles.tabs}>
          <Animated.View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth, transform: [{ translateX: indicatorX }] }]} testID="tab-indicator" />
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <PressableScale
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  ease();
                  onTabChange(tab.id);
                }}
                style={styles.tab}
                testID={`tab-${tab.id}`}
              >
                <Text style={[styles.tabLabel, selected && styles.selectedTabLabel]}>
                  {tab.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {activeTab === 'nearby' ? (
            <View onLayout={(event) => recordLayout('content', event)} style={[styles.tabContent, { minHeight: tabContentMinHeight }]} testID="nearby-route-content">
              {savedRoutes.length > 0 ? (
                <View onLayout={(event) => recordSectionLayout('saved', event)} testID="saved-routes">
                  {savedRoutes.map((route) => (
                    <View key={route.id} onLayout={(event) => recordCardLayout('saved', route.id, event)} testID={`card-slot-${route.id}`}>
                      <TransitCard
                        onPress={() => onOpenRoute(route.id)}
                        route={route}
                        saved={true}
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              <View onLayout={(event) => recordSectionLayout('nearby', event)} style={styles.cardStack} testID="nearby-routes">
                {nearbyCards.map((route) => (
                  <View key={route.id} onLayout={(event) => recordCardLayout('nearby', route.id, event)} testID={`card-slot-${route.id}`}>
                    <TransitCard
                      onPress={() => onOpenRoute(route.id)}
                      route={route}
                    />
                  </View>
                ))}
                {nearbyStatus === 'loading' && nearbyCards.length === 0 ? <NearbySkeleton /> : null}
                {nearbyStatus !== 'loading' && (nearbyStatus !== 'loaded' || nearbyCards.length === 0) ? (
                  <View accessible={true} style={styles.nearbyEmpty} testID="nearby-routes-empty">
                    <Mascot pose={nearbyStatus === 'error' ? 'worried' : 'thinking'} size={52} />
                    <Text style={styles.nearbyEmptyText}>
                      {nearbyStatus === 'error' ? 'Could not check for nearby transit right now.' : 'No other nearby transit found.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : activeTab === 'recents' ? (
            recentTrips.length > 0 ? (
              <View style={[styles.tabContent, { minHeight: tabContentMinHeight }]} testID="recents-route-content">
                {recentTrips.map((trip) => (
                  <RecentTripCard
                    key={trip.sessionId}
                    destination={trip.destination.label}
                    endedAt={trip.endedAt}
                    onOpen={() => onOpenRecentTrip(trip)}
                    origin={trip.origin.label}
                    testID={`recent-trip-${trip.sessionId}`}
                  />
                ))}
              </View>
            ) : (
              <View style={[styles.tabContent, styles.emptyState, { minHeight: tabContentMinHeight }]} testID="recents-route-content">
                <Mascot pose="sleepy" size={64} />
                <Text style={styles.emptyTitle}>No recent trips yet</Text>
                <Text style={styles.emptyBody}>Trips you take will show up here.</Text>
              </View>
            )
          ) : (
            hasFavorites ? (
              <View onLayout={(event) => recordLayout('content', event)} style={[styles.tabContent, { minHeight: tabContentMinHeight }]} testID="favorites-route-content">
                {savedRouteIds.length > 0 ? (
                  <View onLayout={(event) => recordSectionLayout('favorites', event)} testID="favorite-routes">
                    <Text style={[styles.sectionLabel, styles.sectionHeading]}>ROUTES</Text>
                    {savedRouteIds.map((id) => {
                      const route = findRoute(id);
                      if (!route) return null;
                      return (
                        <View key={id} onLayout={(event) => recordCardLayout('favorites', id, event)} testID={`favorite-route-${id}`}>
                          <TransitCard onPress={() => onOpenRoute(id)} route={applyRouteLive(route, liveMap.get(id) ?? { status: 'error' }, now)} />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {savedLocations.length > 0 || onAddSavedPlace ? (
                  <View style={styles.favoriteTrips} testID="saved-locations">
                    <Text style={[styles.sectionLabel, styles.sectionHeading, styles.flushHeading]}>PLACES</Text>
                    {sortSavedLocations(savedLocations).map((location) => (
                      <SavedLocationCard
                        key={location.id}
                        location={location}
                        onOpen={() => onOpenSavedLocation(location)}
                        testID={`saved-location-${location.address.name}`}
                      />
                    ))}
                    {onAddSavedPlace ? <AddSavedPlaceCard onPress={onAddSavedPlace} /> : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.tabContent, styles.emptyState, { minHeight: tabContentMinHeight }]} testID="favorites-route-content">
                <Mascot pose="happy" size={64} />
                <Text style={styles.emptyTitle}>No favorites yet</Text>
                <Text style={styles.emptyBody}>Tap the star on a route, or save a place like home or work.</Text>
                {onAddSavedPlace ? <View style={styles.emptyAction}><AddSavedPlaceCard onPress={onAddSavedPlace} /></View> : null}
              </View>
            )
          )}
      </SafeAreaView>
    </Animated.ScrollView>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 14,
  },
  pageScroll: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
    backgroundColor: 'transparent',
  },
  pageContent: {
    pointerEvents: 'box-none',
  },
  tabs: {
    paddingTop: 2,
    flexDirection: 'row',
    gap: TAB_GAP,
    paddingHorizontal: TAB_ROW_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    height: TAB_ROW_HEIGHT,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  tabLabel: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 13 },
  selectedTabLabel: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  // minHeight is applied inline per-render (tabContentMinHeight varies with how many nearby
  // routes are currently found) rather than baked in here.
  tabContent: {},
  cardStack: { gap: 0 },
  nearbyEmpty: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20, gap: 8 },
  nearbyEmptyText: { color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  sectionLabel: { color: colors.mutedInk, ...typography.label },
  favoriteTrips: { gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  flushHeading: { paddingHorizontal: 4 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyAction: { alignSelf: 'stretch', marginTop: 16 },
  emptyTitle: { marginTop: 8, color: colors.ink, ...typography.sectionHeading, fontSize: 16 },
  emptyBody: {
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
});

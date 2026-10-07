import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyRouteLive } from '../data/applyRouteLive';
import { favoriteTripKey, plannedTripCardData, type FavoriteTrip } from '../data/favorites';
import { realFareForRecentTrip } from '../data/lirrFares';
import { useTransitLiveMap } from '../data/TransitLiveContext';
import {
  recentTripById,
  recentTrips,
  type RecentTripId,
  type RouteDetail,
} from '../data/transit';
import { useNow } from '../hooks/useNow';
import { useAppSettings, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase, useNativeDriver } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { TransitCard } from './TransitCard';
import { TripCard } from './TripCard';
import { PressableScale } from './PressableScale';

export type TransitTabId = 'nearby' | 'recents' | 'favorites';

type TransitSheetProps = {
  activeTripId: RecentTripId | null;
  activeTab: TransitTabId;
  favoriteTrips: readonly FavoriteTrip[];
  /** Resolves a route id — the demo catalog's own or a dynamically-discovered one — to its full data, for pinned/favorited routes which can be either kind. */
  findRoute: (routeId: string) => RouteDetail | undefined;
  mapHeight: number;
  /** Every real nearby route for the rider's current location, across every configured agency (nearbyTransit.ts) — not a fixed handful of hand-picked lines. */
  nearbyRoutes: readonly RouteDetail[];
  nearbyStatus: 'loading' | 'loaded' | 'error';
  /** A re-search is in flight (e.g. for a new map center) while the current list stays visible. */
  nearbyRefreshing?: boolean;
  onOpenFavoriteTrip: (trip: FavoriteTrip) => void;
  onOpenRoute: (routeId: string) => void;
  onOpenTrip: (tripId: RecentTripId) => void;
  onEndTrip: () => void;
  onStartTrip: (tripId: RecentTripId) => void;
  onTabChange: (tab: TransitTabId) => void;
  /** Routes saved with the star: listed first in Nearby and under Favorites -> Routes. */
  savedRouteIds: readonly string[];
  scrollY: Animated.Value;
};

const TAB_ROW_HEIGHT = 44;
const TAB_ROW_PADDING = 16;
const TAB_GAP = 4;
const TRANSIT_CARD_HEIGHT = 104;
// Expanded = sheet scrolled up to just below the fixed search header (HomeScreen's 80pt top inset).
const EXPANDED_TOP = 80;
const DRAG_HANDLE_HEIGHT = 28;
// Any scroll beyond this counts as "moved off rest", so a handle tap collapses instead of expanding.
const AT_REST_TOLERANCE = 8;

const tabs: { id: TransitTabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  activeTripId,
  activeTab,
  favoriteTrips,
  findRoute,
  mapHeight,
  nearbyRefreshing = false,
  nearbyRoutes,
  nearbyStatus,
  onOpenFavoriteTrip,
  onOpenRoute,
  onOpenTrip,
  onEndTrip,
  onStartTrip,
  onTabChange,
  savedRouteIds,
  scrollY,
}: TransitSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const liveMap = useTransitLiveMap();
  // Re-applies live data every 30 s so countdowns age and past departures drop between polls.
  const now = useNow(30_000);
  const savedRoutes = savedRouteIds
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
  const hasFavorites = savedRouteIds.length > 0 || favoriteTrips.length > 0;
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

  // The handle sits inside the page scroll, so dragging it on native already scrolls the
  // sheet up and down like the rest of the page; tapping it (and clicking on web, where mouse
  // drags don't scroll) jumps between the resting and expanded positions.
  const pageScrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const expandedOffset = Math.max(0, mapHeight - EXPANDED_TOP);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      scrollOffset.current = value;
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);
  const toggleExpanded = () => {
    const target = scrollOffset.current <= AT_REST_TOLERANCE ? expandedOffset : 0;
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
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: Platform.OS !== 'web',
      })}
      overScrollMode="never"
      pointerEvents="box-none"
      ref={pageScrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.pageScroll}
      testID={`${activeTab}-route-list`}
    >
      <View pointerEvents="box-none" style={{ height: mapHeight }} testID="transit-map-window" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="transit-sheet">
        <PressableScale
          accessibilityHint="Expands or collapses the transit list."
          accessibilityLabel="Transit list handle"
          accessibilityRole="button"
          onPress={toggleExpanded}
          style={styles.dragHandle}
          testID="transit-sheet-handle"
        >
          <View style={styles.dragHandleGrip} />
        </PressableScale>
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
            <View style={[styles.tabContent, { minHeight: tabContentMinHeight }]} testID="nearby-route-content">
              {savedRoutes.length > 0 ? (
                <View testID="saved-routes">
                  {savedRoutes.map((route) => (
                    <TransitCard
                      key={route.id}
                      onPress={() => onOpenRoute(route.id)}
                      route={route}
                      saved={true}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.cardStack} testID="nearby-routes">
                {nearbyRefreshing ? <ActivityIndicator accessibilityLabel="Updating nearby transit" color={colors.primary} style={styles.nearbyRefreshing} testID="nearby-refreshing" /> : null}
                {nearbyCards.map((route) => (
                  <TransitCard
                    key={route.id}
                    onPress={() => onOpenRoute(route.id)}
                    route={route}
                  />
                ))}
                {nearbyStatus !== 'loaded' || nearbyCards.length === 0 ? (
                  <View accessible={true} style={styles.nearbyEmpty} testID="nearby-routes-empty">
                    {nearbyStatus === 'loading' ? <ActivityIndicator color={colors.primary} style={styles.nearbyEmptySpinner} /> : null}
                    <Text style={styles.nearbyEmptyText}>
                      {nearbyStatus === 'loading'
                        ? 'Finding transit near you…'
                        : nearbyStatus === 'error'
                          ? 'Could not check for nearby transit right now.'
                          : 'No other nearby transit found.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : activeTab === 'recents' ? (
            <View style={[styles.tabContent, styles.recentList, { minHeight: tabContentMinHeight }]} testID="recents-route-content">
              {recentTrips.map((trip) => {
                const isActive = trip.id === activeTripId;
                return (
                  <TripCard
                    key={trip.id}
                    actionTestID={isActive ? `recent-trip-end-${trip.id}` : `recent-trip-go-${trip.id}`}
                    isActive={isActive}
                    onAction={isActive ? onEndTrip : () => onStartTrip(trip.id)}
                    onOpen={() => onOpenTrip(trip.id)}
                    testID={`recent-trip-${trip.id}`}
                    trip={{ ...trip, fare: realFareForRecentTrip(trip) }}
                  />
                );
              })}
            </View>
          ) : (
            hasFavorites ? (
              <View style={[styles.tabContent, { minHeight: tabContentMinHeight }]} testID="favorites-route-content">
                {savedRouteIds.length > 0 ? (
                  <View testID="favorite-routes">
                    <Text style={[styles.sectionLabel, styles.sectionHeading]}>ROUTES</Text>
                    {savedRouteIds.map((id) => {
                      const route = findRoute(id);
                      if (!route) return null;
                      return (
                        <View key={id} testID={`favorite-route-${id}`}>
                          <TransitCard onPress={() => onOpenRoute(id)} route={applyRouteLive(route, liveMap.get(id) ?? { status: 'error' }, now)} />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {favoriteTrips.length > 0 ? (
                  <View style={styles.favoriteTrips} testID="favorite-trips">
                    <Text style={[styles.sectionLabel, styles.sectionHeading, styles.flushHeading]}>TRIPS</Text>
                    {favoriteTrips.map((trip) => {
                      const key = favoriteTripKey(trip);
                      const data = trip.kind === 'recent'
                        ? { ...recentTripById[trip.tripId], fare: realFareForRecentTrip(recentTripById[trip.tripId]) }
                        : plannedTripCardData(trip);
                      return (
                        <TripCard
                          key={key}
                          accessibilityLabel={`View favorite trip to ${data.destination}`}
                          onOpen={() => onOpenFavoriteTrip(trip)}
                          testID={`favorite-trip-${key}`}
                          trip={data}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.tabContent, styles.emptyState, { minHeight: tabContentMinHeight }]} testID="favorites-route-content">
                <View style={styles.emptyIcon}><Icon name="favorite" size={30} /></View>
                <Text style={styles.emptyTitle}>No favorites yet</Text>
                <Text style={styles.emptyBody}>Tap the star on a route or trip to save it here.</Text>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    paddingTop: 12,
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
  dragHandle: {
    height: DRAG_HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  cardStack: { gap: 0 },
  nearbyEmpty: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20, gap: 8 },
  nearbyEmptySpinner: { marginBottom: 2 },
  nearbyRefreshing: { paddingVertical: 8 },
  nearbyEmptyText: { color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  sectionLabel: { color: colors.mutedInk, ...typography.label },
  favoriteTrips: { gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  flushHeading: { paddingHorizontal: 4 },
  recentList: { paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: colors.blueSoft },
  emptyTitle: { marginTop: 8, color: colors.ink, ...typography.sectionHeading, fontSize: 16 },
  emptyBody: {
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
});

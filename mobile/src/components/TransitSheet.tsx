import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { favoriteTripKey, plannedTripCardData, type FavoriteTrip } from '../data/favorites';
import {
  allNearbyRoutes,
  recentTripById,
  recentTrips,
  routeById,
  type RecentTripId,
  type RouteId,
} from '../data/transit';
import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
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
  favoriteRouteIds: readonly RouteId[];
  favoriteTrips: readonly FavoriteTrip[];
  mapHeight: number;
  onOpenFavoriteTrip: (trip: FavoriteTrip) => void;
  onOpenRoute: (routeId: RouteId) => void;
  onOpenTrip: (tripId: RecentTripId) => void;
  onEndTrip: () => void;
  onStartTrip: (tripId: RecentTripId) => void;
  onTabChange: (tab: TransitTabId) => void;
  pinnedRouteIds: readonly RouteId[];
};

const TAB_ROW_HEIGHT = 44;
const TAB_ROW_PADDING = 16;
const TAB_GAP = 4;
const TRANSIT_CARD_HEIGHT = 104;
const TAB_CONTENT_MIN_HEIGHT = allNearbyRoutes.length * TRANSIT_CARD_HEIGHT;

const tabs: { id: TransitTabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  activeTripId,
  activeTab,
  favoriteRouteIds,
  favoriteTrips,
  mapHeight,
  onOpenFavoriteTrip,
  onOpenRoute,
  onOpenTrip,
  onEndTrip,
  onStartTrip,
  onTabChange,
  pinnedRouteIds,
}: TransitSheetProps) {
  const styles = useThemedStyles(createStyles);
  const pinnedRoutes = pinnedRouteIds.map((id) => routeById[id]);
  const nearbyRoutes = allNearbyRoutes.filter((route) => !pinnedRouteIds.includes(route.id));
  const hasFavorites = favoriteRouteIds.length > 0 || favoriteTrips.length > 0;
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

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.sheet, { top: mapHeight }]}
      testID="transit-sheet"
    >
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

      <ScrollView
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={styles.tabScroll}
        testID={`${activeTab}-route-list`}
      >
        {activeTab === 'nearby' ? (
          <View style={styles.tabContent} testID="nearby-route-content">
            {pinnedRoutes.length > 0 ? (
              <View testID="pinned-routes">
                {pinnedRoutes.map((route) => (
                  <TransitCard
                    key={route.id}
                    onPress={() => onOpenRoute(route.id)}
                    pinned={true}
                    route={route}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.cardStack} testID="nearby-routes">
              {nearbyRoutes.map((route) => (
                <TransitCard
                  key={route.id}
                  onPress={() => onOpenRoute(route.id)}
                  route={route}
                />
              ))}
            </View>
          </View>
        ) : activeTab === 'recents' ? (
          <View style={[styles.tabContent, styles.recentList]} testID="recents-route-content">
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
                  trip={trip}
                />
              );
            })}
          </View>
        ) : (
          hasFavorites ? (
            <View style={styles.tabContent} testID="favorites-route-content">
              {favoriteRouteIds.length > 0 ? (
                <View testID="favorite-routes">
                  <Text style={[styles.sectionLabel, styles.sectionHeading]}>ROUTES</Text>
                  {favoriteRouteIds.map((id) => (
                    <View key={id} testID={`favorite-route-${id}`}>
                      <TransitCard onPress={() => onOpenRoute(id)} route={routeById[id]} />
                    </View>
                  ))}
                </View>
              ) : null}
              {favoriteTrips.length > 0 ? (
                <View style={styles.favoriteTrips} testID="favorite-trips">
                  <Text style={[styles.sectionLabel, styles.sectionHeading, styles.flushHeading]}>TRIPS</Text>
                  {favoriteTrips.map((trip) => {
                    const key = favoriteTripKey(trip);
                    const data = trip.kind === 'recent' ? recentTripById[trip.tripId] : plannedTripCardData(trip);
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
            <View style={[styles.tabContent, styles.emptyState]} testID="favorites-route-content">
              <View style={styles.emptyIcon}><Icon name="favorite" size={30} /></View>
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptyBody}>Tap the star on a route or trip to save it here.</Text>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
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
  tabScroll: {
    flex: 1,
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
  tabContent: { minHeight: TAB_CONTENT_MIN_HEIGHT },
  cardStack: { gap: 0 },
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

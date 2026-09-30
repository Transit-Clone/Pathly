import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  nearbyRoutes,
  pinnedRoutes,
  recentTrips,
  type RecentTripId,
  type RouteId,
} from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { TransitCard } from './TransitCard';

export type TransitTabId = 'nearby' | 'recents' | 'favorites';

type TransitSheetProps = {
  activeTripId: RecentTripId | null;
  activeTab: TransitTabId;
  mapHeight: number;
  onOpenRoute: (routeId: RouteId) => void;
  onOpenTrip: (tripId: RecentTripId) => void;
  onEndTrip: () => void;
  onStartTrip: (tripId: RecentTripId) => void;
  onTabChange: (tab: TransitTabId) => void;
};

const TAB_ROW_HEIGHT = 44;
const TRANSIT_CARD_HEIGHT = 104;
const TAB_CONTENT_MIN_HEIGHT = (pinnedRoutes.length + nearbyRoutes.length) * TRANSIT_CARD_HEIGHT;

const tabs: { id: TransitTabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  activeTripId,
  activeTab,
  mapHeight,
  onOpenRoute,
  onOpenTrip,
  onEndTrip,
  onStartTrip,
  onTabChange,
}: TransitSheetProps) {
  return (
    <ScrollView
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      style={styles.pageScroll}
      testID={`${activeTab}-route-list`}
    >
      <View style={[styles.mapWindow, { height: mapHeight }]} testID="map-window">
        <View style={styles.locationButton}>
          <CurrentLocationButton />
        </View>
      </View>

      <SafeAreaView
        edges={['bottom']}
        style={styles.sheet}
        testID="transit-sheet"
      >
        <View accessibilityRole="tablist" style={styles.tabs}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onTabChange(tab.id)}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.selectedTab,
                  pressed && styles.pressed,
                ]}
                testID={`tab-${tab.id}`}
              >
                <Text style={[styles.tabLabel, selected && styles.selectedTabLabel]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'nearby' ? (
          <View style={styles.tabContent} testID="nearby-route-content">
            {pinnedRoutes.map((route) => (
              <TransitCard
                key={route.id}
                onPress={() => onOpenRoute(route.id)}
                route={route}
              />
            ))}

            <View style={styles.cardStack}>
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
          <View style={[styles.tabContent]} testID="recents-route-content">
            {recentTrips.map((trip) => {
              const isActive = trip.id === activeTripId;
              return (
                <View key={trip.id} style={styles.recentRow}>
                  <Pressable
                    accessibilityLabel={`View recent trip to ${trip.destination} from ${trip.origin}`}
                    accessibilityRole="button"
                    onPress={() => onOpenTrip(trip.id)}
                    style={({ pressed }) => [styles.recentMain, pressed && styles.pressed]}
                    testID={`recent-trip-${trip.id}`}
                  >
                    <View style={styles.segmentRow}>
                      {trip.legs.map((segment) => (
                        <View
                          key={segment.shortName}
                          style={[styles.segmentBadge, { backgroundColor: segment.color }]}
                        >
                          <Text style={styles.segmentText}>{segment.shortName}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.recentCopy}>
                      <Text style={styles.recentDestination}>{trip.destination}</Text>
                      <Text numberOfLines={1} style={styles.recentOrigin}>From {trip.origin}</Text>
                    </View>
                  </Pressable>
                  <View style={styles.recentActions}>
                    <Text style={styles.recency}>{isActive ? 'In progress' : trip.recency}</Text>
                    <Pressable
                      accessibilityLabel={isActive ? `End trip to ${trip.destination}` : `Start trip to ${trip.destination}`}
                      accessibilityRole="button"
                      onPress={isActive ? onEndTrip : () => onStartTrip(trip.id)}
                      style={({ pressed }) => [
                        styles.goButton,
                        isActive && styles.endTripButton,
                        pressed && styles.pressed,
                      ]}
                      testID={isActive ? `recent-trip-end-${trip.id}` : `recent-trip-go-${trip.id}`}
                    >
                      <Text style={styles.goButtonText}>{isActive ? 'End trip' : 'Go'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.tabContent, styles.emptyState]} testID="favorites-route-content">
            <Text style={styles.emptyIcon}>☆</Text>
            <Text style={styles.emptyTitle}>No favorite stops yet</Text>
            <Text style={styles.emptyBody}>Stops and routes you save will appear here.</Text>
          </View>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageScroll: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
    backgroundColor: 'transparent',
  },
  mapWindow: {
    position: 'relative',
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 4,
    elevation: 4,
  },
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
  tabs: {
    paddingTop: 12,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
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
  selectedTab: { borderBottomColor: colors.primary },
  pressed: { opacity: 0.62 },
  tabLabel: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 13 },
  selectedTabLabel: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  tabContent: { minHeight: TAB_CONTENT_MIN_HEIGHT },
  cardStack: { gap: 0 },
  recentList: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  recentRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  recentMain: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10 },
  segmentRow: { flexDirection: 'row', gap: 4 },
  segmentBadge: {
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  segmentText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  recentCopy: { minWidth: 0, flex: 1 },
  recentDestination: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  recentOrigin: { marginTop: 2, color: colors.mutedInk, ...typography.metadata },
  recentActions: { alignItems: 'flex-end', gap: 7 },
  recency: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  viewTrip: { marginTop: 3, color: colors.primary, ...typography.bodyStrong, fontSize: 10 },
  goButton: { width: 86, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary },
  endTripButton: { backgroundColor: colors.red },
  goButtonText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyIcon: { color: colors.primary, fontFamily: fontFamilies.bold, fontSize: 38 },
  emptyTitle: { marginTop: 8, color: colors.ink, ...typography.sectionHeading, fontSize: 16 },
  emptyBody: {
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
});

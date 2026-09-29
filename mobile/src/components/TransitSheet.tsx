import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
export type SheetState = 'minimized' | 'compact' | 'expanded';

type TransitSheetProps = {
  activeTripId: RecentTripId | null;
  activeTab: TransitTabId;
  compactHeight: number;
  expandedHeight: number;
  minimizedHeight: number;
  onOpenRoute: (routeId: RouteId) => void;
  onOpenTrip: (tripId: RecentTripId) => void;
  onEndTrip: () => void;
  onStartTrip: (tripId: RecentTripId) => void;
  onStateChange: (state: SheetState) => void;
  onTabChange: (tab: TransitTabId) => void;
};

const tabs: { id: TransitTabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  activeTripId,
  activeTab,
  compactHeight,
  expandedHeight,
  minimizedHeight,
  onOpenRoute,
  onOpenTrip,
  onEndTrip,
  onStartTrip,
  onStateChange,
  onTabChange,
}: TransitSheetProps) {
  const [sheetState, setSheetState] = useState<SheetState>('compact');
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const [animatedHeight] = useState(() => new Animated.Value(compactHeight));

  const heights = useMemo(
    () => ({ minimized: minimizedHeight, compact: compactHeight, expanded: expandedHeight }),
    [compactHeight, expandedHeight, minimizedHeight],
  );
  const locationButtonTop = animatedHeight.interpolate({
    inputRange: [minimizedHeight, compactHeight, expandedHeight],
    outputRange: [-60, -60, 76],
    extrapolate: 'clamp',
  });

  const settleSheet = useCallback(
    (nextState: SheetState) => {
      setSheetState(nextState);
      onStateChange(nextState);
      Animated.spring(animatedHeight, {
        toValue: heights[nextState],
        useNativeDriver: false,
        damping: 22,
        stiffness: 230,
        mass: 0.8,
      }).start();
    },
    [animatedHeight, heights, onStateChange],
  );

  const nearestState = useCallback(
    (height: number): SheetState =>
      (Object.keys(heights) as SheetState[]).reduce((closest, candidate) =>
        Math.abs(heights[candidate] - height) < Math.abs(heights[closest] - height)
          ? candidate
          : closest,
      ),
    [heights],
  );

  const panResponder = useMemo(() => {
    let dragStartHeight = compactHeight;

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const isVerticalDrag = Math.abs(gesture.dy) > 4
          && Math.abs(gesture.dy) > Math.abs(gesture.dx);
        return isVerticalDrag
          && (sheetState !== 'expanded' || (isScrollAtTop && gesture.dy > 0));
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        const isVerticalDrag = Math.abs(gesture.dy) > 4
          && Math.abs(gesture.dy) > Math.abs(gesture.dx);
        return isVerticalDrag
          && (sheetState !== 'expanded' || (isScrollAtTop && gesture.dy > 0));
      },
      onPanResponderGrant: () => {
        animatedHeight.stopAnimation((value) => {
          dragStartHeight = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const nextHeight = Math.max(
          minimizedHeight,
          Math.min(expandedHeight, dragStartHeight - gesture.dy),
        );
        animatedHeight.setValue(nextHeight);
      },
      onPanResponderRelease: (_, gesture) => {
        settleSheet(nearestState(dragStartHeight - gesture.dy - gesture.vy * 45));
      },
      onPanResponderTerminate: () => settleSheet(sheetState),
    });
  }, [
    animatedHeight,
    compactHeight,
    expandedHeight,
    isScrollAtTop,
    minimizedHeight,
    nearestState,
    settleSheet,
    sheetState,
  ]);

  const cycleState = () => {
    settleSheet(
      sheetState === 'compact'
        ? 'expanded'
        : sheetState === 'expanded'
          ? 'minimized'
          : 'compact',
    );
  };

  const adjustState = (direction: 'increment' | 'decrement') => {
    const ordered: SheetState[] = ['minimized', 'compact', 'expanded'];
    const index = ordered.indexOf(sheetState);
    const nextIndex = direction === 'increment'
      ? Math.min(index + 1, ordered.length - 1)
      : Math.max(index - 1, 0);
    settleSheet(ordered[nextIndex] ?? sheetState);
  };

  return (
    <Animated.View
      style={[styles.sheetAnchor, { height: animatedHeight }]}
      testID="transit-sheet-anchor"
    >
      <View
        {...panResponder.panHandlers}
        style={[styles.sheet, sheetState === 'expanded' && styles.expandedSheet]}
        testID="transit-sheet"
      >
        <SafeAreaView edges={['bottom']} style={styles.safeContent}>
          <ScrollView
            contentContainerStyle={styles.sheetScrollContent}
            onScrollBeginDrag={() => {
              if (sheetState !== 'expanded') {
                settleSheet('expanded');
              }
            }}
            onScroll={(event) => {
              setIsScrollAtTop(event.nativeEvent.contentOffset.y <= 0.5);
            }}
            overScrollMode="never"
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            testID={`${activeTab}-route-list`}
          >
            <View style={styles.handleGestureArea}>
              <Pressable
                accessibilityActions={[{ name: 'activate' }, { name: 'increment' }, { name: 'decrement' }]}
                accessibilityHint="Drag up or down to resize transit options"
                accessibilityLabel="Resize transit options"
                accessibilityRole="button"
                accessibilityState={{ expanded: sheetState === 'expanded' }}
                accessibilityValue={{ text: sheetState }}
                onAccessibilityAction={(event) => {
                  const action = event.nativeEvent.actionName;
                  if (action === 'increment' || action === 'decrement') {
                    adjustState(action);
                  } else {
                    cycleState();
                  }
                }}
                onPress={cycleState}
                style={styles.handleTarget}
                testID="transit-sheet-handle"
              >
                <View style={styles.handle} />
              </Pressable>
            </View>

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
              <View style={styles.content}>
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
              <View style={styles.recentList}>
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
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>☆</Text>
                <Text style={styles.emptyTitle}>No favorite stops yet</Text>
                <Text style={styles.emptyBody}>Stops and routes you save will appear here.</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
      <Animated.View style={[styles.locationButton, { top: locationButtonTop }]}>
        <CurrentLocationButton />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetAnchor: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
    overflow: 'visible',
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    elevation: 20,
  },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    userSelect: 'none',
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
  expandedSheet: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  safeContent: { flex: 1 },
  handleGestureArea: { minHeight: 44 },
  handleTarget: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    minHeight: 44,
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
  scroll: { flex: 1 },
  sheetScrollContent: { flexGrow: 1, paddingBottom: 24 },
  content: { paddingBottom: 30 },
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 42,
    paddingBottom: 36,
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

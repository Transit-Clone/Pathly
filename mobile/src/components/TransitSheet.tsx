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
  type RouteId,
} from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { TransitCard } from './TransitCard';

type TabId = 'nearby' | 'recents' | 'favorites';
export type SheetState = 'minimized' | 'compact' | 'expanded';

type TransitSheetProps = {
  compactHeight: number;
  expandedHeight: number;
  minimizedHeight: number;
  onOpenRoute: (routeId: RouteId) => void;
  onOpenTrip: (destination: string) => void;
  onStateChange: (state: SheetState) => void;
};

const tabs: { id: TabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  compactHeight,
  expandedHeight,
  minimizedHeight,
  onOpenRoute,
  onOpenTrip,
  onStateChange,
}: TransitSheetProps) {
  const [activeTab, setActiveTab] = useState<TabId>('nearby');
  const [sheetState, setSheetState] = useState<SheetState>('compact');
  const [animatedHeight] = useState(() => new Animated.Value(compactHeight));

  const heights = useMemo(
    () => ({ minimized: minimizedHeight, compact: compactHeight, expanded: expandedHeight }),
    [compactHeight, expandedHeight, minimizedHeight],
  );

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
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
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
      style={[styles.sheet, { height: animatedHeight }]}
      testID="transit-sheet"
    >
      <SafeAreaView edges={['bottom']} style={styles.safeContent}>
        <View {...panResponder.panHandlers} style={styles.handleGestureArea}>
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
                onPress={() => setActiveTab(tab.id)}
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
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
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
          </ScrollView>
        ) : activeTab === 'recents' ? (
          <ScrollView contentContainerStyle={styles.recentList}>
            {recentTrips.map((trip) => (
              <Pressable
                key={trip.id}
                accessibilityLabel={`Recent trip to ${trip.destination} from ${trip.origin}`}
                accessibilityRole="button"
                onPress={() => onOpenTrip(trip.destination)}
                style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
                testID={`recent-trip-${trip.id}`}
              >
                <View style={styles.segmentRow}>
                  {trip.segments.map((segment) => (
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
                  <Text style={styles.recentOrigin}>From {trip.origin}</Text>
                </View>
                <Text style={styles.recency}>{trip.recency}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>☆</Text>
            <Text style={styles.emptyTitle}>No favorite stops yet</Text>
            <Text style={styles.emptyBody}>Stops and routes you save will appear here.</Text>
          </View>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
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
  content: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 30, gap: 8 },
  cardStack: { gap: 8 },
  recentList: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  recentRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
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
  recency: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
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

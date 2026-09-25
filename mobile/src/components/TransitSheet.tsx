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

import { nearbyTransit, pinnedTransit } from '../data/transit';
import { useApiHeartbeat } from '../hooks/useApiHeartbeat';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { TransitCard } from './TransitCard';

type TabId = 'nearby' | 'recents' | 'favorites';

type TransitSheetProps = {
  compactHeight: number;
  expandedHeight: number;
  onOpenRonkonkoma: () => void;
};

const tabs: { id: TabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({
  compactHeight,
  expandedHeight,
  onOpenRonkonkoma,
}: TransitSheetProps) {
  const [activeTab, setActiveTab] = useState<TabId>('nearby');
  const [expanded, setExpanded] = useState(false);
  const [animatedHeight] = useState(() => new Animated.Value(compactHeight));
  useApiHeartbeat();

  const settleSheet = useCallback(
    (nextExpanded: boolean) => {
      setExpanded(nextExpanded);
      Animated.spring(animatedHeight, {
        toValue: nextExpanded ? expandedHeight : compactHeight,
        useNativeDriver: false,
        damping: 22,
        stiffness: 230,
        mass: 0.8,
      }).start();
    },
    [animatedHeight, compactHeight, expandedHeight],
  );

  const panResponder = useMemo(
    () => {
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
            compactHeight,
            Math.min(expandedHeight, dragStartHeight - gesture.dy),
          );
          animatedHeight.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gesture) => {
          const projectedHeight = dragStartHeight - gesture.dy - gesture.vy * 45;
          settleSheet(projectedHeight > (compactHeight + expandedHeight) / 2);
        },
        onPanResponderTerminate: () => settleSheet(expanded),
      });
    },
    [animatedHeight, compactHeight, expanded, expandedHeight, settleSheet],
  );

  return (
    <Animated.View style={[styles.sheet, { height: animatedHeight }]} testID="transit-sheet">
      <SafeAreaView edges={['bottom']} style={styles.safeContent}>
        <View {...panResponder.panHandlers} style={styles.handleGestureArea}>
          <Pressable
            accessibilityActions={[{ name: 'activate' }, { name: 'increment' }, { name: 'decrement' }]}
            accessibilityHint="Drag up or down to resize nearby transit"
            accessibilityLabel="Resize nearby transit"
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onAccessibilityAction={(event) =>
              settleSheet(
                event.nativeEvent.actionName === 'increment'
                  ? true
                  : event.nativeEvent.actionName === 'decrement'
                    ? false
                    : !expanded,
              )
            }
            onPress={() => settleSheet(!expanded)}
            style={styles.handleTarget}
            testID="transit-sheet-handle"
          >
            <View style={styles.handle} />
          </Pressable>
        </View>

      <View style={styles.headingRow}>
        <Text style={styles.heading}>Nearby transit</Text>
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
                pressed && styles.pressedTab,
              ]}
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
          <Text style={styles.sectionLabel}>PINNED</Text>
          {pinnedTransit.map((transit) => (
            <TransitCard
              key={`${transit.agency}-${transit.route}`}
              {...transit}
              onPress={onOpenRonkonkoma}
              testID="ronkonkoma-card"
            />
          ))}

          <Text style={[styles.sectionLabel, styles.nearbyLabel]}>NEAR YOU</Text>
          <View style={styles.cardStack}>
            {nearbyTransit.map((transit) => (
              <TransitCard key={`${transit.agency}-${transit.route}`} {...transit} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <View
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
            style={styles.emptyIcon}
          >
            <Text style={styles.emptyIconText}>{activeTab === 'recents' ? '↻' : '☆'}</Text>
          </View>
          <Text style={styles.emptyTitle}>
            {activeTab === 'recents' ? 'No recent trips yet' : 'No favorite stops yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {activeTab === 'recents'
              ? 'Trips you view will appear here.'
              : 'Stops and routes you save will appear here.'}
          </Text>
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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 14,
  },
  safeContent: {
    flex: 1,
  },
  handleGestureArea: {
    minHeight: 44,
  },
  handleTarget: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
  },
  heading: {
    color: colors.ink,
    ...typography.screenHeading,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 15,
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
  selectedTab: {
    borderBottomColor: colors.primary,
  },
  pressedTab: {
    opacity: 0.62,
  },
  tabLabel: {
    color: colors.mutedInk,
    ...typography.bodyStrong,
    fontSize: 13,
  },
  selectedTabLabel: {
    color: colors.primary,
    fontFamily: fontFamilies.extraBold,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 30,
  },
  scroll: {
    flex: 1,
  },
  sectionLabel: {
    marginBottom: 8,
    color: colors.mutedInk,
    ...typography.label,
    fontSize: 10,
  },
  nearbyLabel: {
    marginTop: 17,
  },
  cardStack: {
    gap: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 42,
    paddingBottom: 36,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderRadius: 27,
    backgroundColor: colors.accent,
  },
  emptyIconText: {
    color: colors.primary,
    fontFamily: fontFamilies.bold,
    fontSize: 26,
  },
  emptyTitle: {
    color: colors.ink,
    ...typography.sectionHeading,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
});

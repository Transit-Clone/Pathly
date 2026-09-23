import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nearbyTransit, pinnedTransit } from '../data/transit';
import { useApiHeartbeat } from '../hooks/useApiHeartbeat';
import { colors } from '../theme/colors';
import { TransitCard } from './TransitCard';

type TabId = 'nearby' | 'recents' | 'favorites';

type TransitSheetProps = {
  height: number;
  onOpenRonkonkoma: () => void;
};

const tabs: { id: TabId; label: string }[] = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'recents', label: 'Recents' },
  { id: 'favorites', label: 'Favorites' },
];

export function TransitSheet({ height, onOpenRonkonkoma }: TransitSheetProps) {
  const [activeTab, setActiveTab] = useState<TabId>('nearby');
  useApiHeartbeat();

  return (
    <SafeAreaView edges={['bottom']} style={[styles.sheet, { height }]}>
      <View style={styles.handle} />

      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>AROUND YOU</Text>
          <Text style={styles.heading}>Nearby transit</Text>
        </View>
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
              key={`${transit.mode}-${transit.route}`}
              {...transit}
              onPress={onOpenRonkonkoma}
              testID="ronkonkoma-card"
            />
          ))}

          <Text style={[styles.sectionLabel, styles.nearbyLabel]}>NEAR YOU</Text>
          <View style={styles.cardStack}>
            {nearbyTransit.map((transit) => (
              <TransitCard key={`${transit.mode}-${transit.route}`} {...transit} />
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
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    paddingTop: 10,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 14,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginBottom: 14,
    borderRadius: 3,
    backgroundColor: '#D5D1CA',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
  },
  eyebrow: {
    marginBottom: 3,
    color: colors.blue,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.35,
  },
  heading: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.6,
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
    borderBottomColor: colors.blue,
  },
  pressedTab: {
    opacity: 0.62,
  },
  tabLabel: {
    color: colors.mutedInk,
    fontSize: 13,
    fontWeight: '700',
  },
  selectedTabLabel: {
    color: colors.blue,
    fontWeight: '900',
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
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
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
    backgroundColor: colors.blueSoft,
  },
  emptyIconText: {
    color: colors.blue,
    fontSize: 26,
    fontWeight: '700',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 7,
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

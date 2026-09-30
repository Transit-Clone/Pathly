import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { RouteDetail } from '../data/transit';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { LiveSignal } from './LiveSignal';

type TransitCardProps = {
  onPress: () => void;
  route: RouteDetail;
};

export function TransitCard({ onPress, route }: TransitCardProps) {
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 540);
  const [activePage, setActivePage] = useState(0);

  const updatePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View
      style={[styles.card, { backgroundColor: route.color }]}
      testID={`route-card-${route.id}`}
    >
      <ScrollView
        decelerationRate="fast"
        horizontal={true}
        onMomentumScrollEnd={updatePage}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        testID={`transit-${route.id}-directions`}
      >
        {route.directions.map((item, index) => (
          <Pressable
            key={item.direction}
            accessibilityHint="Opens route details. Swipe horizontally for the other direction."
            accessibilityLabel={`${route.agency} ${route.routeName}. ${item.direction}. ${item.stopName}. ${item.minutes} minutes, ${item.live ? 'live GPS prediction' : 'scheduled time'}.`}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
              styles.page,
              { width: pageWidth },
              pressed && styles.pressedPage,
            ]}
            testID={`route-card-${route.id}-${index === 0 ? 'primary' : 'alternate'}`}
          >
            <View style={styles.copy}>
              <Text numberOfLines={2} style={styles.routeName} testID={`transit-${route.id}-title`}>
                {route.routeName}
              </Text>
              <Text numberOfLines={1} style={styles.direction}>{item.direction}</Text>
              <Text numberOfLines={1} style={styles.stopName}>{item.stopName}</Text>
            </View>

            <View style={[styles.timing, !item.live && styles.scheduledTiming]}>
              <View style={styles.timeRow}>
                <Text style={styles.minutes} testID={`transit-${route.id}-arrival-${index}`}>
                  {item.minutes}
                </Text>
                {item.live ? <LiveSignal /> : null}
              </View>
              <Text style={styles.minuteUnit}>minutes</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View accessibilityElementsHidden={true} style={styles.pageDots}>
        {route.directions.map((item, index) => (
          <View
            key={item.direction}
            style={[styles.pageDot, index === activePage && styles.activePageDot]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 104,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.34)',
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
  pressedPage: { opacity: 0.82 },
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
  timing: { width: 50, alignItems: 'center' },
  scheduledTiming: { opacity: 0.68 },
  timeRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
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

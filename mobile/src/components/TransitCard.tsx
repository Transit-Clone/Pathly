import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { LiveSignal } from './LiveSignal';

export type RouteAccent = 'blue' | 'green' | 'red';

export type TransitDirection = {
  direction: string;
  live: boolean;
  minutes: number;
  stopName: string;
};

export type TransitCardProps = {
  agency: string;
  directions: readonly [TransitDirection, TransitDirection];
  onPress?: () => void;
  route: string;
  routeAccent: RouteAccent;
  routeName: string;
  testID?: string;
};

const routeColors: Record<RouteAccent, string> = {
  blue: colors.primary,
  green: colors.routeGreen,
  red: colors.red,
};

export function TransitCard({
  agency,
  directions,
  onPress,
  route,
  routeAccent,
  routeName,
  testID,
}: TransitCardProps) {
  const [pageWidth, setPageWidth] = useState(320);
  const [activePage, setActivePage] = useState(0);
  const routeColor = routeColors[routeAccent];

  const updatePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View
      onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
      style={[styles.card, { backgroundColor: routeColor }]}
      testID={testID}
    >
      <ScrollView
        decelerationRate="fast"
        horizontal={true}
        onMomentumScrollEnd={updatePage}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        testID={`transit-${route}-directions`}
      >
        {directions.map((item, index) => (
          <Pressable
            key={item.direction}
            accessibilityHint={
              onPress
                ? 'Opens route details. Swipe horizontally for the other direction.'
                : 'Swipe horizontally for the other direction.'
            }
            accessibilityLabel={`${agency} ${routeName}. ${item.direction}. ${item.stopName}. ${item.minutes} minutes, ${item.live ? 'live GPS prediction' : 'scheduled time'}.`}
            accessibilityRole={onPress ? 'button' : undefined}
            onPress={onPress}
            style={({ pressed }) => [
              styles.page,
              { width: pageWidth },
              pressed && onPress && styles.pressedPage,
            ]}
            testID={
              index === 0
                ? `${testID ?? `transit-${route}`}-primary`
                : `transit-${route}-alternate`
            }
          >
            <View style={styles.copy}>
              <Text
                numberOfLines={2}
                style={styles.routeName}
                testID={`transit-${route}-title`}
              >
                {routeName}
              </Text>
              <Text numberOfLines={1} style={styles.direction}>
                {item.direction}
              </Text>
              <Text numberOfLines={1} style={styles.stopName}>
                {item.stopName}
              </Text>
            </View>

            <View style={[styles.timing, !item.live && styles.scheduledTiming]}>
              <View style={styles.timeRow}>
                <Text
                  style={styles.minutes}
                  testID={`transit-${route}-arrival-${index}`}
                >
                  {item.minutes}
                </Text>
                {item.live ? <LiveSignal /> : null}
              </View>
              <Text style={styles.minuteUnit}>minutes</Text>
              <Text style={styles.provenance}>{item.live ? 'Live' : 'Scheduled'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View accessibilityElementsHidden={true} style={styles.pageDots}>
        {directions.map((item, index) => (
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
    minHeight: 132,
    overflow: 'hidden',
    borderRadius: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 4,
  },
  page: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 23,
  },
  pressedPage: {
    opacity: 0.82,
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  routeName: {
    color: colors.white,
    ...typography.displayTime,
  },
  direction: {
    marginTop: 7,
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
  timing: {
    width: 92,
    alignItems: 'center',
  },
  scheduledTiming: {
    opacity: 0.68,
  },
  timeRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minutes: {
    color: colors.white,
    ...typography.displayTime,
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
  activePageDot: {
    width: 14,
    backgroundColor: colors.white,
  },
});

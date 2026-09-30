import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { RouteDetail } from '../data/transit';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { PressableScale } from './PressableScale';

type TransitCardProps = {
  onPress: () => void;
  pinned?: boolean;
  route: RouteDetail;
};

const CARD_HORIZONTAL_MARGIN = 8;

export function TransitCard({ onPress, pinned = false, route }: TransitCardProps) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 540) - CARD_HORIZONTAL_MARGIN * 2;
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
          <PressableScale
            key={item.direction}
            accessibilityHint="Opens route details. Swipe horizontally for the other direction."
            accessibilityLabel={`${route.agency} ${route.routeName}. ${item.direction}. ${item.stopName}. ${item.minutes} minutes, ${item.live ? 'live GPS prediction' : 'scheduled time'}.`}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.page,
              { width: pageWidth }]}
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
                {item.live ? <View style={styles.signalSpacer} /> : null}
                <Text style={styles.minutes} testID={`transit-${route.id}-arrival-${index}`}>
                  {item.minutes}
                </Text>
                {item.live ? <LiveSignal style={styles.signal} /> : null}
              </View>
              <Text style={styles.minuteUnit}>minutes</Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>

      {pinned ? <View pointerEvents="none" style={styles.pinBadge} testID={`route-card-${route.id}-pinned`}><Icon color="rgba(255,255,255,0.9)" filled={true} name="pin" size={12} /></View> : null}
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

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    height: 104,
    overflow: 'hidden',
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    marginVertical: 3,
    borderRadius: 14,
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
  timing: { minWidth: 56, alignItems: 'center' },
  scheduledTiming: { opacity: 0.68 },
  timeRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  // The spacer mirrors the signal so the number stays centered over "minutes".
  signalSpacer: { width: LIVE_SIGNAL_WIDTH },
  signal: { marginLeft: 2, marginTop: 1 },
  pinBadge: { position: 'absolute', top: 6, right: 8, transform: [{ rotate: '30deg' }] },
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

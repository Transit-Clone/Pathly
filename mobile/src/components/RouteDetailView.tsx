import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RouteDetail, RoutePrediction } from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { LiveSignal } from './LiveSignal';
import { MapBackdrop } from './MapBackdrop';

type RouteDetailViewProps = { onBack: () => void; route: RouteDetail };

const stopPositions = [
  { left: '13%', top: '48%' }, { left: '29%', top: '42%' }, { left: '44%', top: '37%' },
  { left: '60%', top: '30%' }, { left: '76%', top: '23%' },
] as const;

function predictionsForDirection(route: RouteDetail, directionIndex: number): readonly RoutePrediction[] {
  if (directionIndex === 0) return route.predictions;
  const direction = route.directions[directionIndex] ?? route.directions[0];
  return [
    { minutes: direction.minutes, live: direction.live },
    { minutes: direction.minutes + 14, live: false },
    { minutes: direction.minutes + 30, live: true },
  ];
}

function destinationForDirection(direction: string) {
  return direction.replace(/^(?:westbound|eastbound|northbound|southbound|uptown|downtown)\s+(?:to|toward)\s+/i, '');
}

export function RouteDetailView({ onBack, route }: RouteDetailViewProps) {
  const { height, width } = useWindowDimensions();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(0);
  const mapHeight = Math.max(280, Math.min(390, height * 0.58));
  const pageWidth = Math.min(width, 540) - 36;

  const updateDirection = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveDirectionIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  const activeDirection = route.directions[activeDirectionIndex] ?? route.directions[0];
  const activeDestination = destinationForDirection(activeDirection.direction);

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={`route-detail-${route.id}`}>
        <StatusBar style="dark" />

        <ScrollView bounces={false} contentContainerStyle={styles.page} overScrollMode="never" showsVerticalScrollIndicator={false} testID="route-detail-scroll">
          <View style={[styles.map, { height: mapHeight }]} testID="route-detail-map">
            <MapBackdrop />
            <View style={[styles.routeSegment, styles.segmentOne, { backgroundColor: route.color }]} />
            <View style={[styles.routeSegment, styles.segmentTwo, { backgroundColor: route.color }]} />
            <View style={[styles.routeSegment, styles.segmentThree, { backgroundColor: route.color }]} />

            {route.mapLabels.map((label, index) => {
              const position = stopPositions[index % stopPositions.length];
              return <View key={label} style={[styles.mapStop, position]}><View style={[styles.mapDot, { borderColor: route.color }]} /><Text numberOfLines={2} style={styles.mapLabel}>{label}</Text></View>;
            })}

            <View style={styles.vehicleMarker}><Text style={[styles.vehicleIcon, { color: route.color }]}>▣</Text><View style={[styles.liveBubble, { backgroundColor: route.color }]}><Text style={styles.liveBubbleText}>{activeDirection.minutes}m</Text></View></View>
            <View style={styles.currentLocation}><CurrentLocationMarker /></View>
            <View style={[styles.mapRouteBadge, { backgroundColor: route.color }]} testID="route-detail-badge"><Text style={styles.mapRouteBadgeText}>{route.shortName}</Text></View>
            <View style={styles.destinationOverlay}><Text numberOfLines={1} style={[styles.destinationText, { color: route.color }]}>{activeDestination}</Text></View>
          </View>

          <SafeAreaView edges={['bottom']} style={styles.content} testID="route-detail-content">
            <View style={styles.titleRow}><Text style={styles.title}>{route.routeName}</Text></View>

            <ScrollView decelerationRate="fast" horizontal={true} onMomentumScrollEnd={updateDirection} onScroll={updateDirection} pagingEnabled={true} scrollEventThrottle={16} showsHorizontalScrollIndicator={false} style={styles.directionPager} testID="route-direction-pager">
              {route.directions.map((direction, directionIndex) => (
                <View key={direction.direction} style={[styles.directionPage, { width: pageWidth }]} testID={`route-direction-${directionIndex}`}>
                  <View style={styles.predictions}>
                    {predictionsForDirection(route, directionIndex).map((prediction, index) => {
                      const highlighted = index === 0;
                      const predictionColor = highlighted ? colors.white : route.color;
                      return (
                        <View key={`${directionIndex}-${prediction.minutes}-${prediction.live}`} accessibilityLabel={`${prediction.minutes} minutes, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`} accessible={true} style={[styles.prediction, { borderColor: route.color }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]} testID={`route-prediction-${directionIndex}-${prediction.minutes}`}>
                          <View style={styles.predictionRow}><Text style={[styles.predictionTime, { color: predictionColor }]}>{prediction.minutes}</Text>{prediction.live ? <LiveSignal color={predictionColor} /> : null}</View>
                          <Text style={[styles.predictionUnit, { color: predictionColor }]}>minutes</Text>
                          {!prediction.live ? <Text style={styles.predictionSource}>SCHEDULED</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View accessibilityElementsHidden={true} style={styles.pageDots}>{route.directions.map((direction, index) => <View key={direction.direction} style={[styles.pageDot, index === activeDirectionIndex && { backgroundColor: route.color }]} />)}</View>

            <Pressable accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => setAlertsOpen((value) => !value)} style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]} testID="service-alerts">
              <View style={[styles.alertDot, { backgroundColor: route.alert.startsWith('No delays') ? colors.success : colors.warning }]} /><Text style={styles.alertText}>Service alerts</Text><Text style={styles.alertStatus}>{route.alert.startsWith('No delays') ? 'No delays' : 'Advisory'}</Text><Text style={styles.chevron}>{alertsOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {alertsOpen ? <Text style={styles.alertBody}>{route.alert}</Text> : null}

            <View style={styles.timelineHeading}><Text style={styles.timelineTitle}>Route stops</Text><View style={styles.onTimeChip}><View style={styles.onTimeDot} /><Text style={styles.onTimeText}>On time</Text></View></View>
            <View accessibilityLabel="Stops for the next departure">
              {route.stops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === route.stops.length - 1;
                return (
                  <View key={stop.name} accessibilityLabel={`${stop.name}, ${isFirst ? 'departs' : 'arrives'} ${stop.time}`} accessible={true} style={styles.stopRow}>
                    <View style={styles.timelineRail}>{!isFirst ? <View style={[styles.rail, styles.railTop, { backgroundColor: route.color }]} /> : null}<View style={[styles.stopDot, { borderColor: route.color }, isFirst && { backgroundColor: route.color }]} />{!isLast ? <View style={[styles.rail, styles.railBottom, { backgroundColor: route.color }]} /> : null}</View>
                    <View style={styles.stopCopy}><Text style={styles.stopName}>{stop.name}</Text><Text style={styles.stopMeta}>{isFirst ? 'Departs' : isLast ? 'Final stop' : 'Scheduled stop'}</Text></View>
                    <Text style={styles.stopTime}>{stop.time}</Text>
                  </View>
                );
              })}
            </View>
          </SafeAreaView>
        </ScrollView>

        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topBar}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} testID="route-back"><Text style={styles.backIcon}>‹</Text></Pressable>
          <View style={styles.topActions}>
            <Pressable accessibilityLabel="Show current location" accessibilityRole="button" accessibilityState={{ selected: isLocationCentered }} onPress={() => setIsLocationCentered(true)} style={({ pressed }) => [styles.iconButton, isLocationCentered && styles.selectedButton, pressed && styles.pressed]} testID="route-location"><Text style={styles.locationIcon}>◎</Text></Pressable>
            <Pressable accessibilityLabel={isPinned ? 'Unpin route' : 'Pin route'} accessibilityRole="button" accessibilityState={{ selected: isPinned }} onPress={() => setIsPinned((value) => !value)} style={({ pressed }) => [styles.iconButton, isPinned && { backgroundColor: route.color }, pressed && styles.pressed]} testID="route-pin"><Text style={[styles.pinIcon, { color: isPinned ? colors.white : route.color }]}>◆</Text></Pressable>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  page: {
    backgroundColor: colors.surface,
    paddingBottom: 8,
  },
  map: {
    overflow: 'hidden',
    backgroundColor: colors.blueSoft,
  },
  routeSegment: {
    position: 'absolute',
    height: 10,
    borderRadius: 5,
  },
  segmentOne: {
    top: '48%',
    left: '10%',
    width: '38%',
    transform: [{ rotate: '-18deg' }],
  },
  segmentTwo: {
    top: '36%',
    left: '40%',
    width: '34%',
    transform: [{ rotate: '-28deg' }],
  },
  segmentThree: {
    top: '23%',
    left: '69%',
    width: '25%',
    transform: [{ rotate: '-12deg' }],
  },
  mapStop: {
    position: 'absolute',
    width: 76,
    alignItems: 'center',
    marginLeft: -28,
    marginTop: -8,
  },
  mapDot: {
    width: 18,
    height: 18,
    borderWidth: 5,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  mapLabel: {
    marginTop: 4,
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },
  vehicleMarker: {
    position: 'absolute',
    top: '39%',
    left: '42%',
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 5,
  },
  vehicleIcon: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 26,
  },
  liveBubble: {
    position: 'absolute',
    top: -7,
    right: -13,
    minWidth: 34,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 12,
  },
  liveBubbleText: {
    color: colors.white,
    fontFamily: fontFamilies.extraBold,
    fontSize: 10,
  },
  currentLocation: {
    position: 'absolute',
    top: '54%',
    left: '56%',
  },
  mapRouteBadge: {
    position: 'absolute',
    top: 120,
    left: 14,
    minWidth: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 15,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  mapRouteBadgeText: {
    color: colors.white,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
  },
  destinationOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 10,
    left: 18,
  },
  destinationText: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 20,
    lineHeight: 23,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  backButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  backIcon: {
    color: colors.primary,
    fontFamily: fontFamilies.regular,
    fontSize: 33,
    lineHeight: 35,
  },
  topActions: {
    gap: 9,
  },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedButton: {
    backgroundColor: colors.blueSoft,
  },
  locationIcon: {
    color: colors.primary,
    fontFamily: fontFamilies.extraBold,
    fontSize: 24,
  },
  pinIcon: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
  },
  content: {
    minHeight: 560,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  titleRow: {
    minHeight: 40,
    justifyContent: 'center',
  },
  title: {
    color: colors.ink,
    ...typography.screenHeading,
    fontSize: 23,
    lineHeight: 27,
  },
  directionPager: {
    marginHorizontal: 0,
  },
  directionPage: {
    paddingRight: 0,
  },
  predictions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
  },
  prediction: {
    minWidth: 0,
    minHeight: 112,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  scheduled: {
    opacity: 0.68,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  predictionTime: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 42,
    lineHeight: 47,
  },
  predictionUnit: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
  },
  predictionSource: {
    marginTop: 5,
    color: colors.mutedInk,
    ...typography.label,
    fontSize: 8,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 10,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  alertButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.background,
  },
  alertDot: {
    width: 9,
    height: 9,
    marginRight: 9,
    borderRadius: 5,
  },
  alertText: {
    flex: 1,
    color: colors.ink,
    ...typography.bodyStrong,
  },
  alertStatus: {
    color: colors.success,
    ...typography.metadata,
  },
  chevron: {
    marginLeft: 8,
    color: colors.mutedInk,
    fontFamily: fontFamilies.extraBold,
  },
  alertBody: {
    paddingHorizontal: 14,
    paddingTop: 8,
    color: colors.mutedInk,
    ...typography.metadata,
  },
  timelineHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 4,
  },
  timelineTitle: {
    color: colors.ink,
    ...typography.sectionHeading,
  },
  onTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 7,
    borderRadius: 10,
    backgroundColor: colors.greenSoft,
  },
  onTimeDot: {
    width: 6,
    height: 6,
    marginRight: 5,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  onTimeText: {
    color: colors.success,
    fontFamily: fontFamilies.extraBold,
    fontSize: 10,
  },
  stopRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineRail: {
    width: 30,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  rail: {
    position: 'absolute',
    width: 4,
    height: '50%',
  },
  railTop: {
    top: 0,
  },
  railBottom: {
    bottom: 0,
  },
  stopDot: {
    zIndex: 1,
    width: 15,
    height: 15,
    borderWidth: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  stopCopy: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stopName: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
  },
  stopMeta: {
    marginTop: 3,
    color: colors.mutedInk,
    ...typography.metadata,
    fontSize: 11,
  },
  stopTime: {
    paddingLeft: 10,
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.65,
  },
});

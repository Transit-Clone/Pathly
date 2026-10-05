import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useLirrLive } from '../data/LirrLiveContext';
import { minuteLabel, scheduleStopsFromNow, stopsForDirection, type RouteDetail, type RoutePrediction } from '../data/transit';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { readableColor } from '../theme/contrast';
import { fontFamilies, typography } from '../theme/typography';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { LirrRouteMap } from './LirrRouteMap';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { MapBackdrop } from './MapBackdrop';
import { pointAlong, routeFocus, RouteLines, VehicleMarker, type MapLeg } from './RouteMapOverlay';
import { RouteBadge, transitModeForAgency } from './RouteBadge';
import { PressableScale } from './PressableScale';

type RouteDetailViewProps = {
  isFavorite: boolean;
  isPinned: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  route: RouteDetail;
};

function predictionsForDirection(route: RouteDetail, directionIndex: number): readonly RoutePrediction[] {
  if (directionIndex === 0) return route.predictions;
  if (route.reversePredictions) return route.reversePredictions;
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

export function RouteDetailView({ isFavorite, isPinned, onBack, onToggleFavorite, onTogglePin, route }: RouteDetailViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  // Route colors stay exact on fills; text and icons are lightened in dark mode to stay readable.
  const routeText = isDark ? readableColor(route.color, colors.surface) : route.color;
  const { height, width } = useWindowDimensions();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const ease = useLayoutEase();
  const lirrLive = useLirrLive();
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(0);
  const mapHeight = Math.max(280, Math.min(390, height * 0.58));
  const pageWidth = Math.min(width, 540) - 36;

  const updateDirection = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveDirectionIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  // Opens on whichever direction's next train is actually sooner, not always the first
  // direction — otherwise a much closer train on the other tab (e.g. 9 min eastbound) could
  // sit hidden behind a farther one shown first (e.g. 60 min westbound) just because of tab
  // order. Only acts once real live data exists for *both* directions (so it's never guessing
  // off the illustrative mock numbers), and only on first load — it won't yank the view out
  // from under someone who already swiped or tapped a direction themselves. Adjusted during
  // render (React's documented pattern for this, see "Adjusting state when a prop changes")
  // rather than in an effect, since it's a one-time derivation from props, not a subscription.
  const [hasAutoSelectedDirection, setHasAutoSelectedDirection] = useState(false);
  const directionScrollRef = useRef<ScrollView>(null);
  if (!hasAutoSelectedDirection) {
    const [first, second] = route.directions;
    if (first.live && second.live) {
      setHasAutoSelectedDirection(true);
      if (second.minutes < first.minutes) setActiveDirectionIndex(1);
    }
  }

  // On native, the ScrollView's own scroll position (not `activeDirectionIndex`) decides which
  // page is actually visible, so it's kept in sync here — covers the auto-select above and is
  // a no-op (already there) after the user's own scroll gesture updates the index instead.
  useEffect(() => {
    directionScrollRef.current?.scrollTo({ x: activeDirectionIndex * pageWidth, animated: false });
  }, [activeDirectionIndex, pageWidth]);

  // react-native-web's horizontal ScrollView doesn't support click-and-drag scrolling for
  // mouse users the way native touch devices do (browsers only do that for real touch/trackpad
  // gestures), so `pagingEnabled` alone never lets a mouse user swipe here — same gap already
  // hit on the route card. Native keeps the ScrollView paging below, which already works.
  const directionDragStartX = useRef<number | null>(null);
  const DIRECTION_SWIPE_THRESHOLD = 24;

  const handleDirectionPressIn = (event: GestureResponderEvent) => {
    directionDragStartX.current = event.nativeEvent.pageX;
  };

  const handleDirectionPressOut = (event: GestureResponderEvent) => {
    const startX = directionDragStartX.current;
    directionDragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= DIRECTION_SWIPE_THRESHOLD) return;
    const direction = dx < 0 ? 1 : -1;
    setActiveDirectionIndex((current) => Math.min(Math.max(current + direction, 0), route.directions.length - 1));
  };

  const activeDirection = route.directions[activeDirectionIndex] ?? route.directions[0];
  const activeDestination = destinationForDirection(activeDirection.direction);

  // Anchored to the actual current time (not a fixed baked-in schedule) so "Route stops"
  // reads like a real transit app — the first stop leaves in as many minutes as the
  // headline prediction above already shows, and every other stop is offset from that.
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const leadMinutes = predictionsForDirection(route, activeDirectionIndex)[0]?.minutes ?? 0;
  const liveStops = scheduleStopsFromNow(stopsForDirection(route, activeDirectionIndex), nowMinutes, leadMinutes);

  const vehicleIcon = transitModeForAgency(route.agency);
  const hasDelay = !route.alert.startsWith('No delays');

  const routeLeg: MapLeg = {
    color: route.color,
    path: route.mapPath,
    stops: route.mapStops.map((pathIndex, index) => ({ label: route.mapLabels[index], point: route.mapPath[pathIndex]! })),
  };

  // Port Jefferson Branch has a real live feed; every other route still uses the illustrative map.
  const map = route.id === 'ronkonkoma' ? (
    <>
      <LirrRouteMap vehicles={lirrLive?.vehicles ?? []} />
      <RouteBadge agency={route.agency} color={route.color} shortName={route.shortName} size="large" style={styles.mapRouteBadge} testID="route-detail-badge" withModeIcon={true} />
    </>
  ) : (
    <>
      <MapBackdrop
        focus={routeFocus([route.mapPath])}
        initialSize={{ width: Math.min(width, 540), height: mapHeight }}
        padding={{ top: 76, right: 64, bottom: 44, left: 16 }}
        renderMarkers={(projection) => (
          <VehicleMarker color={route.color} minutes={activeDirection.minutes} mode={vehicleIcon} point={pointAlong(route.mapPath, activeDirectionIndex === 0 ? 0.3 : 0.7)} projection={projection} />
        )}
        renderOverlay={({ scale }) => <RouteLines legs={[routeLeg]} scale={scale} />}
        showUserLocation={true}
      />
      <RouteBadge agency={route.agency} color={route.color} shortName={route.shortName} size="large" style={styles.mapRouteBadge} testID="route-detail-badge" withModeIcon={true} />
    </>
  );

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <PressableScale accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.iconButton} testID="route-back"><Icon name="back" size={26} /></PressableScale>
      <View style={styles.topActions}>
        <PressableScale accessibilityLabel="Show current location" accessibilityRole="button" accessibilityState={{ selected: isLocationCentered }} onPress={() => setIsLocationCentered(true)} style={[styles.iconButton, isLocationCentered && styles.selectedButton]} testID="route-location"><Icon filled={isLocationCentered} name="locate" /></PressableScale>
        <PressableScale accessibilityLabel={isFavorite ? 'Remove route from favorites' : 'Add route to favorites'} accessibilityRole="button" accessibilityState={{ selected: isFavorite }} onPress={onToggleFavorite} style={[styles.iconButton, isFavorite && styles.selectedButton]} testID="route-favorite"><Icon color={isFavorite ? colors.warning : colors.primary} filled={isFavorite} name="favorite" /></PressableScale>
        <PressableScale accessibilityLabel={isPinned ? 'Unpin route' : 'Pin route'} accessibilityRole="button" accessibilityState={{ selected: isPinned }} onPress={onTogglePin} style={[styles.iconButton, isPinned && { backgroundColor: route.color }]} testID="route-pin"><Icon color={isPinned ? colors.white : routeText} filled={isPinned} name="pin" /></PressableScale>
      </View>
    </View>
  );

  return (
    <DetailMapPage
      controlsScrollWithMap={true}
      contentStyle={styles.content}
      contentTestID="route-detail-content"
      controls={controls}
      map={map}
      mapHeight={mapHeight}
      mapTestID="route-detail-map"
      scrollTestID="route-detail-scroll"
      showHeader={false}
      testID={`route-detail-${route.id}`}
    >
      <ThemedStatusBar />
      <View style={styles.titleRow}><Text accessibilityRole="header" numberOfLines={2} style={styles.title} testID="route-detail-destination">{activeDestination}</Text></View>

      {Platform.OS === 'web' ? (
        <PressableScale
          accessibilityHint="Swipe horizontally for the other direction."
          accessible={false}
          onPressIn={handleDirectionPressIn}
          onPressOut={handleDirectionPressOut}
          style={[styles.directionPage, { width: pageWidth }]}
          testID={`route-direction-${activeDirectionIndex}`}
        >
          <View style={styles.predictions}>
            {predictionsForDirection(route, activeDirectionIndex).map((prediction, index) => {
              const highlighted = index === 0;
              const predictionColor = highlighted ? colors.white : routeText;
              return (
                <View key={`${activeDirectionIndex}-${prediction.minutes}-${prediction.live}`} accessibilityLabel={`${prediction.minutes} ${minuteLabel(prediction.minutes)}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`} accessible={true} style={[styles.prediction, { borderColor: route.color }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]} testID={`route-prediction-${activeDirectionIndex}-${prediction.minutes}`}>
                  <View style={styles.predictionRow}>{prediction.live ? <View style={styles.predictionSignalSpacer} /> : null}<Text style={[styles.predictionTime, { color: predictionColor }]}>{prediction.minutes}</Text>{prediction.live ? <LiveSignal color={predictionColor} style={styles.predictionSignal} /> : null}</View>
                  <Text style={[styles.predictionUnit, { color: predictionColor }]}>{minuteLabel(prediction.minutes)}</Text>
                  {!prediction.live ? <Text style={styles.predictionSource}>SCHEDULED</Text> : null}
                </View>
              );
            })}
          </View>
        </PressableScale>
      ) : (
        <ScrollView ref={directionScrollRef} decelerationRate="fast" horizontal={true} onMomentumScrollEnd={updateDirection} onScroll={updateDirection} pagingEnabled={true} scrollEventThrottle={16} showsHorizontalScrollIndicator={false} style={styles.directionPager} testID="route-direction-pager">
          {route.directions.map((direction, directionIndex) => (
            <View key={direction.direction} style={[styles.directionPage, { width: pageWidth }]} testID={`route-direction-${directionIndex}`}>
              <View style={styles.predictions}>
                {predictionsForDirection(route, directionIndex).map((prediction, index) => {
                  const highlighted = index === 0;
                  const predictionColor = highlighted ? colors.white : routeText;
                  return (
                    <View key={`${directionIndex}-${prediction.minutes}-${prediction.live}`} accessibilityLabel={`${prediction.minutes} ${minuteLabel(prediction.minutes)}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`} accessible={true} style={[styles.prediction, { borderColor: route.color }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]} testID={`route-prediction-${directionIndex}-${prediction.minutes}`}>
                      <View style={styles.predictionRow}>{prediction.live ? <View style={styles.predictionSignalSpacer} /> : null}<Text style={[styles.predictionTime, { color: predictionColor }]}>{prediction.minutes}</Text>{prediction.live ? <LiveSignal color={predictionColor} style={styles.predictionSignal} /> : null}</View>
                      <Text style={[styles.predictionUnit, { color: predictionColor }]}>{minuteLabel(prediction.minutes)}</Text>
                      {!prediction.live ? <Text style={styles.predictionSource}>SCHEDULED</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.pageDots}>
        {route.directions.map((direction, index) => (
          <PressableScale
            key={direction.direction}
            accessibilityLabel={`Show ${destinationForDirection(direction.direction)} predictions`}
            accessibilityRole="button"
            accessibilityState={{ selected: index === activeDirectionIndex }}
            hitSlop={8}
            onPress={() => setActiveDirectionIndex(index)}
          >
            <View style={[styles.pageDot, index === activeDirectionIndex && { backgroundColor: route.color }]} />
          </PressableScale>
        ))}
      </View>

      <PressableScale accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => {
        ease();
        setAlertsOpen((value) => !value);
      }} style={styles.alertButton} testID="service-alerts">
        <Icon color={hasDelay ? colors.warning : colors.success} filled={true} name={hasDelay ? 'alert' : 'ok'} size={18} style={styles.alertIcon} /><Text style={styles.alertText}>Service alerts</Text><Text style={[styles.alertStatus, hasDelay && { color: colors.warning }]}>{hasDelay ? 'Advisory' : 'No delays'}</Text><Icon color={colors.mutedInk} name={alertsOpen ? 'collapse' : 'expand'} size={18} style={styles.chevron} />
      </PressableScale>
      {alertsOpen ? <Text style={styles.alertBody}>{route.alert}</Text> : null}

      <View style={styles.timelineHeading}><Text style={styles.timelineTitle}>Route stops</Text><View style={styles.onTimeChip}><View style={styles.onTimeDot} /><Text style={styles.onTimeText}>On time</Text></View></View>
      <View accessibilityLabel="Stops for the next departure">
        {liveStops.map((stop, index) => {
          const isFirst = index === 0;
          const isLast = index === liveStops.length - 1;
          return (
            <View key={stop.name} accessibilityLabel={`${stop.name}, ${isFirst ? 'departs' : 'arrives'} ${stop.time}`} accessible={true} style={styles.stopRow}>
              <View style={styles.timelineRail}>{!isFirst ? <View style={[styles.rail, styles.railTop, { backgroundColor: route.color }]} /> : null}<View style={[styles.stopDot, { borderColor: route.color }, isFirst && { backgroundColor: route.color }]} />{!isLast ? <View style={[styles.rail, styles.railBottom, { backgroundColor: route.color }]} /> : null}</View>
              <View style={styles.stopCopy}><Text style={styles.stopName}>{stop.name}</Text><Text style={styles.stopMeta}>{isFirst ? 'Departs' : isLast ? 'Final stop' : 'Scheduled stop'}</Text></View>
              <Text style={styles.stopTime}>{stop.time}</Text>
            </View>
          );
        })}
      </View>
    </DetailMapPage>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  mapRouteBadge: {
    position: 'absolute',
    top: 120,
    left: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
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
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
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
    flexGrow: 0,
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  // Mirrors the signal so the number stays centered over "minutes".
  predictionSignalSpacer: {
    width: LIVE_SIGNAL_WIDTH,
  },
  predictionSignal: {
    marginLeft: 2,
    marginTop: 6,
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
  // Positioned so scheduled tiles keep the same number and label placement as live ones.
  predictionSource: {
    position: 'absolute',
    bottom: 12,
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
  alertIcon: {
    marginRight: 8,
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
});

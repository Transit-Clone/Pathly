import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTransitLive } from '../data/TransitLiveContext';
import { realFareForRoute } from '../data/lirrFares';
import { PORT_JEFFERSON_SHAPE } from '../data/portJeffersonShape';
import { fetchRouteGeometry, type RouteGeometry } from '../data/routeGeometry';
import { STATION_TRANSFERS, type StationTransfer } from '../data/stationTransfers';
import { formatClockTime, isDueNow, minuteLabel, scheduleStopsFromNow, stopsForDirection, type RouteDetail, type RoutePrediction } from '../data/transit';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { readableColor } from '../theme/contrast';
import { fontFamilies, typography } from '../theme/typography';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { MapBackdrop } from './MapBackdrop';
import { RouteMap } from './RouteMap';
import { pointAlong, routeFocus, RouteLines, VehicleMarker, type MapLeg } from './RouteMapOverlay';
import { RouteBadge, transitModeForAgency } from './RouteBadge';
import { PressableScale } from './PressableScale';

type RouteDetailViewProps = {
  isFavorite: boolean;
  isPinned: boolean;
  /** Rider's location for the live map; `locationKnown` is false while it's only the fallback. */
  location?: Coordinates;
  locationKnown?: boolean;
  onBack: () => void;
  onRefreshLocation?: () => void;
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

/** A prediction tile's big value and small unit label — "Due"/"now" once the countdown hits zero (a literal "0 minutes" reads as broken), otherwise the plain minute count. */
function predictionTiming(prediction: RoutePrediction): { accessibility: string; unit: string; value: string } {
  if (isDueNow(prediction.minutes)) {
    return { value: 'Due', unit: 'now', accessibility: 'due now' };
  }
  return { value: String(prediction.minutes), unit: minuteLabel(prediction.minutes), accessibility: `${prediction.minutes} ${minuteLabel(prediction.minutes)}` };
}

/** Why there are no prediction tiles to show for this route right now — null for routes with no `liveSource` at all, since their illustrative data always has entries. */
function predictionsEmptyMessage(route: RouteDetail): string | null {
  if (!route.liveSource) return null;
  if (route.liveStatus === 'loading') return `Loading the next arrival for ${route.routeName}…`;
  if (route.liveStatus === 'error') return 'Live data unavailable right now.';
  return 'No upcoming departures right now.';
}

type LiveStop = { name: string; time: string; stopId?: string };
type LiveStopsResult =
  | { status: 'ready'; stops: readonly LiveStop[] }
  | { status: 'loading' }
  | { status: 'error' };

/**
 * The timed "Route stops" list for whichever direction is active. Routes with a `liveSource`
 * use the real, backend-derived geometry (gtfsDiscovery.ts's getRouteGeometry — the same data
 * already fetched for the map) rather than a second, hand-authored stop list that can drift
 * from it or simply never match its station names (the actual bug this replaces: a hand-typed
 * illustrative list, like the subway routes', rarely matches the real GTFS station name a
 * rider's nearest-stop lookup resolves to, so "nearest to you" could never find a match for
 * them). No fallback to stale/mismatched data while loading or on error — matches this app's
 * standing rule of showing an honest loading/unavailable state instead. Routes with no
 * `liveSource` (no real geometry to fetch) keep the static, hand-authored stop list, which is
 * their actual intended data, not a fallback.
 */
function liveStopsFor(
  route: RouteDetail,
  activeDirectionIndex: number,
  activeDirection: RouteDetail['directions'][number],
  geometryStatus: { status: 'loading' | 'error' } | { status: 'loaded'; geometry: RouteGeometry },
  nowMinutes: number,
  leadMinutes: number,
): LiveStopsResult {
  if (!route.liveSource) {
    return { status: 'ready', stops: scheduleStopsFromNow(stopsForDirection(route, activeDirectionIndex), nowMinutes, leadMinutes, activeDirection.stopName) };
  }
  if (geometryStatus.status !== 'loaded') return geometryStatus;

  // Starts at the rider's nearest stop (reached in `leadMinutes`) and runs to the end of the
  // line in this direction; stops behind the rider are dropped.
  const { stops } = geometryStatus.geometry;
  const anchorIndex = Math.max(0, activeDirection.stopId ? stops.findIndex((stop) => stop.stopId === activeDirection.stopId) : 0);
  const anchor = nowMinutes + leadMinutes - (stops[anchorIndex]?.offsetMinutes ?? 0);
  return { status: 'ready', stops: stops.slice(anchorIndex).map((stop) => ({ name: stop.name, stopId: stop.stopId, time: formatClockTime(anchor + stop.offsetMinutes) })) };
}

const MAX_TRANSFER_CHIPS = 8;

/**
 * Transfers are generated for the Port Jefferson Branch's stations only
 * (scripts/generate_station_transfers.py), keyed by station name.
 */
function transfersFor(route: RouteDetail, stopName: string): readonly StationTransfer[] {
  return route.liveSource?.agencyId === 'lirr' && route.liveSource.routeId === '10' ? STATION_TRANSFERS[stopName] ?? [] : [];
}

/** Connecting lines at a station: rail, then subway (circles), then bus, in each agency's colors. */
function TransferChips({ stopName, transfers }: { stopName: string; transfers: readonly StationTransfer[] }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const shown = transfers.slice(0, MAX_TRANSFER_CHIPS);
  const hidden = transfers.length - shown.length;
  return (
    <View style={styles.transfers} testID={`stop-transfers-${stopName}`}>
      {shown.map((transfer) => (
        <View
          key={`${transfer.agency}-${transfer.name}`}
          style={[styles.transferChip, transfer.mode === 'subway' && styles.subwayChip, { backgroundColor: transfer.color ?? colors.surfaceMuted }]}
          testID={`route-transfer-${stopName}-${transfer.name}`}
        >
          <Text numberOfLines={1} style={[styles.transferText, { color: transfer.color ? transfer.textColor ?? colors.white : colors.ink }]}>{transfer.name}</Text>
        </View>
      ))}
      {hidden > 0 ? <Text style={styles.transferMore} testID={`stop-transfers-more-${stopName}`}>+{hidden}</Text> : null}
    </View>
  );
}

export function RouteDetailView({ isFavorite, isPinned, location, locationKnown = false, onBack, onRefreshLocation, onToggleFavorite, onTogglePin, route }: RouteDetailViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  // Route colors stay exact on fills; text and icons are lightened in dark mode to stay readable.
  const routeText = isDark ? readableColor(route.color, colors.surface) : route.color;
  const { height, width } = useWindowDimensions();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const ease = useLayoutEase();
  const liveStatus = useTransitLive(route.id);
  const vehicles = liveStatus.status === 'loaded' ? liveStatus.data.vehicles : [];
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  // Bumped on each location-button press; the live map re-centers on the rider whenever it changes.
  const [centerOnUserRequest, setCenterOnUserRequest] = useState(0);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(0);
  const mapHeight = Math.max(280, Math.min(390, height * 0.58));
  const pageWidth = Math.min(width, 540) - 36;

  const updateDirection = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveDirectionIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  // Which upcoming trip's tile is tapped — "Route stops" below shows *that* trip's schedule,
  // not always the very next one, so tapping a later tile answers "what are this train's stop
  // times" instead of only ever being able to see the soonest trip's. Resets to the soonest
  // trip whenever the direction tab changes, since the other direction's predictions are a
  // completely different set of trips — adjusted during render (same pattern as
  // hasAutoSelectedDirection below) rather than in an effect, since it's a direct response to
  // activeDirectionIndex changing, not a subscription to an external system.
  const [selectedPredictionIndex, setSelectedPredictionIndex] = useState(0);
  const [predictionResetForDirection, setPredictionResetForDirection] = useState(activeDirectionIndex);
  if (activeDirectionIndex !== predictionResetForDirection) {
    setPredictionResetForDirection(activeDirectionIndex);
    setSelectedPredictionIndex(0);
  }

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
    if (first.live && second.live && !first.unavailable && !second.unavailable) {
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

  // `onTap` fires for a plain tap (negligible horizontal movement) instead of the swipe — used
  // by each prediction tile below so tapping one selects it, while still swiping anywhere
  // (including starting on a tile) to change direction, with exactly one handler per touch
  // rather than this and a tile's own tap handler racing over the same gesture.
  const handleDirectionPressOut = (event: GestureResponderEvent, onTap?: () => void) => {
    const startX = directionDragStartX.current;
    directionDragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= DIRECTION_SWIPE_THRESHOLD) {
      onTap?.();
      return;
    }
    const direction = dx < 0 ? 1 : -1;
    setActiveDirectionIndex((current) => Math.min(Math.max(current + direction, 0), route.directions.length - 1));
  };

  const activeDirection = route.directions[activeDirectionIndex] ?? route.directions[0];
  const activeDestination = destinationForDirection(activeDirection.direction);

  // Real geometry is fetched on demand for whichever route is actually open, derived
  // generically on the backend from its real schedule (gtfsDiscovery.ts) — not hand-authored
  // per route — so this works for any route with a `liveSource`, not a fixed handful. It's the
  // same data both the map and "Route stops" below use, rather than each keeping its own
  // separate stop list. Refetches (from the client-side cache, so effectively instant after
  // the first time) whenever the active direction's corresponding GTFS direction_id changes,
  // not just when the route itself changes, so both stay in sync with whichever tab is open.
  const liveSourceAgencyId = route.liveSource?.agencyId;
  const liveSourceRouteId = route.liveSource?.routeId;
  const geometryDirectionId: 0 | 1 | undefined = route.liveSource
    ? (activeDirectionIndex === route.liveSource.direction1Index ? 1 : 0)
    : undefined;
  const [geometryStatus, setGeometryStatus] = useState<{ status: 'loading' | 'error' } | { status: 'loaded'; geometry: RouteGeometry }>({ status: 'loading' });
  useEffect(() => {
    if (!route.liveSource || geometryDirectionId === undefined) return undefined;
    let cancelled = false;
    const load = async () => {
      setGeometryStatus({ status: 'loading' });
      const geometry = await fetchRouteGeometry(route.liveSource!, geometryDirectionId);
      if (cancelled) return;
      setGeometryStatus(geometry ? { status: 'loaded', geometry } : { status: 'error' });
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the stable primitive IDs, not the liveSource object (see comment above)
  }, [liveSourceAgencyId, liveSourceRouteId, geometryDirectionId]);

  // Anchored to the actual current time (not a fixed baked-in schedule) so "Route stops"
  // reads like a real transit app — the rider's actual nearest stop (activeDirection.stopId,
  // which tracks their real location, not always the route's origin terminal) is reached in as
  // many minutes as the *tapped* prediction tile shows (selectedPredictionIndex, defaulting to
  // the soonest trip), and every other stop is offset from that same anchor — so tapping a
  // later trip's tile shows that specific trip's own stop times, not always the next trip's.
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activePredictions = predictionsForDirection(route, activeDirectionIndex);
  const leadMinutes = (activePredictions[selectedPredictionIndex] ?? activePredictions[0])?.minutes ?? 0;
  const liveStopsResult = liveStopsFor(route, activeDirectionIndex, activeDirection, geometryStatus, nowMinutes, leadMinutes);
  // Fare is always priced for the route's primary direction (route.predictions, index 0),
  // regardless of which direction tab is active — see realFareForRoute's own comment.
  const fare = realFareForRoute(route, now, route.predictions[0]?.peakOffpeak);

  const vehicleIcon = transitModeForAgency(route.agency);
  const hasDelay = !route.alert.startsWith('No delays');

  // Only ever rendered below for a route with no `liveSource` — every entry in the static demo
  // catalog has real values here; a dynamically-discovered route always has a `liveSource`
  // instead (and so never reaches this branch), which is why these can be optional on
  // `RouteDetail` at all. The `?? []` fallbacks are therefore just to satisfy that optionality,
  // not a real fallback path.
  const illustrativeMapPath = route.mapPath ?? [];
  const routeLeg: MapLeg = {
    color: route.color,
    path: illustrativeMapPath,
    stops: (route.mapStops ?? []).map((pathIndex, index) => ({ label: (route.mapLabels ?? [])[index] ?? '', point: illustrativeMapPath[pathIndex] ?? [0, 0] })),
  };

  // Routes with a `liveSource` get the real map (once its geometry has loaded); every other
  // route still uses the illustrative overlay, since it never had real geometry to fetch.
  const map = !route.liveSource ? (
    <>
      <MapBackdrop
        focus={routeFocus([illustrativeMapPath])}
        initialSize={{ width: Math.min(width, 540), height: mapHeight }}
        padding={{ top: 76, right: 64, bottom: 44, left: 16 }}
        renderMarkers={(projection) => (
          <VehicleMarker color={route.color} minutes={activeDirection.minutes} mode={vehicleIcon} point={pointAlong(illustrativeMapPath, activeDirectionIndex === 0 ? 0.3 : 0.7)} projection={projection} />
        )}
        renderOverlay={({ scale }) => <RouteLines legs={[routeLeg]} scale={scale} />}
        showUserLocation={true}
      />
      <RouteBadge agency={route.agency} color={route.color} shortName={route.shortName} size="large" style={styles.mapRouteBadge} testID="route-detail-badge" withModeIcon={true} />
    </>
  ) : geometryStatus.status === 'loaded' ? (
    <>
      <RouteMap
        centerOnUserRequest={centerOnUserRequest}
        color={route.color}
        directionId={geometryDirectionId}
        focusStopId={activeDirection.stopId}
        mode={vehicleIcon}
        onUserPan={() => setIsLocationCentered(false)}
        // Real track geometry is only bundled for the Port Jefferson Branch; other routes join their stops.
        path={route.liveSource?.agencyId === 'lirr' && route.liveSource.routeId === '10' ? PORT_JEFFERSON_SHAPE : undefined}
        stops={geometryStatus.geometry.stops}
        userLocation={locationKnown ? location : undefined}
        vehicles={vehicles}
      />
      {/* Overlay that ignores touches, so the badge never blocks panning the live map under it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RouteBadge agency={route.agency} color={route.color} shortName={route.shortName} size="large" style={styles.mapRouteBadge} testID="route-detail-badge" withModeIcon={true} />
      </View>
    </>
  ) : (
    <View style={styles.mapFallback} testID="route-map-fallback">
      {geometryStatus.status === 'loading' ? (
        <>
          <ActivityIndicator color={route.color} />
          <Text style={styles.mapFallbackText}>{`Loading the map for ${route.routeName}…`}</Text>
        </>
      ) : (
        <Text style={styles.mapFallbackText}>Map unavailable</Text>
      )}
    </View>
  );

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <PressableScale accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.iconButton} testID="route-back"><Icon name="back" size={26} /></PressableScale>
      <View style={styles.topActions}>
        <PressableScale accessibilityLabel="Show current location" accessibilityRole="button" accessibilityState={{ selected: isLocationCentered }} onPress={() => {
          setIsLocationCentered(true);
          onRefreshLocation?.();
          setCenterOnUserRequest((count) => count + 1);
        }} style={[styles.iconButton, isLocationCentered && styles.selectedButton]} testID="route-location"><Icon filled={isLocationCentered} name="locate" /></PressableScale>
        <PressableScale accessibilityLabel={isFavorite ? 'Remove route from favorites' : 'Add route to favorites'} accessibilityRole="button" accessibilityState={{ selected: isFavorite }} onPress={onToggleFavorite} style={[styles.iconButton, isFavorite && styles.selectedButton]} testID="route-favorite"><Icon color={isFavorite ? colors.warning : colors.primary} filled={isFavorite} name="favorite" /></PressableScale>
        <PressableScale accessibilityLabel={isPinned ? 'Unpin route' : 'Pin route'} accessibilityRole="button" accessibilityState={{ selected: isPinned }} onPress={onTogglePin} style={[styles.iconButton, isPinned && { backgroundColor: route.color }]} testID="route-pin"><Icon color={isPinned ? colors.white : routeText} filled={isPinned} name="pin" /></PressableScale>
      </View>
    </View>
  );

  return (
    <DetailMapPage
      controlsScrollWithMap={true}
      // Only the real Google map is pannable/zoomable; illustrated maps stay a static backdrop.
      interactiveMap={!!route.liveSource && geometryStatus.status === 'loaded'}
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
            {predictionsForDirection(route, activeDirectionIndex).length === 0 ? (
              <View accessible={true} style={styles.predictionsEmpty} testID="route-predictions-empty">
                {route.liveStatus === 'loading' ? <ActivityIndicator color={route.color} style={styles.predictionsEmptySpinner} /> : null}
                <Text style={styles.predictionsEmptyText}>{predictionsEmptyMessage(route)}</Text>
              </View>
            ) : (
              predictionsForDirection(route, activeDirectionIndex).map((prediction, index) => {
                const highlighted = index === selectedPredictionIndex;
                const predictionColor = highlighted ? colors.white : routeText;
                const timing = predictionTiming(prediction);
                return (
                  <PressableScale
                    key={`${activeDirectionIndex}-${index}`}
                    accessibilityHint="Shows this trip's stop times below."
                    accessibilityLabel={`${timing.accessibility}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: highlighted }}
                    onPressIn={handleDirectionPressIn}
                    onPressOut={(event) => handleDirectionPressOut(event, () => setSelectedPredictionIndex(index))}
                    style={[styles.prediction, { borderColor: route.color }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]}
                    testID={`route-prediction-${activeDirectionIndex}-${index}`}
                  >
                    <View style={styles.predictionRow}>{prediction.live ? <View style={styles.predictionSignalSpacer} /> : null}<Text style={[styles.predictionTime, { color: predictionColor }]}>{timing.value}</Text>{prediction.live ? <LiveSignal color={predictionColor} style={styles.predictionSignal} /> : null}</View>
                    <Text style={[styles.predictionUnit, { color: predictionColor }]}>{timing.unit}</Text>
                    {!prediction.live ? <Text style={styles.predictionSource} testID="route-prediction-scheduled">SCHEDULED</Text> : null}
                  </PressableScale>
                );
              })
            )}
          </View>
        </PressableScale>
      ) : (
        <ScrollView ref={directionScrollRef} decelerationRate="fast" horizontal={true} onMomentumScrollEnd={updateDirection} onScroll={updateDirection} pagingEnabled={true} scrollEventThrottle={16} showsHorizontalScrollIndicator={false} style={styles.directionPager} testID="route-direction-pager">
          {route.directions.map((direction, directionIndex) => (
            <View key={direction.direction} style={[styles.directionPage, { width: pageWidth }]} testID={`route-direction-${directionIndex}`}>
              <View style={styles.predictions}>
                {predictionsForDirection(route, directionIndex).length === 0 ? (
                  <View accessible={true} style={styles.predictionsEmpty} testID="route-predictions-empty">
                    {route.liveStatus === 'loading' ? <ActivityIndicator color={route.color} style={styles.predictionsEmptySpinner} /> : null}
                    <Text style={styles.predictionsEmptyText}>{predictionsEmptyMessage(route)}</Text>
                  </View>
                ) : (
                  predictionsForDirection(route, directionIndex).map((prediction, index) => {
                    const highlighted = directionIndex === activeDirectionIndex ? index === selectedPredictionIndex : index === 0;
                    const predictionColor = highlighted ? colors.white : routeText;
                    const timing = predictionTiming(prediction);
                    return (
                      <PressableScale
                        key={`${directionIndex}-${index}`}
                        accessibilityHint="Shows this trip's stop times below."
                        accessibilityLabel={`${timing.accessibility}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: highlighted }}
                        onPress={() => {
                          setActiveDirectionIndex(directionIndex);
                          setSelectedPredictionIndex(index);
                        }}
                        style={[styles.prediction, { borderColor: route.color }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]}
                        testID={`route-prediction-${directionIndex}-${index}`}
                      >
                        <View style={styles.predictionRow}>{prediction.live ? <View style={styles.predictionSignalSpacer} /> : null}<Text style={[styles.predictionTime, { color: predictionColor }]}>{timing.value}</Text>{prediction.live ? <LiveSignal color={predictionColor} style={styles.predictionSignal} /> : null}</View>
                        <Text style={[styles.predictionUnit, { color: predictionColor }]}>{timing.unit}</Text>
                        {!prediction.live ? <Text style={styles.predictionSource} testID="route-prediction-scheduled">SCHEDULED</Text> : null}
                      </PressableScale>
                    );
                  })
                )}
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

      {fare?.kind === 'flat' ? (
        <View accessibilityLabel={`Fare ${fare.amount}`} accessible={true} style={styles.alertButton} testID="route-fare">
          <Icon color={colors.mutedInk} filled={true} name="fare" size={18} style={styles.alertIcon} />
          <Text style={styles.alertText}>Fare</Text>
          <Text style={styles.fareValue}>{fare.amount}</Text>
        </View>
      ) : null}
      {fare?.kind === 'peakOffPeak' ? (
        <View
          accessibilityLabel={`Fare: ${fare.isPeakNow ? 'peak' : 'off-peak'} fare applies right now. Peak ${fare.peak}, off-peak ${fare.offPeak}.`}
          accessible={true}
          style={styles.alertButton}
          testID="route-fare"
        >
          <Icon color={colors.mutedInk} filled={true} name="fare" size={18} style={styles.alertIcon} />
          <Text style={styles.alertText}>Fare</Text>
          <View style={styles.fareTiers}>
            <Text style={[styles.fareTier, fare.isPeakNow && { color: routeText, fontFamily: fontFamilies.extraBold }]}>Peak {fare.peak}</Text>
            <Text style={[styles.fareTier, !fare.isPeakNow && { color: routeText, fontFamily: fontFamilies.extraBold }]}>Off-Peak {fare.offPeak}</Text>
          </View>
        </View>
      ) : null}

      {/* Only routes with an advisory get an alert row; "No delays" needs no dropdown. */}
      {hasDelay ? (
        <>
          <PressableScale accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => {
            ease();
            setAlertsOpen((value) => !value);
          }} style={styles.alertButton} testID="service-alerts">
            <Icon color={colors.warning} filled={true} name="alert" size={18} style={styles.alertIcon} /><Text style={styles.alertText}>Service alerts</Text><Text style={[styles.alertStatus, { color: colors.warning }]}>Advisory</Text><Icon color={colors.mutedInk} name={alertsOpen ? 'collapse' : 'expand'} size={18} style={styles.chevron} />
          </PressableScale>
          {alertsOpen ? <Text style={styles.alertBody}>{route.alert}</Text> : null}
        </>
      ) : null}

      <View style={styles.timelineHeading}><Text style={styles.timelineTitle}>Route stops</Text><View style={styles.onTimeChip}><View style={styles.onTimeDot} /><Text style={styles.onTimeText}>On time</Text></View></View>
      <View accessibilityLabel="Stops for the next departure">
        {liveStopsResult.status !== 'ready' ? (
          <View accessible={true} style={styles.predictionsEmpty} testID="route-stops-empty">
            {liveStopsResult.status === 'loading' ? <ActivityIndicator color={route.color} style={styles.predictionsEmptySpinner} /> : null}
            <Text style={styles.predictionsEmptyText}>{liveStopsResult.status === 'loading' ? `Loading stops for ${route.routeName}…` : 'Stop times unavailable right now.'}</Text>
          </View>
        ) : (
          (() => {
            const { stops: liveStops } = liveStopsResult;
            // The stop actually nearest the rider's real GPS location right now — the exact
            // same value already shown as the station name on this route's home-screen card
            // (activeDirection.stopId/.stopName, set by applyRouteLive from
            // TransitLiveContext's nearestRouteStop lookup). Matched by id (real GTFS stop_id)
            // when available — a route's real geometry and its nearest-stop lookup both come
            // from the same backend GTFS data, so their ids always agree, unlike display names
            // which can be formatted differently between sources. Falls back to matching by
            // name, then to just highlighting the first stop worded as the original plain
            // "Departs" (no "nearest to you" claim), for the few routes with no real geometry
            // at all — so there's always exactly one highlight and the wording never claims a
            // match that isn't real.
            const nearestMatchIndex = liveStops.findIndex((stop) => (
              activeDirection.stopId ? stop.stopId === activeDirection.stopId : stop.name === activeDirection.stopName
            ));
            return liveStops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === liveStops.length - 1;
              const isNearestMatch = index === nearestMatchIndex;
              const isHighlighted = nearestMatchIndex >= 0 ? isNearestMatch : isFirst;
              const transfers = transfersFor(route, stop.name);
              const transferLabel = transfers.length > 0 ? `, transfers: ${transfers.map((transfer) => transfer.name).join(', ')}` : '';
              // Rows show only the stop name and time (plus transfers); "nearest to you" and
              // departs/arrives stay in the accessibility label.
              return (
                <View key={stop.stopId ?? stop.name} accessibilityLabel={`${stop.name}, ${isNearestMatch ? 'nearest to you, ' : ''}${isFirst ? 'departs' : 'arrives'} ${stop.time}${transferLabel}`} accessible={true} style={styles.stopRow}>
                  <View style={styles.timelineRail}>{!isFirst ? <View style={[styles.rail, styles.railTop, { backgroundColor: route.color }]} /> : null}<View style={[styles.stopDot, { borderColor: route.color }, isHighlighted && { backgroundColor: route.color }]} />{!isLast ? <View style={[styles.rail, styles.railBottom, { backgroundColor: route.color }]} /> : null}</View>
                  {/* One divider spans the name and the time, not just the name. */}
                  <View style={styles.stopBody} testID={`stop-row-body-${stop.name}`}>
                    <View style={styles.stopCopy}><Text style={styles.stopName}>{stop.name}</Text>{transfers.length > 0 ? <TransferChips stopName={stop.name} transfers={transfers} /> : null}</View>
                    <Text style={styles.stopTime}>{stop.time}</Text>
                  </View>
                </View>
              );
            });
          })()
        )}
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
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.surface,
  },
  mapFallbackText: {
    color: colors.mutedInk,
    ...typography.metadata,
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
  predictionsEmpty: {
    minHeight: 112,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
  },
  predictionsEmptySpinner: {
    marginRight: 2,
  },
  predictionsEmptyText: {
    flexShrink: 1,
    color: colors.mutedInk,
    textAlign: 'center',
    ...typography.metadata,
  },
  // Bottom padding on every tile (live too) reserves room for the Scheduled pill without
  // shifting numbers, so live and scheduled tiles stay aligned.
  prediction: {
    minWidth: 0,
    minHeight: 126,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 22,
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
  // Filled pill so timetable tiles read clearly on both plain and route-colored tiles.
  predictionSource: {
    position: 'absolute',
    bottom: 11,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.mutedInk,
    color: colors.surface,
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
  fareValue: {
    color: colors.ink,
    ...typography.bodyStrong,
  },
  fareTiers: {
    flexDirection: 'row',
    gap: 12,
  },
  fareTier: {
    color: colors.mutedInk,
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
  stopBody: {
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stopCopy: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
  },
  transfers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  transferChip: {
    minWidth: 22,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 5,
  },
  // Subway bullets are round, as on MTA signage.
  subwayChip: {
    width: 20,
    minWidth: 20,
    paddingHorizontal: 0,
    borderRadius: 10,
  },
  transferText: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 10,
  },
  transferMore: {
    marginLeft: 2,
    color: colors.mutedInk,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
  },
  stopName: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
  },
  stopTime: {
    paddingLeft: 10,
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
  },
});

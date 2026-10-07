import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTransitLive } from '../data/TransitLiveContext';
import { fetchRouteGeometry, type RouteGeometry } from '../data/routeGeometry';
import { STATION_TRANSFERS, type StationTransfer, type TransferMode } from '../data/stationTransfers';
import { departureDisplay, directionDestination, formatClockTime, scheduleStopsFromNow, stopsForDirection, type RouteDetail, type RoutePrediction } from '../data/transit';
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
import { badgeLabel, RouteBadge, transitModeForAgency } from './RouteBadge';
import { PressableScale } from './PressableScale';

type RouteDetailViewProps = {
  /** Direction to open on (by `directions` index), e.g. when returning from the departures page. */
  initialDirectionIndex?: number;
  isFavorite: boolean;
  /** Rider's location for the live map; `locationKnown` is false while it's only the fallback. */
  location?: Coordinates;
  locationKnown?: boolean;
  onBack: () => void;
  /** Opens the full departures list for a direction (by `directions` index). */
  onOpenDepartures?: (directionIndex: number) => void;
  onRefreshLocation?: () => void;
  onToggleFavorite: () => void;
  route: RouteDetail;
};

export function predictionsForDirection(route: RouteDetail, directionIndex: number): readonly RoutePrediction[] {
  if (directionIndex === 0) return route.predictions;
  if (route.reversePredictions) return route.reversePredictions;
  const direction = route.directions[directionIndex] ?? route.directions[0];
  return [
    { minutes: direction.minutes, live: direction.live },
    { minutes: direction.minutes + 14, live: false },
    { minutes: direction.minutes + 30, live: true },
  ];
}


/** A prediction tile's big value and small unit label (see departureDisplay). */
function predictionTiming(prediction: RoutePrediction): { accessibility: string; unit: string; value: string } {
  return departureDisplay(prediction.minutes);
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
/** Departure tiles before the "More departures" card. */
const MAX_PREDICTION_TILES = 6;
const TILE_GAP = 8;
/** Tiles visible across the row; the half tile peeking in shows the row scrolls. */
const VISIBLE_TILES = 3.5;
const MAX_TILE_WIDTH = 96;
/** Room beside the heading for the two direction dots. */
const DIRECTION_DOTS_WIDTH = 30;
/** Just below the 46 pt back button, which sits 8 pt below the safe area. */
const MAP_BADGE_TOP = 62;
const isWeb = Platform.OS === 'web';

/**
 * Transfers are generated for the Port Jefferson Branch's stations only
 * (scripts/generate_station_transfers.py), keyed by station name.
 */
function transfersFor(route: RouteDetail, stopName: string): readonly StationTransfer[] {
  if (route.liveSource?.agencyId !== 'lirr' || route.liveSource.routeId !== '10') return [];
  // Only connections to a different agency or mode: on an LIRR route, other LIRR branches at the
  // same station aren't a meaningful "transfer" to call out.
  const own = OWN_TRANSFER_KIND[route.liveSource.agencyId];
  return (STATION_TRANSFERS[stopName] ?? []).filter((transfer) => transfer.agency !== own.agency || transfer.mode !== own.mode);
}

/** How each live agency's own lines are labeled in the transfers data, to leave them out. */
const OWN_TRANSFER_KIND: Record<NonNullable<RouteDetail['liveSource']>['agencyId'], Pick<StationTransfer, 'agency' | 'mode'>> = {
  lirr: { agency: 'LIRR', mode: 'rail' },
  subway: { agency: 'NYC Subway', mode: 'subway' },
  nice: { agency: 'NICE Bus', mode: 'bus' },
  suffolk: { agency: 'Suffolk County Transit', mode: 'bus' },
};

/** One connecting line, in its agency's color; subway bullets are round. */
function TransferChip({ testID, transfer }: { testID: string; transfer: StationTransfer }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View
      style={[styles.transferChip, transfer.mode === 'subway' && styles.subwayChip, { backgroundColor: transfer.color ?? colors.surfaceMuted }]}
      testID={testID}
    >
      <Text numberOfLines={1} style={[styles.transferText, { color: transfer.color ? transfer.textColor ?? colors.white : colors.ink }]}>{transfer.name}</Text>
    </View>
  );
}

/** Connecting lines at a station: rail, then subway (circles), then bus. `+N` opens the full list. */
function TransferChips({ onShowAll, stopName, transfers }: { onShowAll: () => void; stopName: string; transfers: readonly StationTransfer[] }) {
  const styles = useThemedStyles(createStyles);
  const shown = transfers.slice(0, MAX_TRANSFER_CHIPS);
  const hidden = transfers.length - shown.length;
  return (
    <View style={styles.transfers} testID={`stop-transfers-${stopName}`}>
      {shown.map((transfer) => (
        <TransferChip key={`${transfer.agency}-${transfer.name}`} testID={`route-transfer-${stopName}-${transfer.name}`} transfer={transfer} />
      ))}
      {hidden > 0 ? (
        <PressableScale
          accessibilityLabel={`Show all ${transfers.length} transfers at ${stopName}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onShowAll}
          style={styles.transferMoreButton}
          testID={`stop-transfers-more-${stopName}`}
        >
          <Text style={styles.transferMore}>+{hidden}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const TRANSFER_MODE_HEADINGS: readonly { mode: TransferMode; title: string }[] = [
  { mode: 'rail', title: 'Rail' },
  { mode: 'subway', title: 'Subway' },
  { mode: 'bus', title: 'Bus' },
];

/** Every transfer at one station, grouped by mode — opened from a row's `+N`. */
function TransfersSheet({ onClose, sheet }: { onClose: () => void; sheet: { stopName: string; transfers: readonly StationTransfer[] } | null }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={true} visible={sheet != null}>
      <Pressable accessibilityLabel="Close transfers" onPress={onClose} style={styles.sheetBackdrop} testID="transfers-sheet-backdrop" />
      {sheet ? (
        <View style={styles.transfersSheet} testID="transfers-sheet">
          <View style={styles.transfersSheetHeader}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.transfersSheetTitle} testID="transfers-sheet-title">{sheet.stopName}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="transfers-sheet-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <ScrollView contentContainerStyle={styles.transfersSheetContent}>
            {TRANSFER_MODE_HEADINGS.map(({ mode, title }) => {
              const ofMode = sheet.transfers.filter((transfer) => transfer.mode === mode);
              if (ofMode.length === 0) return null;
              return (
                <View key={mode} testID={`transfers-sheet-${mode}`}>
                  <Text style={styles.transfersSheetHeading}>{title}</Text>
                  <View style={styles.transfers}>
                    {ofMode.map((transfer) => (
                      <TransferChip key={`${transfer.agency}-${transfer.name}`} testID={`transfers-sheet-chip-${transfer.name}`} transfer={transfer} />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

export function RouteDetailView({ initialDirectionIndex, isFavorite, location, locationKnown = false, onBack, onOpenDepartures, onRefreshLocation, onToggleFavorite, route }: RouteDetailViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  // Route colors stay exact on fills; text and icons are lightened in dark mode to stay readable.
  const routeText = isDark ? readableColor(route.color, colors.surface) : route.color;
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [transfersSheet, setTransfersSheet] = useState<{ stopName: string; transfers: readonly StationTransfer[] } | null>(null);
  const ease = useLayoutEase();
  const liveStatus = useTransitLive(route.id);
  const vehicles = liveStatus.status === 'loaded' ? liveStatus.data.vehicles : [];
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  // Bumped on each location-button press; the live map re-centers on the rider whenever it changes.
  const [centerOnUserRequest, setCenterOnUserRequest] = useState(0);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(initialDirectionIndex ?? 0);
  const mapHeight = Math.max(280, Math.min(390, height * 0.58));
  const pageWidth = Math.min(width, 540) - 36;
  // Tall, narrow fixed-width tiles: about three and a half across on a phone (so a lone
  // departure never fills the row), capped so wider screens show more tiles rather than squares.
  const tileWidth = Math.min((pageWidth - 3 * TILE_GAP) / VISIBLE_TILES, MAX_TILE_WIDTH);
  // The heading pages beside the direction dots.
  const headingWidth = pageWidth - DIRECTION_DOTS_WIDTH;

  const updateDirection = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveDirectionIndex(Math.round(event.nativeEvent.contentOffset.x / headingWidth));
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
  // A caller-chosen direction counts as already selected, so it isn't overridden.
  const [hasAutoSelectedDirection, setHasAutoSelectedDirection] = useState(initialDirectionIndex !== undefined);
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
    directionScrollRef.current?.scrollTo({ x: activeDirectionIndex * headingWidth, animated: false });
  }, [activeDirectionIndex, headingWidth]);

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

  // The departure tiles scroll on their own. Native and web touch/trackpad scroll the ScrollView
  // directly; a web mouse drag is turned into a scroll here, while a plain click still taps.
  const tilesScrollRef = useRef<ScrollView>(null);
  const tilesScrollX = useRef(0);
  const tilesDragStartX = useRef<number | null>(null);
  const handleTilesPressIn = (event: GestureResponderEvent) => {
    tilesDragStartX.current = event.nativeEvent.pageX;
  };
  const handleTilesPressOut = (event: GestureResponderEvent, onTap: () => void) => {
    const startX = tilesDragStartX.current;
    tilesDragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    if (Math.abs(dx) <= DIRECTION_SWIPE_THRESHOLD) {
      onTap();
      return;
    }
    tilesScrollRef.current?.scrollTo({ x: Math.max(0, tilesScrollX.current - dx), animated: true });
  };
  // Each direction's departures start from its soonest one.
  useEffect(() => {
    tilesScrollX.current = 0;
    tilesScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [activeDirectionIndex]);

  const activeDirection = route.directions[activeDirectionIndex] ?? route.directions[0];
  const activeDestination = directionDestination(activeDirection.direction);

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

  // Compact (short code only) and tucked under the back button, clear of the map's center and the
  // rider's stop that the camera opens on.
  const mapBadge = (
    <RouteBadge
      agency={route.agency}
      color={route.color}
      shortName={badgeLabel(route)}
      size="medium"
      style={[styles.mapRouteBadge, { top: insets.top + MAP_BADGE_TOP }]}
      testID="route-detail-badge"
      withModeIcon={true}
    />
  );

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
      {mapBadge}
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
        // The agency's real track/street shape for this direction, served with the stop list.
        path={geometryStatus.geometry.path}
        stops={geometryStatus.geometry.stops}
        userLocation={locationKnown ? location : undefined}
        vehicles={vehicles}
      />
      {/* Overlay that ignores touches, so the badge never blocks panning the live map under it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {mapBadge}
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
        <PressableScale accessibilityLabel={isFavorite ? 'Remove route from saved' : 'Save route'} accessibilityRole="button" accessibilityState={{ selected: isFavorite }} onPress={onToggleFavorite} style={[styles.iconButton, isFavorite && styles.selectedButton]} testID="route-favorite"><Icon color={isFavorite ? colors.warning : colors.primary} filled={isFavorite} name="favorite" /></PressableScale>
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
      {/* The destination heading is the direction control: swipe it for the other direction. Its
          page dots sit beside it. */}
      <View style={styles.headingRow}>
        {Platform.OS === 'web' ? (
          <PressableScale
            accessibilityHint="Swipe horizontally for the other direction."
            accessible={false}
            onPressIn={handleDirectionPressIn}
            onPressOut={handleDirectionPressOut}
            style={[styles.titleRow, { width: headingWidth }]}
            testID={`route-direction-${activeDirectionIndex}`}
          >
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title} testID="route-detail-destination">{activeDestination}</Text>
          </PressableScale>
        ) : (
          <ScrollView ref={directionScrollRef} accessibilityHint="Swipe horizontally for the other direction." decelerationRate="fast" horizontal={true} onMomentumScrollEnd={updateDirection} onScroll={updateDirection} pagingEnabled={true} scrollEventThrottle={16} showsHorizontalScrollIndicator={false} style={styles.directionPager} testID="route-direction-pager">
            {route.directions.map((direction, directionIndex) => (
              <View key={direction.direction} style={[styles.titleRow, { width: headingWidth }]} testID={`route-direction-${directionIndex}`}>
                <Text
                  accessibilityRole={directionIndex === activeDirectionIndex ? 'header' : undefined}
                  numberOfLines={2}
                  style={styles.title}
                  testID={directionIndex === activeDirectionIndex ? 'route-detail-destination' : undefined}
                >
                  {directionDestination(direction.direction)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={[styles.pageDots, { width: DIRECTION_DOTS_WIDTH }]}>
          {route.directions.map((direction, index) => (
            <PressableScale
              key={direction.direction}
              accessibilityLabel={`Show ${directionDestination(direction.direction)} predictions`}
              accessibilityRole="button"
              accessibilityState={{ selected: index === activeDirectionIndex }}
              hitSlop={8}
              onPress={() => setActiveDirectionIndex(index)}
            >
              <View style={[styles.pageDot, index === activeDirectionIndex && { backgroundColor: route.color }]} />
            </PressableScale>
          ))}
        </View>
      </View>

      {/* The active direction's departures: their own horizontal scroll, separate from the direction swipe. */}
      {activePredictions.length === 0 ? (
        <View style={styles.predictions}>
          <View accessible={true} style={styles.predictionsEmpty} testID="route-predictions-empty">
            {route.liveStatus === 'loading' ? <ActivityIndicator color={route.color} style={styles.predictionsEmptySpinner} /> : null}
            <Text style={styles.predictionsEmptyText}>{predictionsEmptyMessage(route)}</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={tilesScrollRef}
          contentContainerStyle={styles.predictions}
          decelerationRate="fast"
          horizontal={true}
          onScroll={(event) => {
            tilesScrollX.current = event.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={tileWidth + TILE_GAP}
          style={styles.tilesScroll}
          testID="route-predictions-scroll"
        >
          {activePredictions.slice(0, MAX_PREDICTION_TILES).map((prediction, index) => {
            const highlighted = index === selectedPredictionIndex;
            const predictionColor = highlighted ? colors.white : routeText;
            const timing = predictionTiming(prediction);
            const isClockTime = timing.value.includes(':');
            const selectTile = () => setSelectedPredictionIndex(index);
            return (
              <PressableScale
                key={`${activeDirectionIndex}-${index}`}
                accessibilityHint="Shows this trip's stop times below."
                accessibilityLabel={`${timing.accessibility}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`}
                accessibilityRole="button"
                accessibilityState={{ selected: highlighted }}
                onPress={isWeb ? undefined : selectTile}
                onPressIn={isWeb ? handleTilesPressIn : undefined}
                onPressOut={isWeb ? (event) => handleTilesPressOut(event, selectTile) : undefined}
                style={[styles.prediction, { borderColor: route.color, width: tileWidth }, highlighted && { backgroundColor: route.color }, !prediction.live && styles.scheduled]}
                testID={`route-prediction-${activeDirectionIndex}-${index}`}
              >
                {/* Minutes get the big number; a clock time ("12:04") is longer, so it's a size down and
                    drops the centering spacer to fit the narrow tile. */}
                <View style={styles.predictionRow}>{prediction.live && !isClockTime ? <View style={styles.predictionSignalSpacer} /> : null}<Text numberOfLines={1} style={[styles.predictionTime, isClockTime && styles.predictionClockTime, { color: predictionColor }]}>{timing.value}</Text>{prediction.live ? <LiveSignal color={predictionColor} style={styles.predictionSignal} /> : null}</View>
                <Text style={[styles.predictionUnit, { color: predictionColor }]}>{timing.unit}</Text>
                {!prediction.live ? <Text style={styles.predictionSource} testID="route-prediction-scheduled">SCHEDULED</Text> : null}
              </PressableScale>
            );
          })}
          <PressableScale
            accessibilityHint={`Lists every upcoming departure toward ${activeDestination}.`}
            accessibilityLabel="More departures"
            accessibilityRole="button"
            onPress={isWeb ? undefined : () => onOpenDepartures?.(activeDirectionIndex)}
            onPressIn={isWeb ? handleTilesPressIn : undefined}
            onPressOut={isWeb ? (event) => handleTilesPressOut(event, () => onOpenDepartures?.(activeDirectionIndex)) : undefined}
            style={[styles.prediction, styles.moreCard, { borderColor: route.color, width: tileWidth }]}
            testID="route-more-departures"
          >
            <Icon color={routeText} name="time" size={24} />
            <Text style={[styles.moreText, { color: routeText }]}>More departures</Text>
          </PressableScale>
        </ScrollView>
      )}

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
                    <View style={styles.stopCopy}><Text style={styles.stopName}>{stop.name}</Text>{transfers.length > 0 ? <TransferChips onShowAll={() => setTransfersSheet({ stopName: stop.name, transfers })} stopName={stop.name} transfers={transfers} /> : null}</View>
                    <Text style={styles.stopTime}>{stop.time}</Text>
                  </View>
                </View>
              );
            });
          })()
        )}
      </View>
      <TransfersSheet onClose={() => setTransfersSheet(null)} sheet={transfersSheet} />
    </DetailMapPage>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  mapRouteBadge: {
    position: 'absolute',
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
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleRow: {
    minHeight: 34,
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
  tilesScroll: {
    flexGrow: 0,
  },
  predictions: {
    flexDirection: 'row',
    gap: TILE_GAP,
    paddingTop: 8,
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
    minHeight: 136,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
    borderWidth: 3,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  moreCard: {
    gap: 6,
    paddingBottom: 0,
    paddingHorizontal: 8,
  },
  moreText: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
    textAlign: 'center',
  },
  // Timetable (not GPS-tracked) departures read clearly fainter than live ones.
  scheduled: {
    opacity: 0.45,
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
    marginTop: 8,
  },
  // Big and obvious: tiles are narrow and tall so the number dominates.
  predictionTime: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 44,
    lineHeight: 50,
  },
  predictionClockTime: {
    fontSize: 27,
    lineHeight: 50,
  },
  predictionUnit: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
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
    justifyContent: 'flex-end',
    gap: 5,
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
  transferMoreButton: {
    justifyContent: 'center',
    minHeight: 20,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  transfersSheet: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '70%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
  },
  transfersSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transfersSheetTitle: {
    flex: 1,
    color: colors.ink,
    ...typography.screenHeading,
    fontSize: 21,
  },
  transfersSheetContent: {
    gap: 14,
    paddingTop: 6,
  },
  transfersSheetHeading: {
    color: colors.mutedInk,
    ...typography.label,
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

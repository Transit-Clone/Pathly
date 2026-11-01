import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDebug } from '../debug/DebugContext';
import { useTransitLive } from '../data/TransitLiveContext';
import { fetchRouteGeometry, fetchRouteTransfers, type LineTransfer, type RouteGeometry } from '../data/routeGeometry';
import { STATION_TRANSFERS, type StationTransfer, type TransferMode } from '../data/stationTransfers';
import { departureDisplay, differentEndStop, directionDestination, preferredDirectionIndex, formatClockTime, scheduleStopsFromNow, stopsForDirection, type RouteDetail, type RoutePrediction } from '../data/transit';
import { routeNotices, type RouteNotice } from '../data/routeNotices';
import type { RideFix } from '../data/rideDetection';
import { useRideTracking, type RideTracking } from '../data/rideTracking';
import { useServiceOutlook } from '../data/serviceOutlook';
import { focusStopIndex, withAlpha } from '../data/routeDirection';
import { useWalkingPath, walkingMinutes } from '../data/walkingPath';
import { useAccessibleStops } from '../data/accessibleStops';
import { useUserPreferences } from '../data/userPreferences';
import { transferColor, useRouteColor } from '../data/routeColors';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useViewportSize } from '../hooks/useViewportSize';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { contrastRatio, readableColor } from '../theme/contrast';
import { fontFamilies, typography } from '../theme/typography';
import { DetailMapPage } from './DetailMapPage';
import { DirectionSwitch } from './DirectionSwitch';
import { FitText } from './FitText';
import { Icon } from './Icon';
import { LIVE_SIGNAL_WIDTH, LiveSignal } from './LiveSignal';
import { MapBackdrop } from './MapBackdrop';
import { MapLabelGlow } from './MapLabelGlow';
import { Mascot } from './Mascot';
import { VehicleSheet } from './VehicleSheet';
import { useOnBoardVehicle } from '../hooks/useTripRide';
import { RouteMap } from './RouteMap';
import { pointAlong, routeFocus, RouteLines, VehicleMarker, type MapLeg } from './RouteMapOverlay';
import { AgencyLogo } from './AgencyLogo';
import { badgeLabel, RouteBadge, transitModeForAgency } from './RouteBadge';
import { MapControlButton } from './MapControlButton';
import { mapPageMapHeight } from './mapSheetLayout';
import { PressableScale } from './PressableScale';
import { usesWebMouseDrag } from './webMouseDrag';
import { afterClick } from './afterClick';
import { webTouchInput } from './touchInput';
import { MapSkeleton, PredictionTilesSkeleton, StopListSkeleton } from './Skeleton';
import { radii } from '../theme/shape';

type RouteDetailViewProps = {
  /** Direction to open on (by `directions` index), e.g. when returning from the departures page. */
  initialDirectionIndex?: number;
  isFavorite: boolean;
  /** Rider's location for the live map; `locationKnown` is false while it's only the fallback. */
  location?: Coordinates;
  locationKnown?: boolean;
  /** The rider's GPS fix with its accuracy, for noticing they're on a vehicle; never the fallback. */
  locationFix?: RideFix | null;
  /** An active trip's ride tracking, on a ride right now: it carries on here rather than this page starting its own. */
  tripRide?: RideTracking;
  /** Whether this page is the line that ride is on: a vehicle on another line can't be claimed. */
  onTripLine?: boolean;
  onBack: () => void;
  /** Opens the full departures list for a direction (by `directions` index). */
  onOpenDepartures?: (directionIndex: number) => void;
  onRefreshLocation?: () => void;
  onToggleFavorite: () => void;
  /** A line's service alerts, starred or not: the bell under the star opens their setting; on when they're sent. */
  alerts?: { on: boolean; onOpen: () => void };
  /** Opens a transfer badge's line at the stop it was tapped on. */
  onOpenTransfer?: (transfer: LineTransfer, stop: TappedStop) => void;
  /** Opens this line at one of its stops (a stop on the map, or a stop row on the whole line). */
  onOpenStop?: (stop: TappedStop) => void;
  route: RouteDetail;
  /**
   * The whole line, not one stop's view of it (opened from search): a general overview that
   * ignores where the rider is. Every stop is listed without times or a highlighted stop, the map
   * frames the full route, and tapping a stop opens the line there.
   */
  wholeRoute?: boolean;
};

export type TappedStop = { name: string; stopId?: string; lat: number; lon: number; directionIndex: number };

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

type LiveStop = { name: string; time: string; stopId?: string; lat?: number; lon?: number };
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
  wholeRoute = false,
): LiveStopsResult {
  if (!route.liveSource) {
    return { status: 'ready', stops: scheduleStopsFromNow(stopsForDirection(route, activeDirectionIndex), nowMinutes, leadMinutes, activeDirection.stopName) };
  }
  if (geometryStatus.status !== 'loaded') return geometryStatus;

  // Starts at the rider's nearest stop (reached in `leadMinutes`) and runs to the end of the
  // line in this direction; stops behind the rider are dropped, unless the whole line is open.
  // Either way the times are the selected trip's, timed from that stop.
  const { stops } = geometryStatus.geometry;
  const anchorIndex = Math.max(0, focusStopIndex(stops, activeDirection.stopId, activeDirection.stopName));
  const anchor = nowMinutes + leadMinutes - (stops[anchorIndex]?.offsetMinutes ?? 0);
  return {
    status: 'ready',
    stops: stops.slice(wholeRoute ? 0 : anchorIndex).map((stop) => ({ name: stop.name, stopId: stop.stopId, lat: stop.lat, lon: stop.lon, time: formatClockTime(anchor + stop.offsetMinutes) })),
  };
}

// Badges are sign-sized (24 pt), so a row shows fewer before the rest fold into "+N".
const MAX_TRANSFER_CHIPS = 6;
/** Departure tiles before the "More departures" card. */
const MAX_PREDICTION_TILES = 6;
const TILE_GAP = 8;
/** Tiles visible across the row; the half tile peeking in shows the row scrolls. */
const VISIBLE_TILES = 3.5;
const MAX_TILE_WIDTH = 96;
/** Room beside the heading for the two direction dots. */
/** Just below the 46 pt back button, which sits 8 pt below the safe area. */
const MAP_BADGE_TOP = 62;
/** The bus name's line height over the map (its 44 pt type). */
const MAP_BUS_LABEL_HEIGHT = 52;
/** The subway sign's height over the map (RouteBadge's xlarge). */
const MAP_ROUTE_BADGE_HEIGHT = 58;
const isWeb = usesWebMouseDrag;

/**
 * Transfers are generated for the Port Jefferson Branch's stations only
 * (scripts/generate_station_transfers.py), keyed by station name.
 */
function transfersFor(route: RouteDetail, stop: LiveStop, live: Readonly<Record<string, readonly LineTransfer[]>> | null): readonly (StationTransfer | LineTransfer)[] {
  if (live) return stop.stopId ? live[stop.stopId] ?? [] : [];
  const stopName = stop.name;
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
  bx: { agency: 'MTA Bus', mode: 'bus' },
  bk: { agency: 'MTA Bus', mode: 'bus' },
  mn: { agency: 'MTA Bus', mode: 'bus' },
  qn: { agency: 'MTA Bus', mode: 'bus' },
  si: { agency: 'MTA Bus', mode: 'bus' },
  busco: { agency: 'MTA Bus', mode: 'bus' },
  nycferry: { agency: 'NYC Ferry', mode: 'ferry' },
  siferry: { agency: 'Staten Island Ferry', mode: 'ferry' },
};

const isLineTransfer = (transfer: StationTransfer | LineTransfer): transfer is LineTransfer => 'routeId' in transfer;

/** One connecting line, in its agency's color; subway bullets are round. Tapping one opens that line. */
function TransferChip({ onOpen, stopName, testID, transfer }: { onOpen?: (transfer: LineTransfer) => void; stopName: string; testID: string; transfer: StationTransfer | LineTransfer }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const tint = useRouteColor();
  const transferHue = transferColor(transfer);
  const color = transferHue ? tint(transferHue) : null;
  // Recolored buses are white-on-color, like every bus badge; rail keeps its own text color.
  const textColor = color && color !== transfer.color ? colors.white : transfer.textColor ?? colors.white;
  const chipStyle = [styles.transferChip, transfer.mode === 'subway' && styles.subwayChip, { backgroundColor: color ?? colors.surfaceMuted }];
  const labelColor = color ? textColor : colors.ink;
  // MTA-style signs: subway bullets and bus badges are text only; rail and ferries carry their mode's glyph.
  const label = (
    <>
      {transfer.mode === 'rail' || transfer.mode === 'ferry' ? <Icon color={labelColor} name={transfer.mode} size={13} /> : null}
      <Text numberOfLines={1} style={[styles.transferText, transfer.mode === 'subway' && styles.subwayText, { color: labelColor }]}>{transfer.name}</Text>
    </>
  );
  if (onOpen && isLineTransfer(transfer)) {
    return (
      <PressableScale
        accessibilityLabel={`Open ${transfer.agency} ${transfer.name} at ${stopName}`}
        accessibilityRole="button"
        hitSlop={4}
        onPress={() => onOpen(transfer)}
        style={chipStyle}
        testID={testID}
      >
        {label}
      </PressableScale>
    );
  }
  return <View style={chipStyle} testID={testID}>{label}</View>;
}

// Chip widths, from transferChip/subwayChip/transferText below, to fit one row without measuring each.
const CHIP_GAP = 5;
const MORE_CHIP_WIDTH = 36;
function transferChipWidth(transfer: StationTransfer | LineTransfer): number {
  if (transfer.mode === 'subway') return 24;
  const icon = transfer.mode === 'rail' || transfer.mode === 'ferry' ? 17 : 0;
  return Math.max(24, 16 + icon + transfer.name.length * 7.5);
}

/** How many chips fit on one row of `width`, leaving room for "+N" when some don't. */
export function transferChipsThatFit(transfers: readonly (StationTransfer | LineTransfer)[], width: number): number {
  let used = 0;
  for (let index = 0; index < transfers.length; index += 1) {
    used += (index > 0 ? CHIP_GAP : 0) + transferChipWidth(transfers[index]!);
    const room = index === transfers.length - 1 ? width : width - CHIP_GAP - MORE_CHIP_WIDTH;
    if (used > room) return index;
  }
  return transfers.length;
}

/**
 * Connecting lines at a station on one row: rail, then subway (circles), then bus; `+N` counts the
 * rest. The "+N" isn't a button of its own: the stop row around it already opens the full list (and
 * a button inside that row's button is invalid HTML on the web).
 */
function TransferChips({ onOpen, stopName, transfers }: { onOpen?: (transfer: LineTransfer) => void; stopName: string; transfers: readonly (StationTransfer | LineTransfer)[] }) {
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState<number | null>(null);
  const fits = width == null ? MAX_TRANSFER_CHIPS : transferChipsThatFit(transfers, width);
  const shown = transfers.slice(0, Math.max(1, Math.min(fits, MAX_TRANSFER_CHIPS)));
  const hidden = transfers.length - shown.length;
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.transfers} testID={`stop-transfers-${stopName}`}>
      {shown.map((transfer) => (
        <TransferChip key={`${transfer.agency}-${transfer.name}`} onOpen={onOpen} stopName={stopName} testID={`route-transfer-${stopName}-${transfer.name}`} transfer={transfer} />
      ))}
      {hidden > 0 ? (
        <View style={styles.transferMoreButton} testID={`stop-transfers-more-${stopName}`}>
          <Text style={styles.transferMore}>+{hidden}</Text>
        </View>
      ) : null}
    </View>
  );
}

const TRANSFER_MODE_HEADINGS: readonly { mode: TransferMode; title: string }[] = [
  { mode: 'rail', title: 'Rail' },
  { mode: 'subway', title: 'Subway' },
  { mode: 'bus', title: 'Bus' },
  { mode: 'ferry', title: 'Ferry' },
];

/** Every alert on the line, from the bottom: each with its label (yellow for a disruption now), headline and details. */
function AlertsSheet({ notices, onClose, title }: { notices: readonly RouteNotice[] | null; onClose: () => void; title: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={true} visible={notices != null}>
      <Pressable accessibilityLabel="Close alerts" onPress={onClose} style={styles.sheetBackdrop} testID="service-alerts-backdrop" />
      {notices ? (
        <View style={styles.transfersSheet} testID="service-alerts-list">
          <View style={styles.transfersSheetHeader}>
            <Text accessibilityRole="header" style={styles.transfersSheetTitle}>{title}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="service-alerts-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <ScrollView contentContainerStyle={styles.alertSheetContent}>
            {notices.map((notice, index) => (
              <View key={`${notice.kind}-${index}`} style={index > 0 ? styles.alertItemSpaced : undefined} testID={`service-alert-${index}`}>
                <View style={[styles.alertLabel, notice.warning ? styles.alertPillWarning : styles.alertPillNeutral]}>
                  <Icon color={notice.warning ? colors.onAlertYellow : colors.ink} name={notice.warning ? 'warning' : notice.kind === 'outlook' ? 'calendar' : 'info'} size={14} />
                  <Text style={[styles.alertLabelText, { color: notice.warning ? colors.onAlertYellow : colors.ink }]}>{notice.label}</Text>
                </View>
                <Text style={styles.alertTitle}>{notice.title}</Text>
                {notice.detail ? <Text style={styles.alertBody}>{notice.detail}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

/**
 * A stop's sheet, opened by tapping its row (or its `+N`): every line to change to there, grouped
 * by mode. Tapping a line opens its route view at this stop.
 */
function TransfersSheet({ onClose, onOpen, sheet }: {
  onClose: () => void;
  onOpen?: (transfer: LineTransfer) => void;
  sheet: { stopName: string; transfers: readonly (StationTransfer | LineTransfer)[] } | null;
}) {
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
                      <TransferChip key={`${transfer.agency}-${transfer.name}`} onOpen={onOpen} stopName={sheet.stopName} testID={`transfers-sheet-chip-${transfer.name}`} transfer={transfer} />
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

export function RouteDetailView({ alerts, initialDirectionIndex, isFavorite, location, locationFix = null, locationKnown = false, onBack, onOpenDepartures, onOpenStop, onOpenTransfer, onRefreshLocation, onToggleFavorite, onTripLine = false, route, tripRide, wholeRoute = false }: RouteDetailViewProps) {
  const routeColor = useRouteColor()(route.color);
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  // Route colors stay exact on fills, and on text and icons too wherever they read (3:1 suits these
  // large, bold labels); only a line too dark for the dark sheet is lightened.
  const routeText = isDark ? readableColor(routeColor, colors.surface, 3) : routeColor;
  // Saved, the star is a white star on the route's color (dark on pale lines like the N/Q/R/W).
  const favoriteTint = { color: routeColor, onColor: contrastRatio(colors.white, routeColor) >= 2.2 ? colors.white : '#1A1A1A' };
  // Departure tiles: filled with the route color, lightly (solid for the one picked), no outline.
  const tileFill = withAlpha(routeColor, isDark ? 0.28 : 0.16);
  const { height, width } = useViewportSize();
  const insets = useSafeAreaInsets();
  const [openSheet, setOpenSheet] = useState<'alerts' | 'outlook' | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [transfersSheet, setTransfersSheet] = useState<{ stop: LiveStop; transfers: readonly (StationTransfer | LineTransfer)[] } | null>(null);
  const liveStatus = useTransitLive(route.id);
  const debug = useDebug();
  const vehicles = liveStatus.status === 'loaded' ? liveStatus.data.vehicles : [];
  const ownRide = useRideTracking(tripRide ? undefined : route.liveSource, vehicles, locationFix);
  const ride = tripRide ?? ownRide;
  const onBoardTripId = useOnBoardVehicle(vehicles, locationFix);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.tripId === selectedVehicleId) ?? null;
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  // Bumped on each location-button press; the live map re-centers on the rider whenever it changes.
  const [centerOnUserRequest, setCenterOnUserRequest] = useState(0);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(initialDirectionIndex ?? 0);
  const mapHeight = mapPageMapHeight(height);
  const pageWidth = Math.min(width, 540) - 36;
  // Tall, narrow fixed-width tiles: about three and a half across on a phone (so a lone
  // departure never fills the row), capped so wider screens show more tiles rather than squares.
  const tileWidth = Math.min((pageWidth - 3 * TILE_GAP) / VISIBLE_TILES, MAX_TILE_WIDTH);

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
  // The exception is a rider clearly at one end of the line (a ferry terminal, the 1 at South
  // Ferry): the direction that's nearly over is never the one they want, however soon it goes.
  if (!hasAutoSelectedDirection) {
    const [first, second] = route.directions;
    const preferred = preferredDirectionIndex(route.directions);
    if (preferred !== null) {
      setHasAutoSelectedDirection(true);
      setActiveDirectionIndex(preferred);
    } else if (first.live && second.live && !first.unavailable && !second.unavailable) {
      setHasAutoSelectedDirection(true);
      if (second.minutes < first.minutes) setActiveDirectionIndex(1);
    }
  }

  const DIRECTION_SWIPE_THRESHOLD = 24;

  // The departure tiles scroll on their own. Native and web touch/trackpad scroll the ScrollView
  // directly; a web mouse drag is turned into a scroll here, while a plain click still taps.
  const tilesScrollRef = useRef<ScrollViewInstance>(null);
  const tilesScrollX = useRef(0);
  const tilesDragStartX = useRef<number | null>(null);
  const tilesDragStartY = useRef(0);
  const handleTilesPressIn = (event: GestureResponderEvent) => {
    tilesDragStartX.current = event.nativeEvent.pageX;
    tilesDragStartY.current = event.nativeEvent.pageY;
  };
  const handleTilesPressOut = (event: GestureResponderEvent, onTap: () => void) => {
    const startX = tilesDragStartX.current;
    tilesDragStartX.current = null;
    if (startX == null) return;
    const dx = event.nativeEvent.pageX - startX;
    // A vertical drag scrolled the page; it isn't a tap on the tile under the finger.
    if (Math.abs(event.nativeEvent.pageY - tilesDragStartY.current) > DIRECTION_SWIPE_THRESHOLD) return;
    if (Math.abs(dx) <= DIRECTION_SWIPE_THRESHOLD) {
      afterClick(onTap);
      return;
    }
    if (webTouchInput) return;
    tilesScrollRef.current?.scrollTo({ x: Math.max(0, tilesScrollX.current - dx), animated: true });
  };
  // Each direction's departures start from its soonest one.
  useEffect(() => {
    tilesScrollX.current = 0;
    tilesScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [activeDirectionIndex]);

  const activeDirection = route.directions[activeDirectionIndex] ?? route.directions[0];
  const activeDestination = directionDestination(activeDirection.direction);
  // The walk from the rider to the stop shown, drawn dotted on the map.
  // Walked from where the rider was when the page opened: drawn once, not redrawn as they move.
  const [walkFrom, setWalkFrom] = useState<Coordinates | null>(null);
  if (locationKnown && location && !walkFrom) setWalkFrom(location);
  // The whole line has no stop of the rider's, so no walk to one.
  const walkPath = useWalkingPath(route.liveSource?.agencyId, activeDirection.stopId, wholeRoute ? undefined : walkFrom ?? undefined);
  // With Step-free routes on (Settings -> Accessibility), step-free stations get a small wheelchair beside their name.
  const { preferences } = useUserPreferences();
  const isAccessibleStop = useAccessibleStops(route.liveSource?.agencyId, preferences.stepFree);

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

  // Other lines at each stop, from every agency's data; arrives after the stop list. Null until then.
  const transfersKey = `${liveSourceAgencyId}:${liveSourceRouteId}:${geometryDirectionId}`;
  const [loadedTransfers, setLoadedTransfers] = useState<{ key: string; transfers: Readonly<Record<string, readonly LineTransfer[]>> } | null>(null);
  const lineTransfers = loadedTransfers?.key === transfersKey ? loadedTransfers.transfers : null;
  useEffect(() => {
    if (!route.liveSource || geometryDirectionId === undefined) return undefined;
    let cancelled = false;
    void fetchRouteTransfers(route.liveSource, geometryDirectionId).then((transfers) => {
      if (!cancelled && Object.keys(transfers).length > 0) setLoadedTransfers({ key: transfersKey, transfers });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable ids, as above
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
  const liveStopsResult = liveStopsFor(route, activeDirectionIndex, activeDirection, geometryStatus, nowMinutes, leadMinutes, wholeRoute);
  const tappedStop = (stop: LiveStop): TappedStop | null => (
    stop.lat != null && stop.lon != null ? { name: stop.name, stopId: stop.stopId, lat: stop.lat, lon: stop.lon, directionIndex: activeDirectionIndex } : null
  );
  const openTransfer = (stop: LiveStop) => (onOpenTransfer
    ? (transfer: LineTransfer) => {
      const at = tappedStop(stop);
      if (!at) return;
      setTransfersSheet(null);
      onOpenTransfer(transfer, at);
    }
    : undefined);

  const vehicleIcon = transitModeForAgency(route.agency);
  // Delays on the shown direction's tracked departures, then MTA alerts, under the time cards.
  // The whole line shows no departures, so only its alerts, not one stop's delays.
  const notices = routeNotices(route, wholeRoute ? [] : activePredictions, vehicleIcon);
  // Holidays and winter weather coming up, in a pill of their own beside any alert.
  const outlook = useServiceOutlook(now, route.liveSource);
  // The stop list follows the selected departure, so its chip says whether that one is late.

  // Only ever rendered below for a route with no `liveSource` — every entry in the static demo
  // catalog has real values here; a dynamically-discovered route always has a `liveSource`
  // instead (and so never reaches this branch), which is why these can be optional on
  // `RouteDetail` at all. The `?? []` fallbacks are therefore just to satisfy that optionality,
  // not a real fallback path.
  const illustrativeMapPath = route.mapPath ?? [];
  const routeLeg: MapLeg = {
    color: routeColor,
    path: illustrativeMapPath,
    stops: (route.mapStops ?? []).map((pathIndex, index) => ({ label: (route.mapLabels ?? [])[index] ?? '', point: illustrativeMapPath[pathIndex] ?? [0, 0] })),
  };

  // Compact (short code only) and tucked under the back button, clear of the map's center and the
  // rider's stop that the camera opens on.
  // Buses, trains and ferries are named in big type in their route color, over a soft glow from the
  // map's top-left corner so busy streets don't run through the name; subway lines keep their round sign.
  // The glow stays with the map; the name and logo ride the page with the other buttons.
  const mapGlow = vehicleIcon !== 'subway' ? <MapLabelGlow color={colors.surface} height={insets.top + MAP_BADGE_TOP + MAP_BUS_LABEL_HEIGHT + 320} width={300} /> : null;
  const mapBadge = vehicleIcon !== 'subway' ? (
    <>
      <View
        accessibilityLabel={`${badgeLabel(route)} ${vehicleIcon === 'rail' ? 'train' : vehicleIcon}`}
        accessible={true}
        style={[styles.mapBusLabel, { top: insets.top + MAP_BADGE_TOP }]}
        testID="route-detail-badge"
      >
        <Text numberOfLines={1} style={[styles.mapBusLabelText, { color: routeText }]}>{badgeLabel(route)}</Text>
      </View>
      <AgencyLogo agencyId={route.liveSource?.agencyId} style={[styles.mapAgencyLogo, { top: insets.top + MAP_BADGE_TOP + MAP_BUS_LABEL_HEIGHT + 2 }]} testID="route-detail-agency-logo" />
    </>
  ) : (
    <>
      <RouteBadge
        agency={route.agency}
        color={routeColor}
        shortName={badgeLabel(route)}
        size="xlarge"
        style={[styles.mapRouteBadge, { top: insets.top + MAP_BADGE_TOP }]}
        testID="route-detail-badge"
      />
      <AgencyLogo agencyId={route.liveSource?.agencyId} style={[styles.mapAgencyLogo, { top: insets.top + MAP_BADGE_TOP + MAP_ROUTE_BADGE_HEIGHT + 8 }]} testID="route-detail-agency-logo" />
    </>
  );

  // Routes with a `liveSource` get the real map (once its geometry has loaded); every other
  // route still uses the illustrative overlay, since it never had real geometry to fetch.
  // Only the real Google map pans and zooms (and can center on the rider); illustrated maps stay a static backdrop.
  const liveMap = !!route.liveSource && geometryStatus.status === 'loaded';
  // Locate, on the live map just above the sheet: where Home and Route Results keep it.
  const locateButton = (
    <MapControlButton accessibilityLabel="Show current location" icon="locate" onPress={() => {
      setIsLocationCentered(true);
      onRefreshLocation?.();
      setCenterOnUserRequest((count) => count + 1);
    }} selected={isLocationCentered} testID="route-location" />
  );

  const map = !route.liveSource ? (
    <>
      <MapBackdrop
        focus={routeFocus([illustrativeMapPath])}
        initialSize={{ width: Math.min(width, 540), height: mapHeight }}
        padding={{ top: 76, right: 64, bottom: 44, left: 16 }}
        renderMarkers={(projection) => (
          <VehicleMarker color={routeColor} minutes={activeDirection.minutes} mode={vehicleIcon} point={pointAlong(illustrativeMapPath, activeDirectionIndex === 0 ? 0.3 : 0.7)} projection={projection} />
        )}
        renderOverlay={({ scale }) => <RouteLines legs={[routeLeg]} scale={scale} />}
        showUserLocation={true}
      />
      {mapGlow}
    </>
  ) : geometryStatus.status === 'loaded' ? (
    <>
      <RouteMap
        centerOnUserRequest={centerOnUserRequest}
        color={routeColor}
        directionId={geometryDirectionId}
        focusStopId={wholeRoute ? undefined : activeDirection.stopId}
        focusStopName={wholeRoute ? undefined : activeDirection.stopName}
        mode={vehicleIcon}
        onOpenStop={onOpenStop ? (stop) => {
          if (stop.lat == null || stop.lon == null || (!wholeRoute && stop.stopId === activeDirection.stopId)) return;
          onOpenStop({ name: stop.name, stopId: stop.stopId, lat: stop.lat, lon: stop.lon, directionIndex: activeDirectionIndex });
        } : undefined}
        onUserPan={() => setIsLocationCentered(false)}
        onVehiclePress={setSelectedVehicleId}
        // The agency's real track/street shape for this direction, served with the stop list.
        path={geometryStatus.geometry.path}
        stops={geometryStatus.geometry.stops}
        userLocation={locationKnown ? location : undefined}
        vehicles={vehicles}
        walkPath={walkPath ?? undefined}
      />
      {/* Ignores touches, so the glow never blocks panning the live map under it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {mapGlow}
      </View>
    </>
  ) : geometryStatus.status === 'loading' ? (
    <MapSkeleton />
  ) : (
    <View style={styles.mapFallback} testID="route-map-fallback">
      <Mascot mood="worried" size={56} />
      <Text style={styles.mapFallbackText}>Map unavailable</Text>
    </View>
  );

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <MapControlButton accessibilityLabel="Back" icon="back" onPress={onBack} testID="route-back" />
      {/* Save and alerts; Locate sits low on the map, like Home and Route Results. */}
      <View style={styles.topActions}>
        <MapControlButton accessibilityLabel={isFavorite ? 'Remove route from saved' : 'Save route'} icon="favorite" onPress={onToggleFavorite} selected={isFavorite} testID="route-favorite" tint={favoriteTint} variant="save" />
        {alerts ? <MapControlButton accessibilityLabel={alerts.on ? 'Service alerts on' : 'Service alerts off'} icon="bell" onPress={alerts.onOpen} selected={alerts.on} testID="route-alerts" /> : null}
      </View>
    </View>
  );

  return (
    <DetailMapPage
      controlsScrollWithMap={true}
      interactiveMap={liveMap}
      contentStyle={styles.content}
      contentTestID="route-detail-content"
      controls={controls}
      handle={{ accessibilityHint: 'Expands or collapses the route details.', accessibilityLabel: 'Route details handle', testID: 'route-sheet-handle' }}
      map={map}
      mapButtons={liveMap ? locateButton : undefined}
      // Ignores touches, so the badge never blocks panning the live map under it.
      mapOverlay={!route.liveSource || liveMap ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{mapBadge}</View> : undefined}
      mapHeight={mapHeight}
      mapTestID="route-detail-map"
      scrollTestID="route-detail-scroll"
      showHeader={false}
      testID={`route-detail-${route.id}`}
    >
      <ThemedStatusBar />
      {/* The direction control: one wide oval, a destination on each side. A one-way line just
          names where it goes. */}
      <View style={styles.headingRow}>
        {route.directions.length > 1 ? (
          <DirectionSwitch
            activeIndex={activeDirectionIndex}
            color={routeColor}
            labels={[directionDestination(route.directions[0]!.direction), directionDestination(route.directions[1]!.direction)]}
            onChange={setActiveDirectionIndex}
          />
        ) : (
          <FitText accessibilityRole="header" style={styles.title} testID="route-detail-destination">{activeDestination}</FitText>
        )}
      </View>

      {debug.mockTime ? <Text style={styles.debugNote} testID="route-live-real-time">{"Live times are real-time; mock time doesn't apply to them."}</Text> : null}
      {debug.overlays.ids ? <Text selectable={true} style={styles.debugNote} testID="route-debug-ids">{route.liveSource ? `${route.liveSource.agencyId}:${route.liveSource.routeId}` : `route ${route.id}`}</Text> : null}

      {/* The active direction's departures: their own horizontal scroll, separate from the direction swipe. */}
      {wholeRoute ? null : activePredictions.length === 0 && route.liveStatus === 'loading' ? (
        <PredictionTilesSkeleton accessibilityLabel={predictionsEmptyMessage(route) ?? 'Loading departures'} gap={TILE_GAP} tileWidth={tileWidth} />
      ) : activePredictions.length === 0 ? (
        <View style={styles.predictions}>
          <View accessible={true} style={styles.predictionsEmpty} testID="route-predictions-empty">
            {route.liveStatus === 'error' ? <Mascot mood="worried" size={40} /> : null}
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
            const predictionColor = highlighted ? favoriteTint.onColor : routeText;
            const timing = predictionTiming(prediction);
            const isClockTime = timing.value.includes(':');
            const endStop = differentEndStop(prediction, activeDestination);
            const selectTile = () => setSelectedPredictionIndex(index);
            return (
              <PressableScale
                key={`${activeDirectionIndex}-${index}`}
                accessibilityHint="Shows this trip's stop times below."
                accessibilityLabel={`${timing.accessibility}, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}${endStop ? `, ends at ${endStop}` : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: highlighted }}
                onPress={isWeb ? undefined : selectTile}
                onPressIn={isWeb ? handleTilesPressIn : undefined}
                onPressOut={isWeb ? (event) => handleTilesPressOut(event, selectTile) : undefined}
                style={[styles.prediction, { backgroundColor: highlighted ? routeColor : tileFill, width: tileWidth }, !prediction.live && styles.scheduled]}
                testID={`route-prediction-${activeDirectionIndex}-${index}`}
              >
                {/* A trip that doesn't run the direction's usual way names its own end stop. */}
                {/* Written out in full (wrapping as needed), over a light rule that sets it apart from the time. */}
                {endStop ? (
                  <View style={[styles.predictionEndStopBox, highlighted && styles.predictionEndStopBoxHighlighted]}>
                    <Text style={[styles.predictionEndStop, { color: predictionColor }]} testID={`route-prediction-end-${activeDirectionIndex}-${index}`}>{`To ${endStop}`}</Text>
                  </View>
                ) : null}
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
            style={[styles.prediction, styles.moreCard, { backgroundColor: tileFill, width: tileWidth }]}
            testID="route-more-departures"
          >
            <Icon color={routeText} name="time" size={24} />
            <Text style={[styles.moreText, { color: routeText }]}>More departures</Text>
          </PressableScale>
        </ScrollView>
      )}

      {/* Only a route with a delay or an alert gets this pill. It names the most pressing one,
          yellow when service is disrupted now, and opens every alert in a sheet. */}
      {notices.length > 0 || outlook.length > 0 ? (
      <View style={styles.noticeRow}>
      {notices.length > 0 ? (
        <PressableScale
          accessibilityHint="Shows every alert for this line"
          accessibilityLabel={`${notices[0]!.label}${notices.length > 1 ? `, ${notices.length - 1} more` : ''}`}
          accessibilityRole="button"
          onPress={() => setOpenSheet('alerts')}
          style={[styles.alertPill, notices[0]!.warning ? styles.alertPillWarning : styles.alertPillNeutral]}
          testID="service-alerts"
        >
          <Icon color={notices[0]!.warning ? colors.onAlertYellow : colors.ink} name={notices[0]!.warning ? 'warning' : 'info'} size={20} />
          <Text numberOfLines={1} style={[styles.alertPillText, { color: notices[0]!.warning ? colors.onAlertYellow : colors.ink }]}>{notices[0]!.label}</Text>
          {notices.length > 1 ? <Text style={[styles.alertPillMore, { color: notices[0]!.warning ? colors.onAlertYellow : colors.mutedInk }]}>{`+${notices.length - 1} more`}</Text> : null}
          <Icon color={notices[0]!.warning ? colors.onAlertYellow : colors.mutedInk} name="forward" size={18} />
        </PressableScale>
      ) : null}
      {/* A holiday or snow coming up: the date alone beside an alert, which keeps most of the row. */}
      {outlook.length > 0 ? (
        <PressableScale
          accessibilityHint="Shows what may slow service soon"
          accessibilityLabel={`${outlook[0]!.label}${outlook.length > 1 ? `, ${outlook.length - 1} more` : ''}`}
          accessibilityRole="button"
          onPress={() => setOpenSheet('outlook')}
          style={[styles.alertPill, styles.alertPillNeutral, notices.length > 0 ? styles.outlookPillCompact : styles.outlookPillAlone]}
          testID="service-outlook"
        >
          <Icon color={colors.ink} name={outlook[0]!.icon} size={18} />
          <Text numberOfLines={1} style={[styles.outlookPillText, notices.length === 0 && styles.outlookPillTextAlone]}>{notices.length > 0 ? outlook[0]!.shortLabel : outlook[0]!.label}</Text>
        </PressableScale>
      ) : null}
      </View>
      ) : null}
      <AlertsSheet notices={openSheet === 'alerts' ? notices : openSheet === 'outlook' ? outlook : null} onClose={() => setOpenSheet(null)} title={openSheet === 'outlook' ? 'Coming up' : 'Service alerts'} />
      <VehicleSheet
        color={routeColor}
        destination={activeDestination}
        lineName={badgeLabel(route)}
        liveSource={route.liveSource}
        mode={vehicleIcon}
        onClaim={ride.claim}
        onClose={() => setSelectedVehicleId(null)}
        onBoardTripId={onBoardTripId}
        onDismiss={ride.dismiss}
        reportFix={locationFix}
        reportSource={route.liveSource}
        riderAt={locationFix && (!tripRide || onTripLine) ? { lat: locationFix.lat, lon: locationFix.lon } : null}
        ridingTripId={ride.ridingTripId}
        sharingEnabled={ride.sharingEnabled}
        stops={geometryStatus.status === 'loaded' ? geometryStatus.geometry.stops : []}
        vehicle={selectedVehicle}
      />

      <View accessibilityLabel={wholeRoute ? 'Stops' : 'Stops for the next departure'} style={styles.stopList}>
        {liveStopsResult.status === 'loading' ? (
          <StopListSkeleton color={routeColor} />
        ) : liveStopsResult.status !== 'ready' ? (
          <View accessible={true} style={styles.predictionsEmpty} testID="route-stops-empty">
            <Text style={styles.predictionsEmptyText}>Stop times unavailable right now.</Text>
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
            const nearestMatchIndex = wholeRoute ? -1 : focusStopIndex(liveStops, activeDirection.stopId, activeDirection.stopName);
            // The walk to the rider's stop, over the first stop when that's the one it leads to.
            const walkMinutes = nearestMatchIndex === 0 && walkPath ? walkingMinutes(walkPath) : null;
            // Just above the first stop's name, small: how long the walk there takes.
            const walkNote = walkMinutes != null ? (
              <View accessibilityLabel={`${walkMinutes} minute walk to ${liveStops[0]?.name ?? 'this stop'}`} accessible={true} style={styles.walkRow} testID="route-walk-time">
                <Icon color={colors.mutedInk} name="travel" size={12} />
                <Text style={styles.walkText}>{`${walkMinutes} min`}</Text>
              </View>
            ) : null;
            return liveStops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === liveStops.length - 1;
              const isNearestMatch = index === nearestMatchIndex;
              const isHighlighted = !wholeRoute && (nearestMatchIndex >= 0 ? isNearestMatch : isFirst);
              const transfers = transfersFor(route, stop, lineTransfers);
              // On the whole line a stop opens the line there; otherwise one with transfers lists them.
              const at = wholeRoute && onOpenStop ? tappedStop(stop) : null;
              const canOpen = at != null || transfers.length > 0;
              const transferLabel = transfers.length > 0 ? `, transfers: ${transfers.map((transfer) => transfer.name).join(', ')}` : '';
              // Rows show only the stop name and time (plus transfers); "nearest to you" and
              // departs/arrives stay in the accessibility label.
              return (
                <PressableScale
                  key={`${stop.stopId ?? stop.name}-${index}`}
                  accessibilityHint={at ? 'Opens departures from this stop' : canOpen ? 'Shows the lines to change to here' : undefined}
                  accessibilityLabel={wholeRoute
                    ? `${stop.name}${isAccessibleStop?.(stop.stopId) ? ', wheelchair accessible' : ''}${transferLabel}`
                    : `${stop.name}, ${isAccessibleStop?.(stop.stopId) ? 'wheelchair accessible, ' : ''}${isNearestMatch ? 'nearest to you, ' : ''}${isFirst ? 'departs' : 'arrives'} ${stop.time}${transferLabel}`}
                  accessibilityRole={canOpen ? 'button' : undefined}
                  disabled={!canOpen}
                  onPress={at ? () => onOpenStop?.(at) : canOpen ? () => setTransfersSheet({ stop, transfers }) : undefined}
                  pressedScale={0.99}
                  style={styles.stopRow}
                  testID={`stop-row-${index}`}
                >
                  <View style={styles.timelineRail}>{!isFirst ? <View style={[styles.rail, styles.railTop, { backgroundColor: routeColor }]} /> : null}<View style={[styles.stopDot, { borderColor: routeColor }, isHighlighted && { backgroundColor: routeColor }]} />{!isLast ? <View style={[styles.rail, styles.railBottom, { backgroundColor: routeColor }]} /> : null}</View>
                  {/* One divider spans the name and the time, not just the name. */}
                  <View style={styles.stopBody} testID={`stop-row-body-${stop.name}`}>
                    <View style={styles.stopCopy}>{isFirst ? walkNote : null}<View style={styles.stopNameRow}><Text style={styles.stopName}>{stop.name}</Text>{isAccessibleStop?.(stop.stopId) ? <View accessibilityLabel="Wheelchair accessible" accessible={true} style={styles.wheelchair} testID={`stop-accessible-${index}`}><Icon color={colors.white} name="wheelchair" size={12} /></View> : null}</View>{debug.overlays.ids && stop.stopId ? <Text selectable={true} style={styles.debugNote} testID={`stop-debug-id-${stop.stopId}`}>{`stop ${stop.stopId}`}</Text> : null}{transfers.length > 0 ? <TransferChips stopName={stop.name} transfers={transfers} /> : null}</View>
                    {wholeRoute ? null : <Text style={styles.stopTime}>{stop.time}</Text>}
                  </View>
                </PressableScale>
              );
            });
          })()
        )}
      </View>
      <TransfersSheet
        onClose={() => setTransfersSheet(null)}
        onOpen={transfersSheet ? openTransfer(transfersSheet.stop) : undefined}
        sheet={transfersSheet ? { stopName: transfersSheet.stop.name, transfers: transfersSheet.transfers } : null}
      />
    </DetailMapPage>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  debugNote: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
  mapRouteBadge: {
    position: 'absolute',
    left: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  // Bus routes name themselves in the route's color straight on the map, haloed so it reads over streets.
  // The agency's logo, smaller, under the route's name or sign.
  mapAgencyLogo: { position: 'absolute', left: 16 },
  mapBusLabel: {
    position: 'absolute',
    left: 16,
    justifyContent: 'center',
  },
  mapBusLabelText: {
    fontFamily: fontFamilies.black,
    fontSize: 44,
    letterSpacing: -0.5,
    textShadowColor: colors.surface,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
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
    gap: 10,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.ink,
    ...typography.screenHeading,
    fontSize: 23,
    lineHeight: 27,
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
    borderRadius: radii.card,
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
    borderRadius: radii.card,
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
  predictionEndStopBox: {
    alignSelf: 'stretch',
    marginTop: 10,
    marginHorizontal: 8,
    marginBottom: 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  predictionEndStopBoxHighlighted: {
    borderBottomColor: 'rgba(255, 255, 255, 0.45)',
  },
  predictionEndStop: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
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
  // The whole pill takes the alert's color: yellow for a disruption now, neutral otherwise.
  noticeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  alertPill: {
    minWidth: 0,
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  outlookPillCompact: {
    flex: 0,
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 12,
  },
  outlookPillAlone: {
    gap: 8,
  },
  outlookPillText: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
  },
  outlookPillTextAlone: {
    flex: 1,
  },
  alertPillWarning: {
    backgroundColor: colors.alertYellow,
  },
  alertPillNeutral: {
    backgroundColor: colors.surfaceMuted,
  },
  alertPillText: {
    flex: 1,
    ...typography.bodyStrong,
  },
  alertPillMore: {
    ...typography.metadata,
    fontFamily: fontFamilies.bold,
  },
  alertSheetContent: {
    paddingTop: 6,
  },
  alertLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  alertLabelText: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
  },
  alertItemSpaced: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  alertTitle: {
    marginTop: 8,
    color: colors.ink,
    ...typography.bodyStrong,
  },
  alertBody: {
    marginTop: 4,
    color: colors.mutedInk,
    ...typography.metadata,
  },
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 1,
  },
  walkText: {
    color: colors.mutedInk,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
  },
  stopList: {
    marginTop: 14,
  },
  stopRow: {
    minHeight: 64,
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
    overflow: 'hidden',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },
  // Sign-sized badges, like the MTA's: 24 pt tall, bold.
  transferChip: {
    minWidth: 24,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  // Subway bullets are round, as on MTA signage.
  subwayChip: {
    width: 24,
    minWidth: 24,
    paddingHorizontal: 0,
    borderRadius: 12,
  },
  transferText: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
  },
  subwayText: {
    fontSize: 13,
  },
  // "+N" as a soft pill the same height as the badges.
  transferMoreButton: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  transfersSheet: {
    width: '100%',
    maxWidth: 540,
    // As tall as every transfer needs; it scrolls only past nearly the full screen.
    maxHeight: '94%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 34,
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
    color: colors.mutedInk,
    fontFamily: fontFamilies.extraBold,
    fontSize: 12,
  },
  stopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  // The International Symbol of Access: white on blue, small.
  wheelchair: {
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#1F5FBF',
  },
  stopName: {
    color: colors.ink,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
  },
  stopTime: {
    paddingLeft: 10,
    color: colors.mutedInk,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
  },
});

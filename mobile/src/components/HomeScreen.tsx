import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { applyRouteLive } from '../data/applyRouteLive';
import { NEARBY_CACHE_KEY, readCache, writeCache } from '../data/deviceCache';
import { guidanceForNavigation, type TripEndpointReference } from '../data/enrouteNavigation';
import type { RecentTripV1 } from '../data/navigationStorage';
import { describeTransitLine, discoveredRouteToRouteDetail, fetchNearbyTransit, fetchRouteAtStop, filterOutPinnedDuplicates, type DiscoveredRoute } from '../data/nearbyTransit';
import type { IndexedLine } from '../data/lineIndex';
import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';
import type { LineTransfer } from '../data/routeGeometry';
import { removeSavedRoute, saveRoute, savedRouteFrom, savedRouteToRouteDetail, setRouteAlerts, setRouteFavorite, subscribeToSavedRoutes, type AlertHours, type RouteAlertSetting, type SavedRoute } from '../data/savedRoutes';
import { registerForRouteAlerts } from '../lib/notifications';
import { EMPTY_LINE_LAYERS, lineLayerRouteKey, loadMapLines, readLineLayerChoice, writeLineLayerChoice, type LineLayerChoice, type LineLayerRoute, type MapLine } from '../data/lineLayers';
import type { SearchPlace } from '../data/placesSearch';
import { TransitLiveProvider, useTransitLive } from '../data/TransitLiveContext';
import { riderLocation, type Itinerary, type ResumePlanRequest } from '../data/tripPlanning';
import {
  findSavedLocation,
  locationToPlace,
  placeFromName,
  removeSavedLocation,
  saveLocation,
  subscribeToSavedLocations,
  type SavedLocation,
  saveLabeledLocation,
  savedPlaceName,
  savedPlaceGroups,
  type SavedPlaceStyle,
} from '../data/userData';
import {
  routes,
  type RouteDetail,
  type TripTimeChoice,
} from '../data/transit';
import { AdminToolsView } from '../debug/AdminToolsView';
import { DebugBanner } from '../debug/DebugBanner';
import { useDebug } from '../debug/DebugContext';
import { pinnedSpotLabel } from '../debug/presets';
import { useCurrentLocation, type Coordinates } from '../hooks/useCurrentLocation';
import { useActiveTrip } from '../hooks/useActiveTrip';
import { useNow } from '../hooks/useNow';
import { ThemedStatusBar, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { ConfirmDialog } from './ConfirmDialog';
import { Mascot } from './Mascot';
import { CurrentLocationButton } from './CurrentLocationButton';
import { DeparturesView } from './DeparturesView';
import { EnrouteNavigationView, EnrouteRecoveryView, type EnrouteLocationState } from './EnrouteNavigationView';
import { GoogleMapView, type HomeMapCamera } from './GoogleMapView';
import { LineLayersSheet } from './LineLayersSheet';
import { MapControlButton } from './MapControlButton';
import { PressableScale } from './PressableScale';
import { ProfileView } from './ProfileView';
import { useUserPreferences } from '../data/userPreferences';
import { MapPickerView } from './MapPickerView';
import { RouteAlertsPrompt, type RouteAlertsRequest } from './RouteAlertsPrompt';
import { RouteDetailView, type TappedStop } from './RouteDetailView';
import { SavedPlaceDetailsSheet } from './SavedPlaceDetailsSheet';
import { SavePlaceSheet, type SavePlaceRequest } from './SavePlaceSheet';
import { ResumeTripCard } from './ResumeTripCard';
import { CURRENT_LOCATION_LABEL, initialResultsCriteria, RouteResultsView, type ResultsCriteria } from './RouteResultsView';
import { useNudgePrompt } from '../data/nudgePrompt';
import { NudgeBanner } from './NudgeBanner';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet, type TransitTabId } from './TransitSheet';
import { radii } from '../theme/shape';

const TRANSIT_TABS_HEIGHT = 30;
const TRANSIT_CARD_HEIGHT = 104;
const VISIBLE_TRANSIT_CARDS = 3;
const VISIBLE_CARD_GUTTER = 24;
const MINIMUM_MAP_HEIGHT = 240;
// Height reserved for the floating search header at the top of the map.
const HEADER_INSET = 80;
// Same footprint as the blue current-location dot (CurrentLocationMarker).
const SEARCH_CENTER_SIZE = 34;
const NEARBY_SEARCH_DEBOUNCE_MS = 600;
// A cached nearby list older than a day is more misleading than helpful.
const NEARBY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Choosing a place to save: straight away under `label` when set, else named in SavePlaceSheet. */
// `replacing`: a saved place's edit sheet, waiting on the new address the search picks for it.
type SavedPlacePick = { label?: 'Home' | 'Work'; returnTo: 'search' | 'favorites' | 'settings'; replacing?: SavePlaceRequest };
type ResultsViewState = { name: 'results'; criteria: ResultsCriteria; returnTo: 'search' | 'favorites' | 'home' };

type ActiveView =
  | { name: 'home' }
  // `editing`: changing one endpoint of an open Route Results, which this search returns to.
  // `pickOnMap`: "Choose on map" is open over this search, and its pin is chosen like a result.
  | { name: 'search'; editing?: { field: 'origin' | 'destination'; results: ResultsViewState }; pickMockLocation?: boolean; pickSavedPlace?: SavedPlacePick; pickOnMap?: boolean }
  // `route` is the snapshot opened, so the page never depends on the route still being nearby.
  // `previous`: where Back goes (search, or the route a stop or transfer was tapped on); else Home.
  // `wholeRoute`: the whole line, opened from search rather than at a stop.
  | { name: 'route'; routeId: string; route: RouteDetail; directionIndex?: number; previous?: ActiveView; wholeRoute?: boolean }
  // "More departures" for one direction of an opened route; back returns to that route and direction.
  | { name: 'departures'; routeId: string; route: RouteDetail; directionIndex: number; previous?: ActiveView; wholeRoute?: boolean }
  | ResultsViewState
  | { name: 'enroute' }
  | { name: 'profile'; route?: 'places' }
  | { name: 'admin' };


const MAX_SAVED_LOCATIONS = 50;

/** The place a Route Results destination stands for; a swapped-in or demo one is known only by name. */
function destinationPlaceOf(criteria: ResultsCriteria): SearchPlace {
  return criteria.destinationPlace?.title === criteria.destination ? criteria.destinationPlace : placeFromName(criteria.destination);
}

/** Reconstructs a provider-light endpoint for a fresh search; no stored route content is replayed. */
function placeForTripEndpoint(endpoint: TripEndpointReference): SearchPlace {
  return endpoint.kind === 'place'
    ? { id: endpoint.placeId, title: endpoint.label, subtitle: 'Recent trip', source: 'google' }
    : {
      id: `recent:${endpoint.point.lat},${endpoint.point.lng}`,
      title: endpoint.label,
      subtitle: 'Recent trip',
      location: { latitude: endpoint.point.lat, longitude: endpoint.point.lng },
    };
}

function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

type RouteDetailScreenProps = {
  initialDirectionIndex?: number;
  isFavorite: boolean;
  onBack: () => void;
  onOpenDepartures: (directionIndex: number) => void;
  onOpenTransfer: (transfer: LineTransfer, stop: TappedStop) => void;
  wholeRoute?: boolean;
  onRefreshLocation: () => void;
  onToggleFavorite: () => void;
  alerts?: { on: boolean; onOpen: () => void };
  route: RouteDetail;
  location: Coordinates;
  locationKnown: boolean;
};

/** Reads live transit data itself — must render under TransitLiveProvider, which HomeScreen itself can't consume. */
function RouteDetailScreen({ alerts, initialDirectionIndex, isFavorite, location, locationKnown, onBack, onOpenDepartures, onOpenTransfer, onRefreshLocation, onToggleFavorite, route, wholeRoute }: RouteDetailScreenProps) {
  const live = useTransitLive(route.id);
  // Re-applies live data every 30 s so countdowns age and past departures drop between polls.
  const now = useNow(30_000);
  return (
    <RouteDetailView
      alerts={alerts}
      initialDirectionIndex={initialDirectionIndex}
      isFavorite={isFavorite}
      location={location}
      locationKnown={locationKnown}
      onBack={onBack}
      onOpenDepartures={onOpenDepartures}
      onOpenTransfer={onOpenTransfer}
      onRefreshLocation={onRefreshLocation}
      onToggleFavorite={onToggleFavorite}
      route={applyRouteLive(route, live, now)}
      wholeRoute={wholeRoute}
    />
  );
}

/** Like RouteDetailScreen: reads live data so each direction carries the rider's nearest stop. */
function DeparturesScreen({ directionIndex, onBack, route }: { directionIndex: number; onBack: () => void; route: RouteDetail }) {
  const live = useTransitLive(route.id);
  const now = useNow(30_000);
  return <DeparturesView directionIndex={directionIndex} onBack={onBack} route={applyRouteLive(route, live, now)} />;
}

export function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  // `null` means startup has not chosen a screen yet. Once UID-scoped hydration resolves, a
  // restored trip opens directly; every user navigation then records an explicit view choice.
  const [requestedView, setActiveView] = useState<ActiveView | null>(null);
  const [homeTab, setHomeTab] = useState<TransitTabId>('nearby');
  const [selectedTrip, setSelectedTrip] = useState<{ itinerary: Itinerary; resumeRequest: ResumePlanRequest } | null>(null);
  const [tripTime, setTripTime] = useState<TripTimeChoice>({ mode: 'now' });
  const [arrivedDestination, setArrivedDestination] = useState<string | null>(null);
  const [tripStartFailed, setTripStartFailed] = useState(false);
  // A trip's star saves its destination to the account (Firestore), listed under Favorites -> Places.
  const { user } = useAuth();
  const uid = user?.uid;
  // One "Save" star replaces pin + favorite: saved routes lead Nearby and fill Favorites -> Routes.
  // Real lines are saved to the account (with their alert setting), so they show anywhere and
  // the backend can push their alerts; the demo catalog's illustrative routes stay on this device.
  // Nothing is saved by default.
  const [accountRoutes, setAccountRoutes] = useState<readonly SavedRoute[]>([]);
  const [localSavedRouteIds, setLocalSavedRouteIds] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToSavedRoutes(uid, setAccountRoutes);
  }, [uid]);
  // Starred lines only; a line kept just for its alerts isn't a favorite.
  const savedRouteIds = useMemo(() => [...accountRoutes.filter((route) => route.favorite).map((route) => route.id), ...localSavedRouteIds], [accountRoutes, localSavedRouteIds]);
  const accountRouteDetails = useMemo(() => new Map(accountRoutes.map((route) => [route.id, savedRouteToRouteDetail(route)])), [accountRoutes]);
  // Right after saving a line: "When should we alert you?" (null when closed).
  const [alertsPrompt, setAlertsPrompt] = useState<(RouteAlertsRequest & { route: RouteDetail }) | null>(null);
  // New searches start from the rider's travel preferences; a ref keeps the open callbacks stable.
  const travelPreferences = useUserPreferences().preferences.travel;
  const travelPreferencesRef = useRef(travelPreferences);
  useEffect(() => {
    travelPreferencesRef.current = travelPreferences;
  }, [travelPreferences]);
  const trip = useActiveTrip(uid);
  const {
    advance: advanceTrip,
    cancelReplacement,
    confirmReplacement,
    end: endTrip,
    resetForAdmin: resetTripForAdmin,
    retry: retryTrip,
    start: startActiveTrip,
  } = trip;
  const activeView = useMemo<ActiveView>(() => requestedView ?? (
    trip.status === 'active' || trip.status === 'recovery' ? { name: 'enroute' } : { name: 'home' }
  ), [requestedView, trip.status]);
  const [savedLocations, setSavedLocations] = useState<readonly SavedLocation[]>([]);
  const { height } = useWindowDimensions();
  const { location, mocked: locationMocked, navigationFix, navigationStale, refresh: refreshLocation, status: locationStatus } = useCurrentLocation(trip.active != null);
  const { isAdmin, mockLocation, overlays, setMockLocation } = useDebug();
  const resumeGuidance = useMemo(
    () => (trip.active ? guidanceForNavigation(trip.active.plan, trip.active.cursor) : null),
    [trip.active],
  );
  const hasResumableTrip = trip.status === 'active' || trip.status === 'recovery';
  const nudge = useNudgePrompt(hasResumableTrip);
  const homeHeaderInset = hasResumableTrip ? 158 : HEADER_INSET;
  const processedFixRef = useRef<string | null>(null);
  const [followEvidence, setFollowEvidence] = useState<{ sessionId: string; fix: NonNullable<typeof navigationFix> } | null>(null);
  // Admin overlay: the last tapped map point, until dismissed.
  const [tappedPoint, setTappedPoint] = useState<Coordinates | null>(null);
  // Admin: a long-pressed map point waiting for "Use as mock location".
  const [pendingMockPoint, setPendingMockPoint] = useState<Coordinates | null>(null);
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  // Home cards currently on screen; live data is fetched only for these (or the open route).
  const [visibleRouteIds, setVisibleRouteIds] = useState<readonly string[]>([]);
  // Bumped to recenter the home map: once on the first GPS fix and on each location-button press.
  // Routine GPS updates move only the rider's dot, never the map.
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [hasCenteredOnFix, setHasCenteredOnFix] = useState(false);
  // A rotated or tilted map shows a compass that turns it back to north-up.
  const [mapOrientation, setMapOrientation] = useState({ heading: 0, rotated: false });
  const [reorientRequest, setReorientRequest] = useState(0);
  if (!hasCenteredOnFix && locationStatus === 'located') {
    setHasCenteredOnFix(true);
    setRecenterRequest((count) => count + 1);
  }

  // Every real nearby route, across every configured agency — not a fixed handful of
  // hand-picked lines (nearbyTransit.ts). Fetched only on real location changes (the watch in
  // useCurrentLocation already throttles how often that is) — deliberately *not* on pin/unpin,
  // since re-fetching from the network would briefly empty this list while reloading, and a
  // route whose own detail page is open (e.g. because the rider just pinned it from there)
  // would disappear from `findRoute` lookups during that gap and bounce them back to Home.
  // Pin state only affects the separate, pure `nearbyRoutes` filter below.
  // Once loaded, a re-fetch keeps showing the previous list (`refreshing`) instead of emptying
  // it: location updates arrive every few seconds, and an empty gap made the open route page
  // lose its route and bounce back to Home.
  const [nearbyStatus, setNearbyStatus] = useState<{ status: 'loading' } | { status: 'loaded'; routes: readonly RouteDetail[]; refreshing?: boolean } | { status: 'error' }>({ status: 'loading' });
  // Where the rider has panned the home map to explore (null = their own location). Nearby is
  // searched around this point, and each card's stop and departures are for the stop nearest it,
  // so exploring Hicksville shows Hicksville stops, not the rider's own.
  const [searchCenter, setSearchCenter] = useState<Coordinates | null>(null);
  // Where the home map last came to rest. The map is rebuilt when the rider comes back from a
  // route, and reopens here — on the purple dot, if they had panned away — not on their GPS fix.
  const [homeCamera, setHomeCamera] = useState<HomeMapCamera | null>(null);
  // Setting or clearing a mock location jumps the map (and Nearby) to it, like a new GPS fix.
  const mockKey = locationMocked ? `${location.latitude},${location.longitude}` : '';
  const [handledMockKey, setHandledMockKey] = useState(mockKey);
  if (mockKey !== handledMockKey) {
    setHandledMockKey(mockKey);
    setSearchCenter(null);
    // A map rebuilt later (returning from Admin tools) opens on the location, not its old camera.
    setHomeCamera(null);
    setRecenterRequest((count) => count + 1);
  }
  const nearbyPoint = searchCenter ?? location;
  const exploring = searchCenter != null;
  // An open route keeps the stops it opened with: live data stays anchored where the rider was,
  // so a new fix (or a "nearer" stop) never swaps the stop or walking path under them.
  const viewingRoute = activeView.name === 'route' || activeView.name === 'departures';
  const [routeAnchor, setRouteAnchor] = useState<Coordinates | null>(null);
  if (viewingRoute && !routeAnchor) setRouteAnchor(nearbyPoint);
  if (!viewingRoute && routeAnchor) setRouteAnchor(null);
  const livePoint = viewingRoute && routeAnchor ? routeAnchor : nearbyPoint;
  // On launch, the last nearby list shows at once (marked as updating) while the fresh search,
  // possibly against a cold backend, runs.
  useEffect(() => {
    void readCache<DiscoveredRoute[]>(NEARBY_CACHE_KEY, NEARBY_CACHE_MAX_AGE_MS).then((cached) => {
      if (!cached?.length) return;
      setNearbyStatus((current) => (current.status === 'loading' ? { status: 'loaded', routes: cached.map(discoveredRouteToRouteDetail), refreshing: true } : current));
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setNearbyStatus((current) => (current.status === 'loaded' ? { ...current, refreshing: true } : { status: 'loading' }));
      try {
        const discovered = await fetchNearbyTransit(nearbyPoint);
        if (cancelled) return;
        setNearbyStatus({ status: 'loaded', routes: discovered.map(discoveredRouteToRouteDetail) });
        // The rider's own surroundings (not an area explored with the map) open instantly next time.
        if (!exploring) void writeCache(NEARBY_CACHE_KEY, discovered);
      } catch {
        if (!cancelled) setNearbyStatus((current) => (current.status === 'loaded' ? { ...current, refreshing: false } : { status: 'error' }));
      }
    };
    // Debounced so a burst of map gestures or GPS updates triggers one search.
    const timer = setTimeout(load, NEARBY_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the coordinate primitives, not the point object (a new reference every GPS update)
  }, [nearbyPoint.latitude, nearbyPoint.longitude]);
  // Every discovered route, regardless of pin state — used for resolving ids (findRoute) so a
  // pinned route's own detail page keeps working.
  const allDiscoveredRoutes = useMemo(
    () => (nearbyStatus.status === 'loaded' ? nearbyStatus.routes : []),
    [nearbyStatus],
  );
  // What actually shows in the Nearby section: the same discovered routes, minus any that are
  // the exact same real line as one that's currently pinned (so it isn't shown twice) — a
  // pure filter over `allDiscoveredRoutes`, re-evaluated on save/unsave without a network call.
  const nearbyRoutes = useMemo(() => {
    const savedRoutes = savedRouteIds.map((id) => routes.find((route) => route.id === id) ?? accountRouteDetails.get(id)).filter((route): route is RouteDetail => route != null);
    return filterOutPinnedDuplicates(allDiscoveredRoutes, savedRoutes);
  }, [accountRouteDetails, allDiscoveredRoutes, savedRouteIds]);
  // Saved lines found by the nearby search (or with no live source to place them) lead Nearby.
  const savedNearbyRouteIds = useMemo(() => {
    const discovered = new Set(allDiscoveredRoutes.map((route) => (route.liveSource ? `${route.liveSource.agencyId}:${route.liveSource.routeId}` : route.id)));
    return new Set(savedRouteIds.filter((id) => {
      const route = routes.find((candidate) => candidate.id === id) ?? accountRouteDetails.get(id);
      return !route?.liveSource || discovered.has(`${route.liveSource.agencyId}:${route.liveSource.routeId}`);
    }));
  }, [accountRouteDetails, allDiscoveredRoutes, savedRouteIds]);

  // The home map's line layers: what's switched on (kept on this device) and the lines it draws.
  const [lineChoice, setLineChoice] = useState<LineLayerChoice>(EMPTY_LINE_LAYERS);
  const [mapLines, setMapLines] = useState<readonly MapLine[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readLineLayerChoice().then((choice) => {
      if (!cancelled) setLineChoice((current) => (current === EMPTY_LINE_LAYERS ? choice : current));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadMapLines(lineChoice).then((lines) => {
      if (!cancelled) setMapLines(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [lineChoice]);
  const changeLineChoice = useCallback((choice: LineLayerChoice) => {
    setLineChoice(choice);
    void writeLineLayerChoice(choice);
  }, []);
  // Lines offered one by one: saved lines first, then nearby ones, each once.
  const layerCandidates = useMemo(() => {
    const savedRoutes = savedRouteIds.map((id) => routes.find((route) => route.id === id) ?? accountRouteDetails.get(id)).filter((route): route is RouteDetail => route != null);
    const seen = new Set<string>();
    return [...savedRoutes, ...nearbyRoutes].flatMap((route): (LineLayerRoute & { agency: string })[] => {
      if (!route.liveSource) return [];
      const candidate = { agencyId: route.liveSource.agencyId, routeId: route.liveSource.routeId, shortName: route.shortName, color: route.color, agency: route.agency };
      const key = lineLayerRouteKey(candidate);
      if (seen.has(key)) return [];
      seen.add(key);
      return [candidate];
    });
  }, [accountRouteDetails, nearbyRoutes, savedRouteIds]);

  // Resolves either kind of id a card/pin/favorite can hold: the demo catalog's own (routeById)
  // or a dynamically-discovered one — so opening, pinning, or favoriting works the same way
  // regardless of where a route came from. Deliberately searches `allDiscoveredRoutes`, not
  // the pin-filtered `nearbyRoutes` — a just-pinned route must stay resolvable by id even
  // though it's no longer shown in the Nearby section itself.
  const findRoute = useCallback(
    (routeId: string): RouteDetail | undefined => routes.find((route) => route.id === routeId)
      ?? allDiscoveredRoutes.find((route) => route.id === routeId)
      // A saved line far from here still opens, from what was saved with it.
      ?? accountRouteDetails.get(routeId),
    [accountRouteDetails, allDiscoveredRoutes],
  );

  // The id a route is saved under: its real line ("lirr:10"), whichever stop or card it was
  // opened from; a demo route without live data keeps its own.
  const savedIdFor = (route: RouteDetail) => (route.liveSource ? `${route.liveSource.agencyId}:${route.liveSource.routeId}` : route.id);
  // A line's star and its alerts are separate: each can be on without the other. Both live on the
  // line's one record, which goes away once neither is on.
  const toggleSavedRoute = useCallback((route: RouteDetail) => {
    const id = route.liveSource ? `${route.liveSource.agencyId}:${route.liveSource.routeId}` : route.id;
    const saved = route.liveSource && uid ? savedRouteFrom(route, 'off') : null;
    if (!saved || !uid) {
      setLocalSavedRouteIds((current) => toggleItem(current, id));
      return;
    }
    // The listener shows the change; a rejected write leaves the star as it was.
    const existing = accountRoutes.find((entry) => entry.id === id);
    if (!existing) saveRoute(uid, saved).catch(() => undefined);
    else if (!existing.favorite) setRouteFavorite(uid, id, true).catch(() => undefined);
    else if (existing.alerts === 'off') removeSavedRoute(uid, id).catch(() => undefined);
    else setRouteFavorite(uid, id, false).catch(() => undefined);
  }, [accountRoutes, uid]);
  const chooseRouteAlerts = useCallback((setting: RouteAlertSetting, hours?: AlertHours) => {
    const prompt = alertsPrompt;
    setAlertsPrompt(null);
    if (!prompt || !uid) return;
    if (setting === prompt.setting && setting !== 'custom') return;
    const existing = accountRoutes.find((entry) => entry.id === prompt.id);
    if (existing) {
      // Alerts off on a line that isn't starred: nothing left to keep.
      if (setting === 'off' && !existing.favorite) removeSavedRoute(uid, prompt.id).catch(() => undefined);
      else setRouteAlerts(uid, prompt.id, setting, hours).catch(() => undefined);
    } else {
      const record = savedRouteFrom(prompt.route, setting, false);
      if (record) saveRoute(uid, { ...record, ...(setting === 'custom' && hours ? { alertHours: hours } : {}) }).catch(() => undefined);
    }
    if (setting !== 'off') void registerForRouteAlerts(uid);
  }, [accountRoutes, alertsPrompt, uid]);
  // Route view's bell: the line's alert setting, to change, starred or not.
  const routeAlertsFor = (route: RouteDetail) => {
    if (!route.liveSource || !uid) return undefined;
    const id = savedIdFor(route);
    const saved = accountRoutes.find((entry) => entry.id === id);
    const setting = saved?.alerts ?? 'off';
    return {
      on: setting !== 'off',
      onOpen: () => setAlertsPrompt({ id, route, setting, hours: saved?.alertHours }),
    };
  };

  const openRoute = useCallback((routeId: string) => {
    const route = findRoute(routeId);
    if (route) setActiveView({ name: 'route', routeId, route });
  }, [findRoute]);

  // A line opened from search: the whole line, Back returns to the search.
  // A line picked in search: described at its stops nearest the rider, then opened whole.
  const openSearchedLine = useCallback(async (line: IndexedLine) => {
    const described = await describeTransitLine(line.agencyId, line.routeId, riderLocation(location, locationStatus) ?? SERVICE_AREA_FALLBACK);
    const route = discoveredRouteToRouteDetail(described);
    setActiveView((current) => (current?.name === 'search' ? { name: 'route', routeId: route.id, route, wholeRoute: true, previous: { name: 'search' } } : current));
  }, [location, locationStatus]);
  // A transfer badge: that line, at the stop it was tapped on. Opens once its stops are known;
  // ignored if the rider has left this page meanwhile.
  const openTransfer = useCallback((from: Extract<ActiveView, { name: 'route' }>, transfer: LineTransfer, stop: TappedStop) => {
    void fetchRouteAtStop(transfer.agencyId, transfer.routeId, { latitude: stop.lat, longitude: stop.lon }).then(
      (route) => setActiveView((current) => (current === from ? { name: 'route', routeId: route.id, route, previous: from } : current)),
      () => undefined,
    );
  }, []);

  const mapHeight = Math.max(
    MINIMUM_MAP_HEIGHT,
    height
      - TRANSIT_TABS_HEIGHT
      - TRANSIT_CARD_HEIGHT * VISIBLE_TRANSIT_CARDS
      - VISIBLE_CARD_GUTTER,
  );
  // The transit menu scrolls over the map in one page scroll; the location button fades out and
  // rides up with it.
  const [homeScrollY] = useState(() => new Animated.Value(0));
  const locationButtonOpacity = homeScrollY.interpolate({
    inputRange: [0, 48],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const locationButtonTranslateY = homeScrollY.interpolate({
    inputRange: [0, mapHeight],
    outputRange: [0, -mapHeight],
    extrapolate: 'clamp',
  });

  const showHome = useCallback(() => setActiveView({ name: 'home' }), []);
  const showSearch = useCallback(() => {
    setSelectedTrip(null);
    setActiveView({ name: 'search' });
  }, []);
  const showRouteResults = useCallback((place: SearchPlace) => {
    setSelectedTrip(null);
    setActiveView({ name: 'results', criteria: initialResultsCriteria(place.title, place, travelPreferencesRef.current), returnTo: 'search' });
  }, []);
  const showFavorites = useCallback(() => {
    setHomeTab('favorites');
    setActiveView({ name: 'home' });
  }, []);
  const openRecentTrip = useCallback((recent: RecentTripV1) => {
    const originPlace = placeForTripEndpoint(recent.origin);
    const destinationPlace = placeForTripEndpoint(recent.destination);
    setSelectedTrip(null);
    setTripTime({ mode: 'now' });
    setActiveView({
      name: 'results',
      criteria: {
        ...initialResultsCriteria(destinationPlace.title, destinationPlace, travelPreferencesRef.current),
        origin: originPlace.title,
        originPlace,
      },
      returnTo: 'home',
    });
  }, []);
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToSavedLocations(uid, MAX_SAVED_LOCATIONS, setSavedLocations);
  }, [uid]);
  const isPlaceSaved = useCallback((place: SearchPlace) => findSavedLocation(savedLocations, place) != null, [savedLocations]);
  const toggleSavedPlace = useCallback((place: SearchPlace) => {
    if (!uid) return;
    const saved = findSavedLocation(savedLocations, place);
    // The listener picks up the change (Firestore applies local writes right away, even offline),
    // so the star needs no state of its own; a rejected write just leaves it as it was.
    const write = saved ? removeSavedLocation(uid, saved.address.placeId) : saveLocation(uid, place, 'Destination');
    write.catch(() => undefined);
  }, [savedLocations, uid]);
  const openSavedLocation = useCallback((location: SavedLocation) => {
    const place = locationToPlace(location.address);
    setSelectedTrip(null);
    setActiveView({ name: 'results', criteria: initialResultsCriteria(place.title, place, travelPreferencesRef.current), returnTo: 'favorites' });
  }, []);
  // Adding a saved place: search for it, then name it (or save it straight away as Home or Work).
  const [saveRequest, setSaveRequest] = useState<SavePlaceRequest | null>(null);
  const addSavedPlace = useCallback((returnTo: SavedPlacePick['returnTo'], label?: 'Home' | 'Work') => {
    setActiveView({ name: 'search', pickSavedPlace: { label, returnTo } });
  }, []);
  const leaveSavedPlacePick = useCallback((returnTo: SavedPlacePick['returnTo']) => {
    if (returnTo === 'favorites') showFavorites();
    else if (returnTo === 'settings') setActiveView({ name: 'profile', route: 'places' });
    else setActiveView({ name: 'search' });
  }, [showFavorites]);
  const saveNamedPlace = useCallback((place: SearchPlace, label: string, style?: SavedPlaceStyle, replacing?: string) => {
    if (!uid) return;
    // As with the star, the listener shows the write; a rejected one just leaves the list as it was.
    saveLabeledLocation(uid, place, label, savedLocations, style, replacing).catch(() => undefined);
  }, [savedLocations, uid]);
  const editSavedPlace = useCallback((location: SavedLocation) => {
    const { address } = location;
    setSaveRequest({ place: locationToPlace(address), label: savedPlaceName(address), style: { icon: address.icon, color: address.color, group: address.group }, editing: true });
  }, []);
  const savePlaceGroups = useMemo(() => savedPlaceGroups(savedLocations), [savedLocations]);
  const savePlaceSheet = (
    <SavePlaceSheet
      groups={savePlaceGroups}
      onCancel={() => setSaveRequest(null)}
      onChangeAddress={(draft) => {
        setSaveRequest(null);
        setActiveView({ name: 'search', pickSavedPlace: { returnTo: 'settings', replacing: draft } });
      }}
      onRemove={() => {
        // A place whose address was being changed is still saved under its old one.
        if (uid && saveRequest) removeSavedLocation(uid, saveRequest.replacing ?? saveRequest.place.id).catch(() => undefined);
        setSaveRequest(null);
      }}
      onSave={(label, style) => {
        if (saveRequest) saveNamedPlace(saveRequest.place, label, style, saveRequest.replacing);
        setSaveRequest(null);
      }}
      request={saveRequest}
    />
  );
  // A saved place's marker opens its details first (with every place stacked under it); Go plans the trip.
  const [mapPlaces, setMapPlaces] = useState<readonly SavedLocation[]>([]);
  const openSavedLocationFromMap = useCallback((location: SavedLocation, stack: readonly SavedLocation[]) => {
    setMapPlaces(stack.length > 0 ? stack : [location]);
  }, []);
  const goToSavedPlaceFromMap = useCallback((location: SavedLocation) => {
    setMapPlaces([]);
    const place = locationToPlace(location.address);
    setSelectedTrip(null);
    setActiveView({ name: 'results', criteria: initialResultsCriteria(place.title, place, travelPreferencesRef.current), returnTo: 'home' });
  }, []);
  const showPlannedTrip = useCallback((itinerary: Itinerary, resumeRequest: ResumePlanRequest) => {
    setSelectedTrip({ itinerary, resumeRequest });
  }, []);
  // Back to the results list, also when it was opened from a saved place (Favorites comes after it).
  const closePlannedTrip = useCallback(() => setSelectedTrip(null), []);
  const closeResults = useCallback(() => {
    if (activeView.name === 'results' && activeView.returnTo === 'favorites') {
      showFavorites();
      return;
    }
    if (activeView.name === 'results' && activeView.returnTo === 'home') {
      showHome();
      return;
    }
    showSearch();
  }, [activeView, showFavorites, showHome, showSearch]);
  const startPlannedTrip = useCallback(async (itinerary: Itinerary) => {
    if (activeView.name !== 'results' || !selectedTrip) {
      setTripStartFailed(true);
      return;
    }
    const { resumeRequest } = selectedTrip;
    const result = await startActiveTrip({ itinerary, origin: resumeRequest.origin, destination: resumeRequest.destination, resumeRequest });
    if (result === 'started') {
      setSelectedTrip(null);
      setActiveView({ name: 'enroute' });
    } else if (result !== 'replacement-required') {
      setTripStartFailed(true);
    }
  }, [activeView, selectedTrip, startActiveTrip]);

  // Real GPS and admin checkpoints share this one evidence path. The engine itself rejects stale,
  // inaccurate, ambiguous, and backward movement and completes the session idempotently.
  const activeSessionId = trip.active?.sessionId;
  const activeDestinationLabel = trip.active?.destination.label;
  const fixLatitude = navigationFix?.point.lat;
  const fixLongitude = navigationFix?.point.lng;
  const fixCapturedAt = navigationFix?.capturedAt;
  const fixAccuracy = navigationFix?.accuracyMeters;
  const fixSource = navigationFix?.source;
  const mockFixKey = fixSource === 'mock' && mockLocation
    ? `${mockLocation.label}:${mockLocation.latitude}:${mockLocation.longitude}:${mockLocation.capturedAt ?? ''}`
    : '';
  useEffect(() => {
    if (!navigationFix || !activeSessionId) return;
    const key = `${activeSessionId}:${fixSource}:${fixCapturedAt}:${fixLatitude}:${fixLongitude}:${fixAccuracy ?? ''}:${mockFixKey}`;
    if (processedFixRef.current === key) return;
    processedFixRef.current = key;
    const destination = activeDestinationLabel ?? 'your destination';
    void advanceTrip(navigationFix).then((result) => {
      if (result?.locationState === 'current') setFollowEvidence({ sessionId: activeSessionId, fix: navigationFix });
      if (!result?.arrived) return;
      setArrivedDestination(destination);
      setActiveView({ name: 'home' });
    });
  }, [activeDestinationLabel, activeSessionId, advanceTrip, fixAccuracy, fixCapturedAt, fixLatitude, fixLongitude, fixSource, mockFixKey, navigationFix]);

  const closeCurrentView = useCallback(() => {
    if (activeView.name === 'search' && activeView.pickOnMap) {
      setActiveView({ ...activeView, pickOnMap: false });
      return;
    }

    if (activeView.name === 'admin') {
      setActiveView({ name: 'profile' });
      return;
    }
    if (activeView.name === 'search' && activeView.pickMockLocation) {
      setActiveView({ name: 'admin' });
      return;
    }
    if (activeView.name === 'search' && activeView.pickSavedPlace) {
      leaveSavedPlacePick(activeView.pickSavedPlace.returnTo);
      return;
    }

    if (activeView.name === 'results') {
      if (selectedTrip) {
        closePlannedTrip();
        return;
      }
      closeResults();
      return;
    }

    if (activeView.name === 'search' && activeView.editing) {
      setActiveView(activeView.editing.results);
      return;
    }

    if (activeView.name === 'departures') {
      const { directionIndex, previous, route, routeId, wholeRoute } = activeView;
      setActiveView({ name: 'route', routeId, route, directionIndex, previous, wholeRoute });
      return;
    }

    if (activeView.name === 'route' && activeView.previous) {
      setActiveView(activeView.previous);
      return;
    }

    showHome();
  }, [activeView, closePlannedTrip, closeResults, leaveSavedPlacePick, selectedTrip, showHome]);

  useEffect(() => {
    if (activeView.name === 'home' || Platform.OS === 'web') {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCurrentView();
      return true;
    });
    return () => subscription.remove();
  }, [activeView.name, closeCurrentView]);

  const transitionKey = activeView.name === 'route' || activeView.name === 'departures'
    ? `${activeView.name}-${activeView.routeId}`
    : activeView.name;
  // The open route keeps receiving live data even after it drops out of the nearby list.
  const openedRoute = activeView.name === 'route' || activeView.name === 'departures' ? activeView.route : null;
  const liveRoutes = openedRoute && !allDiscoveredRoutes.some((route) => route.id === openedRoute.id)
    ? [...allDiscoveredRoutes, openedRoute]
    : allDiscoveredRoutes;
  const activeLiveRouteIds = activeView.name === 'home' ? visibleRouteIds : openedRoute ? [openedRoute.id] : [];
  const screen = (node: ReactNode) => (
    <TransitLiveProvider activeRouteIds={activeLiveRouteIds} extraRoutes={liveRoutes} location={livePoint}>
      <ScreenTransition key={transitionKey}>{node}</ScreenTransition>
      {savePlaceSheet}
      <RouteAlertsPrompt onClose={() => setAlertsPrompt(null)} onDone={chooseRouteAlerts} request={alertsPrompt} />
    </TransitLiveProvider>
  );

  const enrouteLocationState: EnrouteLocationState = locationStatus === 'loading'
    ? 'loading'
    : locationStatus === 'unavailable'
      ? 'unavailable'
      : navigationStale
        ? 'stale'
      : trip.locationState && trip.locationState !== 'current'
        ? trip.locationState
        : 'located';

  if (trip.status === 'hydrating') {
    return screen(
      <View accessibilityLabel="Restoring your trips" style={styles.hydration} testID="active-trip-hydration">
        <Mascot motion="bob" pose="thinking" size={72} />
        <Text style={styles.hydrationText}>Restoring your trips…</Text>
      </View>,
    );
  }

  if (activeView.name === 'enroute') {
    if (trip.status === 'active' && trip.active) {
      const session = trip.active;
      const firstCheckpoint = session.plan.checkpoints[0];
      return screen(
        <EnrouteNavigationView
          cursor={session.cursor}
          fix={navigationFix}
          followFix={followEvidence?.sessionId === session.sessionId ? followEvidence.fix : null}
          isAdmin={isAdmin}
          locationState={enrouteLocationState}
          onBack={showHome}
          onDemoCheckpoint={isAdmin ? (checkpoint) => setMockLocation({ label: checkpoint.label, latitude: checkpoint.point.lat, longitude: checkpoint.point.lng }) : undefined}
          onEnd={() => {
            void endTrip().then((ended) => {
              if (!ended) return;
              setHomeTab('recents');
              showHome();
            });
          }}
          onResetDemo={isAdmin ? () => {
            void resetTripForAdmin().then((reset) => {
              if (reset && firstCheckpoint) setMockLocation({ label: firstCheckpoint.label, latitude: firstCheckpoint.point.lat, longitude: firstCheckpoint.point.lng });
            });
          } : undefined}
          plan={session.plan}
          session={session}
        />,
      );
    }
    if (trip.status === 'recovery' && trip.recovery) {
      return screen(
        <EnrouteRecoveryView
          destination={trip.recovery.destination.label}
          loading={trip.retrying}
          onBack={showHome}
          onEnd={() => {
            void endTrip().then((ended) => {
              if (!ended) return;
              setHomeTab('recents');
              showHome();
            });
          }}
          onRetry={() => void retryTrip()}
        />,
      );
    }
  }

  if (activeView.name === 'search' && activeView.pickOnMap) {
    const search = activeView;
    const pick = (place: SearchPlace) => {
      if (search.editing) {
        const { field, results } = search.editing;
        setActiveView({ ...results, criteria: { ...results.criteria, [field]: place.title, [field === 'origin' ? 'originPlace' : 'destinationPlace']: place } });
      } else {
        showRouteResults(place);
      }
    };
    return screen(<MapPickerView location={riderLocation(location, locationStatus) ?? location} onCancel={closeCurrentView} onPick={pick} />);
  }

  if (activeView.name === 'search' && activeView.pickMockLocation) {
    // Admin: any searchable place becomes the mock location.
    return screen(
      <SearchView
        near={riderLocation(location, locationStatus)}
        onCancel={() => setActiveView({ name: 'admin' })}
        onSelect={(place) => {
          if (place.location) setMockLocation({ label: place.title, latitude: place.location.latitude, longitude: place.location.longitude });
          setActiveView({ name: 'admin' });
        }}
      />
    );
  }

  if (activeView.name === 'search' && activeView.pickSavedPlace) {
    const { label, replacing, returnTo } = activeView.pickSavedPlace;
    return screen(
      <SearchView
        near={riderLocation(location, locationStatus)}
        onCancel={() => {
          // Back to the edit sheet as it was left.
          if (replacing) setSaveRequest(replacing);
          leaveSavedPlacePick(returnTo);
        }}
        onSelect={(place) => {
          if (replacing) setSaveRequest({ ...replacing, place, replacing: replacing.replacing ?? replacing.place.id });
          else if (label) saveNamedPlace(place, label);
          else setSaveRequest({ place });
          leaveSavedPlacePick(returnTo);
        }}
        placeholder={replacing ? `Search for the new address for ${replacing.label?.trim() || replacing.place.title}` : label ? `Search for your ${label.toLowerCase()} address` : 'Search for a place to save'}
      />
    );
  }

  if (activeView.name === 'search') {
    const { editing } = activeView;
    if (editing) {
      // The same search page, changing one endpoint of the open Route Results; every other trip
      // criterion is kept, and cancel returns to it unchanged.
      const { field, results } = editing;
      const current = results.criteria[field];
      // The place goes with its label: what the trip is planned to (or from), and what the star saves.
      const choose = (value: string, place?: SearchPlace) => setActiveView({
        ...results,
        criteria: { ...results.criteria, [field]: value, [field === 'origin' ? 'originPlace' : 'destinationPlace']: place },
      });
      return screen(
        <SearchView
          near={riderLocation(location, locationStatus)}
          initialQuery={current === CURRENT_LOCATION_LABEL ? '' : current}
          onCancel={() => setActiveView(results)}
          onChooseOnMap={() => setActiveView({ ...activeView, pickOnMap: true })}
          onSelect={(place) => choose(place.title, place)}
          onSelectCurrentLocation={field === 'origin' ? () => choose(CURRENT_LOCATION_LABEL) : undefined}
          savedPlaces={savedLocations}
        />
      );
    }
    return screen(
      <SearchView
        near={riderLocation(location, locationStatus)}
        onAddSavedPlace={uid ? (label) => addSavedPlace('search', label) : undefined}
        onCancel={showHome}
        onChooseOnMap={() => setActiveView({ name: 'search', pickOnMap: true })}
        onSelect={showRouteResults}
        onSelectLine={openSearchedLine}
        savedPlaces={savedLocations}
      />
    );
  }

  if (activeView.name === 'route') {
    const routeView = activeView;
    const { previous, routeId, wholeRoute } = activeView;
    // Prefer the freshest copy, but keep the opened snapshot if the route has since dropped out
    // of the nearby list (the rider moved), so the page stays open.
    const route = findRoute(routeId) ?? activeView.route;
    return screen(
      <RouteDetailScreen
        initialDirectionIndex={activeView.directionIndex}
        isFavorite={savedRouteIds.includes(savedIdFor(route))}
        onBack={closeCurrentView}
        onOpenDepartures={(directionIndex) => setActiveView({ name: 'departures', routeId, route, directionIndex, previous, wholeRoute })}
        onOpenTransfer={(transfer, stop) => openTransfer(routeView, transfer, stop)}
        wholeRoute={wholeRoute}
        onRefreshLocation={() => void refreshLocation()}
        location={location}
        locationKnown={locationStatus === 'located'}
        onToggleFavorite={() => toggleSavedRoute(route)}
        alerts={routeAlertsFor(route)}
        route={route}
      />
    );
  }

  if (activeView.name === 'departures') {
    const route = findRoute(activeView.routeId) ?? activeView.route;
    return screen(<DeparturesScreen directionIndex={activeView.directionIndex} onBack={closeCurrentView} route={route} />);
  }

  if (activeView.name === 'results') {
    return screen(
      <>
        <RouteResultsView
          criteria={activeView.criteria}
          isDestinationSaved={isPlaceSaved(destinationPlaceOf(activeView.criteria))}
          locationPending={locationStatus === 'loading'}
          onBack={closeResults}
          onChangeCriteria={(criteria) => setActiveView({ ...activeView, criteria })}
          onChangeTripTime={setTripTime}
          onCloseTrip={closePlannedTrip}
          onEditEndpoint={(field) => setActiveView({ name: 'search', editing: { field, results: activeView } })}
          onOpenTrip={showPlannedTrip}
          onStartTrip={startPlannedTrip}
          onToggleSaveDestination={() => toggleSavedPlace(destinationPlaceOf(activeView.criteria))}
          riderLocation={riderLocation(location, locationStatus)}
          selectedItinerary={selectedTrip?.itinerary ?? null}
          tripTime={tripTime}
        />
        <ConfirmDialog
          body="Your current trip will be saved in Recents as ended early, then this exact departure will start."
          confirmLabel="Replace trip"
          destructive={true}
          onCancel={cancelReplacement}
          onConfirm={() => {
            void confirmReplacement().then((replaced) => {
              if (!replaced) {
                setTripStartFailed(true);
                return;
              }
              setSelectedTrip(null);
              setActiveView({ name: 'enroute' });
            });
          }}
          testID="replace-active-trip-confirm"
          title="Replace your active trip?"
          visible={trip.pendingReplacement !== null}
        />
        <ConfirmDialog
          body="Your active trip could not be saved on this device. Nothing was replaced. Please try again."
          cancelLabel="Close"
          confirmLabel="OK"
          onCancel={() => setTripStartFailed(false)}
          onConfirm={() => setTripStartFailed(false)}
          testID="start-trip-error"
          title="Couldn’t start this trip"
          visible={tripStartFailed}
        />
      </>
    );
  }

  if (activeView.name === 'profile') {
    return screen(
      <ProfileView
        initialRoute={activeView.route}
        onBack={showHome}
        onOpenAdminTools={isAdmin ? () => setActiveView({ name: 'admin' }) : undefined}
        savedPlaces={uid ? { locations: savedLocations, onAdd: (label) => addSavedPlace('settings', label), onEdit: editSavedPlace } : undefined}
      />,
    );
  }

  if (activeView.name === 'admin') {
    return screen(<AdminToolsView onBack={() => setActiveView({ name: 'profile' })} onPickMockLocation={() => setActiveView({ name: 'search', pickMockLocation: true })} />);
  }

  return screen(
    <View style={styles.viewport}>
      <ThemedStatusBar />
      <View style={styles.screen}>
        <GoogleMapView
          initialCamera={homeCamera}
          lines={mapLines}
          location={location}
          onCameraChange={setHomeCamera}
          onLongPress={isAdmin ? setPendingMockPoint : undefined}
          onPress={overlays.tapCoords ? setTappedPoint : undefined}
          onUserMoveEnd={setSearchCenter}
          onUserPan={() => setIsLocationCentered(false)}
          onOrientationChange={setMapOrientation}
          onSavedLocationPress={openSavedLocationFromMap}
          padding={{ top: homeHeaderInset, bottom: height - mapHeight }}
          recenterRequest={recenterRequest}
          reorientRequest={reorientRequest}
          savedLocations={savedLocations}
          simulatedLocation={locationMocked}
        />
        {searchCenter ? (
          // Fixed at the center of the visible map (below the header, above the resting sheet):
          // the point Nearby is currently searching around.
          <View
            accessibilityLabel="Searching nearby transit around the map center"
            pointerEvents="none"
            style={[styles.searchCenter, { top: (homeHeaderInset + mapHeight) / 2 - SEARCH_CENTER_SIZE / 2 }]}
            testID="search-center"
          >
            <Mascot pose="happy" size={22} />
          </View>
        ) : null}
        {locationStatus !== 'located' ? (
          <View pointerEvents="none" style={[styles.locationStatusPill, { top: homeHeaderInset }]}>
            <View style={styles.locationStatusBadge}>
              {locationStatus === 'loading' ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={styles.locationStatusText}>
                {locationStatus === 'loading' ? 'Finding your location…' : 'Location unavailable — showing Stony Brook'}
              </Text>
            </View>
          </View>
        ) : null}
        <DebugBanner top={homeHeaderInset} />
        {overlays.tapCoords && tappedPoint ? (
          <PressableScale accessibilityHint="Dismisses the coordinates" accessibilityRole="button" onPress={() => setTappedPoint(null)} style={[styles.tapCoords, { top: (homeHeaderInset + mapHeight) / 2 + 24 }]} testID="map-tap-coords">
            <Text selectable={true} style={styles.tapCoordsText}>{`${tappedPoint.latitude.toFixed(5)}, ${tappedPoint.longitude.toFixed(5)}`}</Text>
          </PressableScale>
        ) : null}
        {pendingMockPoint ? (
          <ConfirmDialog
            body={`${pendingMockPoint.latitude.toFixed(5)}, ${pendingMockPoint.longitude.toFixed(5)}`}
            confirmLabel="Use it"
            onCancel={() => setPendingMockPoint(null)}
            onConfirm={() => {
              setMockLocation({ label: pinnedSpotLabel(pendingMockPoint.latitude, pendingMockPoint.longitude), ...pendingMockPoint });
              setPendingMockPoint(null);
            }}
            testID="mock-location-confirm"
            title="Use as mock location?"
            visible={true}
          />
        ) : null}
        <Animated.View
          style={[
            styles.locationButton,
            {
              bottom: height - mapHeight + 16,
              opacity: locationButtonOpacity,
              transform: [{ translateY: locationButtonTranslateY }],
            },
          ]}
        >
          {mapOrientation.rotated ? (
            <PressableScale
              accessibilityHint="Turns the map back to north-up"
              accessibilityLabel="Reorient map to north"
              accessibilityRole="button"
              onPress={() => setReorientRequest((count) => count + 1)}
              style={styles.reorientButton}
              testID="reorient-map"
            >
              {/* The needle's red end points at true north on the rotated map. */}
              <View style={[styles.compassNeedle, { transform: [{ rotate: `${-mapOrientation.heading}deg` }] }]} testID="reorient-needle">
                <View style={styles.needleNorth} />
                <View style={styles.needleSouth} />
              </View>
            </PressableScale>
          ) : null}
          <CurrentLocationButton
            loading={locationStatus === 'loading'}
            onPress={() => {
              setIsLocationCentered(true);
              setSearchCenter(null);
              // Recenter on the last known location now, then again on the fresh fix.
              setRecenterRequest((count) => count + 1);
              void refreshLocation().then(() => setRecenterRequest((count) => count + 1));
            }}
            selected={isLocationCentered}
          />
        </Animated.View>
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.safeArea}>
          <View pointerEvents="box-none" style={styles.header}>
            <SearchHeader
              onProfilePress={() => setActiveView({ name: 'profile' })}
              onSearchPress={showSearch}
            />
            {hasResumableTrip ? (
              <View style={styles.resumeCardWrap}>
                <ResumeTripCard
                  destination={trip.active?.destination.label ?? trip.recovery?.destination.label ?? 'destination'}
                  instruction={resumeGuidance?.currentAction ?? (trip.status === 'recovery' ? 'Exact route needs recovery' : undefined)}
                  onResume={() => setActiveView({ name: 'enroute' })}
                />
              </View>
            ) : null}
            {/* An occasional ask (feedback or a tip) beside the line layers button, under the profile button. */}
            <View pointerEvents="box-none" style={styles.underSearch}>
              {nudge.kind ? <NudgeBanner kind={nudge.kind} onAct={nudge.act} onDismiss={nudge.dismiss} style={styles.nudge} /> : <View pointerEvents="none" style={styles.nudge} />}
              <MapControlButton
                accessibilityLabel="Lines on the map"
                icon="modes"
                onPress={() => setLayersOpen(true)}
                selected={lineChoice.groups.length > 0 || lineChoice.routes.length > 0}
                style={styles.layersButton}
                testID="line-layers-button"
              />
            </View>
          </View>
        </SafeAreaView>

        <TransitSheet
          activeTab={homeTab}
          findRoute={findRoute}
          mapHeight={mapHeight}
          nearbyRoutes={nearbyRoutes}
          nearbyRefreshing={nearbyStatus.status === 'loaded' && nearbyStatus.refreshing === true}
          nearbyStatus={nearbyStatus.status}
          onAddSavedPlace={uid ? () => addSavedPlace('favorites') : undefined}
          onOpenRecentTrip={openRecentTrip}
          onOpenSavedLocation={openSavedLocation}
          onOpenRoute={openRoute}
          onTabChange={setHomeTab}
          onVisibleRouteIdsChange={setVisibleRouteIds}
          recentTrips={trip.recents}
          savedLocations={savedLocations}
          savedNearbyRouteIds={savedNearbyRouteIds}
          savedRouteIds={savedRouteIds}
          scrollY={homeScrollY}
        />
        {savePlaceSheet}
        <LineLayersSheet choice={lineChoice} lines={layerCandidates} onChange={changeLineChoice} onClose={() => setLayersOpen(false)} visible={layersOpen} />
        <SavedPlaceDetailsSheet
          onClose={() => setMapPlaces([])}
          onEdit={uid ? (place) => {
            setMapPlaces([]);
            editSavedPlace(place);
          } : undefined}
          onGo={goToSavedPlaceFromMap}
          places={mapPlaces}
        />
        <ConfirmDialog
          body={`${arrivedDestination ?? 'Your destination'} has been added to Recents.`}
          cancelLabel="Stay on Home"
          confirmLabel="View Recents"
          onCancel={() => setArrivedDestination(null)}
          onConfirm={() => {
            setArrivedDestination(null);
            setHomeTab('recents');
          }}
          testID="trip-arrived"
          title="You’ve arrived"
          visible={arrivedDestination !== null}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  hydration: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.canvas },
  hydrationText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 15 },
  safeArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 30,
  },
  header: { paddingTop: 10, paddingHorizontal: 16 },
  resumeCardWrap: { marginTop: 8 },
  // Centered under the 54 px profile button.
  underSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  nudge: { flex: 1 },
  layersButton: { marginRight: 4 },
  locationButton: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
    elevation: 4,
    alignItems: 'center',
    gap: 10,
  },
  reorientButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  compassNeedle: {
    alignItems: 'center',
  },
  needleNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.red,
  },
  needleSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.mutedInk,
  },
  tapCoords: { position: 'absolute', alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.ink, zIndex: 4 },
  tapCoordsText: { color: colors.surface, fontFamily: fontFamilies.bold, fontSize: 13 },
  searchCenter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    width: SEARCH_CENTER_SIZE,
    height: SEARCH_CENTER_SIZE,
    // Pathly itself marks the point it's searching around: a round pin in the brand blue's
    // surface, distinct from the rider's location dot.
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: SEARCH_CENTER_SIZE / 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  locationStatusPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  locationStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    maxWidth: '100%',
  },
  locationStatusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

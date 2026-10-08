import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyRouteLive } from '../data/applyRouteLive';
import { favoriteTripKey, type FavoriteTrip } from '../data/favorites';
import { NEARBY_CACHE_KEY, readCache, writeCache } from '../data/deviceCache';
import { discoveredRouteToRouteDetail, fetchNearbyTransit, filterOutPinnedDuplicates, type DiscoveredRoute } from '../data/nearbyTransit';
import { TransitLiveProvider, useTransitLive } from '../data/TransitLiveContext';
import {
  recentTripById,
  routes,
  type ItineraryId,
  type RecentTripId,
  type RouteDetail,
  type TripTimeChoice,
} from '../data/transit';
import { useCurrentLocation, type Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { ThemedStatusBar, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { CurrentLocationButton } from './CurrentLocationButton';
import { DeparturesView } from './DeparturesView';
import { GoogleMapView, type HomeMapCamera } from './GoogleMapView';
import { PressableScale } from './PressableScale';
import { ProfileView } from './ProfileView';
import { RecentTripDetailView } from './RecentTripDetailView';
import { RouteDetailView } from './RouteDetailView';
import { CURRENT_LOCATION_LABEL, initialResultsCriteria, RouteResultsView, type ResultsCriteria } from './RouteResultsView';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet, type TransitTabId } from './TransitSheet';

const TRANSIT_TABS_HEIGHT = 44;
const TRANSIT_CARD_HEIGHT = 104;
const VISIBLE_TRANSIT_CARDS = 3;
const VISIBLE_CARD_GUTTER = 24;
const MINIMUM_MAP_HEIGHT = 240;
// Height reserved for the floating search header at the top of the map.
const HEADER_INSET = 80;
// Same footprint as the blue current-location dot (CurrentLocationMarker).
const SEARCH_CENTER_SIZE = 17;
const NEARBY_SEARCH_DEBOUNCE_MS = 600;
// A cached nearby list older than a day is more misleading than helpful.
const NEARBY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type ResultsViewState = { name: 'results'; criteria: ResultsCriteria; returnTo: 'search' | 'favorites' };

type ActiveView =
  | { name: 'home' }
  // `editing`: changing one endpoint of an open Route Results, which this search returns to.
  | { name: 'search'; editing?: { field: 'origin' | 'destination'; results: ResultsViewState } }
  // `route` is the snapshot opened, so the page never depends on the route still being nearby.
  | { name: 'route'; routeId: string; route: RouteDetail; directionIndex?: number }
  // "More departures" for one direction of an opened route; back returns to that route and direction.
  | { name: 'departures'; routeId: string; route: RouteDetail; directionIndex: number }
  | ResultsViewState
  | { name: 'recentTrip'; tripId: RecentTripId; returnTab: TransitTabId }
  | { name: 'profile' };

type ActiveTrip =
  | { kind: 'planned'; itineraryId: ItineraryId }
  | { kind: 'recent'; tripId: RecentTripId }
  | null;

function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

type RouteDetailScreenProps = {
  initialDirectionIndex?: number;
  isFavorite: boolean;
  onBack: () => void;
  onOpenDepartures: (directionIndex: number) => void;
  onRefreshLocation: () => void;
  onToggleFavorite: () => void;
  route: RouteDetail;
  location: Coordinates;
  locationKnown: boolean;
};

/** Reads live transit data itself — must render under TransitLiveProvider, which HomeScreen itself can't consume. */
function RouteDetailScreen({ initialDirectionIndex, isFavorite, location, locationKnown, onBack, onOpenDepartures, onRefreshLocation, onToggleFavorite, route }: RouteDetailScreenProps) {
  const live = useTransitLive(route.id);
  // Re-applies live data every 30 s so countdowns age and past departures drop between polls.
  const now = useNow(30_000);
  return (
    <RouteDetailView
      initialDirectionIndex={initialDirectionIndex}
      isFavorite={isFavorite}
      location={location}
      locationKnown={locationKnown}
      onBack={onBack}
      onOpenDepartures={onOpenDepartures}
      onRefreshLocation={onRefreshLocation}
      onToggleFavorite={onToggleFavorite}
      route={applyRouteLive(route, live, now)}
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
  const [activeView, setActiveView] = useState<ActiveView>({ name: 'home' });
  const [activeTrip, setActiveTrip] = useState<ActiveTrip>(null);
  const [homeTab, setHomeTab] = useState<TransitTabId>('nearby');
  const [selectedSearchTripId, setSelectedSearchTripId] = useState<ItineraryId | null>(null);
  const [tripTime, setTripTime] = useState<TripTimeChoice>({ mode: 'now' });
  // One "Save" star replaces pin + favorite: saved routes lead Nearby and fill Favorites -> Routes.
  // Nothing is saved by default.
  const [savedRouteIds, setSavedRouteIds] = useState<readonly string[]>([]);
  const [favoriteTrips, setFavoriteTrips] = useState<readonly FavoriteTrip[]>([]);
  const { height } = useWindowDimensions();
  const { location, refresh: refreshLocation, status: locationStatus } = useCurrentLocation();
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
  const nearbyPoint = searchCenter ?? location;
  const exploring = searchCenter != null;
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
    const savedRoutes = savedRouteIds.map((id) => routes.find((route) => route.id === id)).filter((route): route is RouteDetail => route != null);
    return filterOutPinnedDuplicates(allDiscoveredRoutes, savedRoutes);
  }, [allDiscoveredRoutes, savedRouteIds]);

  // Resolves either kind of id a card/pin/favorite can hold: the demo catalog's own (routeById)
  // or a dynamically-discovered one — so opening, pinning, or favoriting works the same way
  // regardless of where a route came from. Deliberately searches `allDiscoveredRoutes`, not
  // the pin-filtered `nearbyRoutes` — a just-pinned route must stay resolvable by id even
  // though it's no longer shown in the Nearby section itself.
  const findRoute = useCallback(
    (routeId: string): RouteDetail | undefined => routes.find((route) => route.id === routeId) ?? allDiscoveredRoutes.find((route) => route.id === routeId),
    [allDiscoveredRoutes],
  );

  const openRoute = useCallback((routeId: string) => {
    const route = findRoute(routeId);
    if (route) setActiveView({ name: 'route', routeId, route });
  }, [findRoute]);

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
    setSelectedSearchTripId(null);
    setActiveView({ name: 'search' });
  }, []);
  const showRouteResults = useCallback((destination: string) => {
    setSelectedSearchTripId(null);
    setActiveView({ name: 'results', criteria: initialResultsCriteria(destination), returnTo: 'search' });
  }, []);
  const showFavorites = useCallback(() => {
    setHomeTab('favorites');
    setActiveView({ name: 'home' });
  }, []);
  const isTripFavorite = useCallback(
    (trip: FavoriteTrip) => favoriteTrips.some((item) => favoriteTripKey(item) === favoriteTripKey(trip)),
    [favoriteTrips],
  );
  const toggleTripFavorite = useCallback((trip: FavoriteTrip) => {
    setFavoriteTrips((current) =>
      current.some((item) => favoriteTripKey(item) === favoriteTripKey(trip))
        ? current.filter((item) => favoriteTripKey(item) !== favoriteTripKey(trip))
        : [...current, trip],
    );
  }, []);
  const openFavoriteTrip = useCallback((trip: FavoriteTrip) => {
    if (trip.kind === 'recent') {
      setActiveView({ name: 'recentTrip', tripId: trip.tripId, returnTab: 'favorites' });
      return;
    }
    setTripTime(trip.time);
    setSelectedSearchTripId(trip.itineraryId);
    setActiveView({ name: 'results', criteria: initialResultsCriteria(trip.destination), returnTo: 'favorites' });
  }, []);
  const showRecents = useCallback(() => {
    setHomeTab('recents');
    setActiveView({ name: 'home' });
  }, []);
  const showRecentTrip = useCallback((tripId: RecentTripId) => {
    setHomeTab('recents');
    setActiveView({ name: 'recentTrip', tripId, returnTab: 'recents' });
  }, []);
  const startRecentTrip = useCallback((tripId: RecentTripId) => {
    setActiveTrip({ kind: 'recent', tripId });
    setActiveView((current) => ({
      name: 'recentTrip',
      tripId,
      returnTab: current.name === 'recentTrip' ? current.returnTab : 'recents',
    }));
  }, []);
  const closeRecentTrip = useCallback(() => {
    const returnTab = activeView.name === 'recentTrip' ? activeView.returnTab : 'recents';
    setHomeTab(returnTab);
    setActiveView({ name: 'home' });
  }, [activeView]);
  const endRecentTrip = useCallback(() => {
    setActiveTrip(null);
    if (activeView.name === 'recentTrip') {
      closeRecentTrip();
      return;
    }
    showRecents();
  }, [activeView.name, closeRecentTrip, showRecents]);
  const showPlannedTrip = useCallback((itineraryId: ItineraryId) => {
    setSelectedSearchTripId(itineraryId);
  }, []);
  const closePlannedTrip = useCallback(() => {
    setSelectedSearchTripId(null);
    if (activeView.name === 'results' && activeView.returnTo === 'favorites') {
      showFavorites();
    }
  }, [activeView, showFavorites]);
  const closeResults = useCallback(() => {
    if (activeView.name === 'results' && activeView.returnTo === 'favorites') {
      showFavorites();
      return;
    }
    showSearch();
  }, [activeView, showFavorites, showSearch]);
  const startPlannedTrip = useCallback((itineraryId: ItineraryId) => {
    setActiveTrip({ kind: 'planned', itineraryId });
    setSelectedSearchTripId(itineraryId);
  }, []);
  const endPlannedTrip = useCallback(() => {
    setActiveTrip(null);
    setSelectedSearchTripId(null);
  }, []);

  const closeCurrentView = useCallback(() => {
    if (activeView.name === 'results') {
      if (selectedSearchTripId) {
        closePlannedTrip();
        return;
      }
      closeResults();
      return;
    }

    if (activeView.name === 'recentTrip') {
      closeRecentTrip();
      return;
    }

    if (activeView.name === 'search' && activeView.editing) {
      setActiveView(activeView.editing.results);
      return;
    }

    if (activeView.name === 'departures') {
      const { directionIndex, route, routeId } = activeView;
      setActiveView({ name: 'route', routeId, route, directionIndex });
      return;
    }

    showHome();
  }, [activeView, closePlannedTrip, closeRecentTrip, closeResults, selectedSearchTripId, showHome]);

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
    : activeView.name === 'recentTrip'
      ? `recent-${activeView.tripId}`
      : activeView.name;
  // The open route keeps receiving live data even after it drops out of the nearby list.
  const openedRoute = activeView.name === 'route' || activeView.name === 'departures' ? activeView.route : null;
  const liveRoutes = openedRoute && !allDiscoveredRoutes.some((route) => route.id === openedRoute.id)
    ? [...allDiscoveredRoutes, openedRoute]
    : allDiscoveredRoutes;
  const activeLiveRouteIds = activeView.name === 'home' ? visibleRouteIds : openedRoute ? [openedRoute.id] : [];
  const screen = (node: ReactNode) => (
    <TransitLiveProvider activeRouteIds={activeLiveRouteIds} extraRoutes={liveRoutes} location={nearbyPoint}>
      <ScreenTransition key={transitionKey}>{node}</ScreenTransition>
    </TransitLiveProvider>
  );

  if (activeView.name === 'search') {
    const { editing } = activeView;
    if (editing) {
      // The same search page, changing one endpoint of the open Route Results; every other trip
      // criterion is kept, and cancel returns to it unchanged.
      const { field, results } = editing;
      const current = results.criteria[field];
      const choose = (value: string) => setActiveView({ ...results, criteria: { ...results.criteria, [field]: value } });
      return screen(
        <SearchView
          initialQuery={current === CURRENT_LOCATION_LABEL ? '' : current}
          onCancel={() => setActiveView(results)}
          onSelect={(place) => choose(place.title)}
          onSelectCurrentLocation={field === 'origin' ? () => choose(CURRENT_LOCATION_LABEL) : undefined}
        />
      );
    }
    return screen(
      <SearchView
        onCancel={showHome}
        onSelect={(place) => showRouteResults(place.title)}
      />
    );
  }

  if (activeView.name === 'route') {
    const { routeId } = activeView;
    // Prefer the freshest copy, but keep the opened snapshot if the route has since dropped out
    // of the nearby list (the rider moved), so the page stays open.
    const route = findRoute(routeId) ?? activeView.route;
    return screen(
      <RouteDetailScreen
        initialDirectionIndex={activeView.directionIndex}
        isFavorite={savedRouteIds.includes(routeId)}
        onBack={showHome}
        onOpenDepartures={(directionIndex) => setActiveView({ name: 'departures', routeId, route, directionIndex })}
        onRefreshLocation={() => void refreshLocation()}
        location={location}
        locationKnown={locationStatus === 'located'}
        onToggleFavorite={() => setSavedRouteIds((current) => toggleItem(current, routeId))}
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
      <RouteResultsView
        activeItineraryId={activeTrip?.kind === 'planned' ? activeTrip.itineraryId : null}
        criteria={activeView.criteria}
        isTripFavorite={(itineraryId, destination) => isTripFavorite({ kind: 'planned', itineraryId, destination, time: tripTime })}
        onBack={closeResults}
        onChangeCriteria={(criteria) => setActiveView((current) => (current.name === 'results' ? { ...current, criteria } : current))}
        onChangeTripTime={setTripTime}
        onCloseTrip={closePlannedTrip}
        onEditEndpoint={(field) => setActiveView({ name: 'search', editing: { field, results: activeView } })}
        onEndTrip={endPlannedTrip}
        onOpenTrip={showPlannedTrip}
        onStartTrip={startPlannedTrip}
        onToggleTripFavorite={(itineraryId, destination) => toggleTripFavorite({ kind: 'planned', itineraryId, destination, time: tripTime })}
        selectedItineraryId={selectedSearchTripId}
        tripTime={tripTime}
      />
    );
  }

  if (activeView.name === 'recentTrip') {
    return screen(
      <RecentTripDetailView
        isActive={activeTrip?.kind === 'recent' && activeTrip.tripId === activeView.tripId}
        isFavorite={isTripFavorite({ kind: 'recent', tripId: activeView.tripId })}
        onBack={closeRecentTrip}
        onEnd={endRecentTrip}
        onStart={() => startRecentTrip(activeView.tripId)}
        onToggleFavorite={() => toggleTripFavorite({ kind: 'recent', tripId: activeView.tripId })}
        trip={recentTripById[activeView.tripId]}
      />
    );
  }

  if (activeView.name === 'profile') {
    return screen(<ProfileView onBack={showHome} />);
  }

  return screen(
    <View style={styles.viewport}>
      <ThemedStatusBar />
      <View style={styles.screen}>
        <GoogleMapView
          initialCamera={homeCamera}
          location={location}
          onCameraChange={setHomeCamera}
          onUserMoveEnd={setSearchCenter}
          onUserPan={() => setIsLocationCentered(false)}
          onOrientationChange={setMapOrientation}
          padding={{ top: HEADER_INSET, bottom: height - mapHeight }}
          recenterRequest={recenterRequest}
          reorientRequest={reorientRequest}
        />
        {searchCenter ? (
          // Fixed at the center of the visible map (below the header, above the resting sheet):
          // the point Nearby is currently searching around.
          <View
            accessibilityLabel="Searching nearby transit around the map center"
            pointerEvents="none"
            style={[styles.searchCenter, { top: (HEADER_INSET + mapHeight) / 2 - SEARCH_CENTER_SIZE / 2 }]}
            testID="search-center"
          />
        ) : null}
        {locationStatus !== 'located' ? (
          <View pointerEvents="none" style={[styles.locationStatusPill, { top: 80 }]}>
            <View style={styles.locationStatusBadge}>
              {locationStatus === 'loading' ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={styles.locationStatusText}>
                {locationStatus === 'loading' ? 'Finding your location…' : 'Location unavailable — showing Stony Brook'}
              </Text>
            </View>
          </View>
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
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <SearchHeader
              onProfilePress={() => setActiveView({ name: 'profile' })}
              onSearchPress={showSearch}
            />
          </View>
        </SafeAreaView>

        <TransitSheet
          activeTripId={activeTrip?.kind === 'recent' ? activeTrip.tripId : null}
          activeTab={homeTab}
          favoriteTrips={favoriteTrips}
          findRoute={findRoute}
          mapHeight={mapHeight}
          nearbyRoutes={nearbyRoutes}
          nearbyRefreshing={nearbyStatus.status === 'loaded' && nearbyStatus.refreshing === true}
          nearbyStatus={nearbyStatus.status}
          onOpenFavoriteTrip={openFavoriteTrip}
          onOpenRoute={openRoute}
          onOpenTrip={showRecentTrip}
          onEndTrip={endRecentTrip}
          onStartTrip={startRecentTrip}
          onTabChange={setHomeTab}
          onVisibleRouteIdsChange={setVisibleRouteIds}
          savedRouteIds={savedRouteIds}
          scrollY={homeScrollY}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  safeArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 30,
  },
  header: { paddingTop: 10, paddingHorizontal: 16 },
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
  // Solid purple with a white ring, matching the GPS dot's look so it reads as a map point.
  searchCenter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    width: SEARCH_CENTER_SIZE,
    height: SEARCH_CENTER_SIZE,
    borderWidth: 3,
    borderRadius: SEARCH_CENTER_SIZE / 2,
    borderColor: colors.white,
    backgroundColor: colors.searchCenter,
    shadowColor: colors.searchCenter,
    shadowOpacity: 0.32,
    shadowRadius: 5,
    elevation: 3,
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
    borderRadius: 16,
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

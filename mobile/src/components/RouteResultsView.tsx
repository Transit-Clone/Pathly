import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SearchPlace } from '../data/placesSearch';
import { formatTripTimeChoice, type RoutePreference, type TripTimeChoice } from '../data/transit';
import {
  badgeMode,
  CURRENT_LOCATION_LABEL,
  fareLabel,
  type TripFare,
  filterItinerariesByMode,
  filterItinerariesByWalk,
  formatDurationMinutes,
  requestModes,
  formatTripClock,
  lineBadge,
  tripDayLabel,
  distinctRouteItineraries,
  orderItineraries,
  transitSteps,
  tripMinutes,
  type Itinerary,
  type LatLng,
  type ResumePlanRequest,
} from '../data/tripPlanning';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useClock } from '../hooks/useClock';
import { useTripPlan } from '../hooks/useTripPlan';
import { DEFAULT_PREFERENCES, useUserPreferences, type UserPreferences } from '../data/userPreferences';
import { useAppSettings, ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition, useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { useNotStepFreeTrips } from '../data/accessibleStops';
import { FareSheet } from './FareSheet';
import { DetailMapPage } from './DetailMapPage';
import { Icon, type IconName } from './Icon';
import { LeaveTimeSheet } from './LeaveTimeSheet';
import { LiveSignal } from './LiveSignal';
import { stopLineBadges } from './SearchView';
import { PlannedTripDetailView } from './PlannedTripDetailView';
import { Mascot } from './Mascot';
import { MapControlButton } from './MapControlButton';
import { mapPageMapHeight } from './mapSheetLayout';
import { PressableScale } from './PressableScale';
import { RouteBadge, type TransitMode } from './RouteBadge';
import { FiltersSheet, ModesSheet } from './RouteOptionsSheet';
import { ItinerarySkeleton } from './Skeleton';
import { TripMap } from './TripMap';
import { radii } from '../theme/shape';

/** What the rider has chosen on Route Results; kept by HomeScreen so it survives a trip to the search page. */
export type ResultsCriteria = {
  origin: string;
  /** The searched place behind `origin`, when it came from search (not "Current location"). */
  originPlace?: SearchPlace;
  destination: string;
  /** The searched place behind `destination`, when it came from search; it's what the star saves. */
  destinationPlace?: SearchPlace;
  preference: RoutePreference;
  enabledModes: readonly TransitMode[];
};

export { CURRENT_LOCATION_LABEL };

/** A new search's criteria, starting from the rider's travel preferences (Settings -> Travel preferences). */
export function initialResultsCriteria(destination: string, destinationPlace?: SearchPlace, travel: UserPreferences['travel'] = DEFAULT_PREFERENCES.travel): ResultsCriteria {
  return {
    origin: CURRENT_LOCATION_LABEL,
    destination,
    destinationPlace,
    // Travel preferences set the starting sort; Fewer transfers wins, as it does with Google.
    preference: travel.fewerTransfers ? 'transfers' : travel.allowWalking ? 'fastest' : 'walking',
    enabledModes: travel.modes.length > 0 ? [...travel.modes] : ['subway', 'bus', 'rail', 'ferry'],
  };
}

type RouteResultsViewProps = {
  criteria: ResultsCriteria;
  /** Whether the trip's destination is in the rider's saved locations (the trip page's star). */
  isDestinationSaved: boolean;
  /** True until the first location fix resolves; "Current location" trips wait for it. */
  locationPending: boolean;
  onBack: () => void;
  onChangeCriteria: (criteria: ResultsCriteria) => void;
  onChangeTripTime: (choice: TripTimeChoice) => void;
  onCloseTrip: () => void;
  /** Opens the destination search page to change one endpoint. */
  onEditEndpoint: (field: 'origin' | 'destination') => void;
  onOpenTrip: (itinerary: Itinerary, resumeRequest: ResumePlanRequest) => void;
  onStartTrip: (itinerary: Itinerary) => void;
  onToggleSaveDestination: () => void;
  /** The rider's real position for a "Current location" origin; null when unknown. */
  riderLocation: Coordinates | null;
  /** The opened trip: a snapshot, so refreshing results never changes it. */
  selectedItinerary: Itinerary | null;
  tripTime: TripTimeChoice;
};

const preferences: { id: RoutePreference; label: string; icon: IconName }[] = [
  { id: 'fastest', label: 'Fastest', icon: 'flash' },
  { id: 'transfers', label: 'Less transfers', icon: 'transfer' },
  { id: 'walking', label: 'Less walking', icon: 'travel' },
  { id: 'cheapest', label: 'Lowest fare', icon: 'fare' },
];

const transitModes: { id: TransitMode; label: string; icon: IconName }[] = [
  { id: 'subway', label: 'Subway', icon: 'subway' },
  { id: 'bus', label: 'Bus', icon: 'bus' },
  { id: 'rail', label: 'LIRR', icon: 'rail' },
  // Google can't be asked to avoid ferries, so this one only filters the results.
  { id: 'ferry', label: 'Ferry', icon: 'ferry' },
];

const ALL_MODES: readonly TransitMode[] = ['subway', 'bus', 'rail', 'ferry'];

/** Room kept on the map below the trip card for its refresh button. */
const BELOW_TRIP_CARD = 120;
/** Walks at least this long show in a result's steps; shorter ones are just getting between platforms. */
const SHOWN_WALK_SECONDS = 3 * 60;
/** Live signals stay on for this long after the last successful update. */
const LIVE_FRESH_MS = 2 * 60_000;

/** A searched place's coordinates (saved places without any are stored as [0, 0]). */
const placePoint = (place: SearchPlace | undefined): LatLng | null => (
  place?.location && (place.location.latitude !== 0 || place.location.longitude !== 0)
    ? { lat: place.location.latitude, lng: place.location.longitude }
    : null
);

const PROBLEM_COPY = {
  'no-origin': { title: 'Choose a starting point', body: "Your location isn't available, so pick where you're starting from.", action: 'Choose start' },
  'needs-place': { title: 'Pick this place from search', body: 'Choose the place from search so Pathly knows exactly where it is.', action: 'Search' },
  'out-of-area': { title: "Outside Pathly's area", body: 'Pathly plans trips within New York City, Nassau, and Suffolk.', action: null },
  unavailable: { title: "Couldn't load trips", body: 'Check your connection and try again.', action: 'Try again' },
} as const;

export function RouteResultsView({
  criteria,
  isDestinationSaved,
  locationPending,
  onBack,
  onChangeCriteria,
  onChangeTripTime,
  onCloseTrip,
  onEditEndpoint,
  onOpenTrip,
  onStartTrip,
  onToggleSaveDestination,
  riderLocation,
  selectedItinerary,
  tripTime,
}: RouteResultsViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { fontScale, height } = useWindowDimensions();
  // Fare and minutes keep the first row's right side at any width (the badges wrap instead).
  const stackLargeTextMetrics = fontScale >= 1.5;
  const { easyMode } = useAppSettings();
  const { destination, enabledModes, origin, preference } = criteria;
  const { stepFree, travel: travelPreferences } = useUserPreferences().preferences;
  const setPreference = (next: RoutePreference) => onChangeCriteria({ ...criteria, preference: next });
  const setEnabledModes = (update: readonly TransitMode[] | ((current: readonly TransitMode[]) => readonly TransitMode[])) => (
    onChangeCriteria({ ...criteria, enabledModes: typeof update === 'function' ? update(enabledModes) : update })
  );
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  // Modes, Filters, and Leave now each open a popup from the bottom of the screen.
  const [openPanel, setOpenPanel] = useState<'modes' | 'filter' | null>(null);
  // The map's location button: each press centers the map on the rider, until they drag it.
  const [centerRequest, setCenterRequest] = useState(0);
  const [centered, setCentered] = useState(false);
  const userLocation = riderLocation ? { lat: riderLocation.latitude, lng: riderLocation.longitude } : null;

  // The map rests at the home screen's height, but always leaves room for the trip card's buttons.
  const insets = useSafeAreaInsets();
  const [fareSheetFor, setFareSheetFor] = useState<TripFare | undefined>(undefined);
  const [tripCardBottom, setTripCardBottom] = useState(insets.top + 120);
  const mapHeight = Math.max(mapPageMapHeight(height), tripCardBottom + BELOW_TRIP_CARD);
  // Trip times follow an admin's mock clock, like the plans themselves.
  const now = useClock(30_000);

  const swapEndpoints = () => onChangeCriteria({
    ...criteria,
    origin: destination,
    originPlace: criteria.destinationPlace,
    destination: origin,
    destinationPlace: criteria.originPlace,
  });

  const { state: plan, refresh } = useTripPlan({
    endpoints: { origin, originPlace: criteria.originPlace, destination, destinationPlace: criteria.destinationPlace },
    time: tripTime,
    preference,
    modes: requestModes(enabledModes),
    lessWalking: !travelPreferences.allowWalking,
    location: riderLocation,
    locationPending,
  });
  const planned = useMemo(() => (plan.status === 'loaded' ? plan.itineraries : []), [plan]);
  const resumeRequest = plan.status === 'loaded' ? plan.resumeRequest : null;
  const { maxWalkMinutes } = travelPreferences;
  const { visibleItineraries, walkLimitMissed } = useMemo(() => {
    const byMode = filterItinerariesByMode(planned, enabledModes);
    const withinWalk = filterItinerariesByWalk(byMode, maxWalkMinutes);
    return {
      visibleItineraries: distinctRouteItineraries(orderItineraries(withinWalk ?? byMode, preference, travelPreferences.fareType)),
      // Every trip walks longer than the rider's limit, so all of them show with a note.
      walkLimitMissed: maxWalkMinutes !== null && withinWalk === null && byMode.length > 0,
    };
  }, [enabledModes, maxWalkMinutes, planned, preference, travelPreferences.fareType]);
  const notStepFree = useNotStepFreeTrips(visibleItineraries, stepFree);
  // Trips a wheelchair can't finish go last; the order is otherwise kept.
  const listedItineraries = notStepFree.size === 0 ? visibleItineraries : [...visibleItineraries].sort((a, b) => Number(notStepFree.has(a.id)) - Number(notStepFree.has(b.id)));
  const modesFiltered = enabledModes.length < ALL_MODES.length;
  const tripDay = tripTime.mode === 'now' ? '' : tripDayLabel(tripTime, new Date(now));
  // Live signals only while the last update is fresh: offline, refreshes fail and it ages out.
  const liveFresh = plan.status === 'loaded' && !plan.refreshing && now - plan.fetchedAt < LIVE_FRESH_MS;
  const updatedLabel = plan.status !== 'loaded'
    ? ''
    : plan.refreshing
      ? 'Updating…'
      : now - plan.fetchedAt < 60_000 ? 'Updated just now' : `Updated ${Math.round((now - plan.fetchedAt) / 60_000)} min ago`;
  const storedOriginPoint = placePoint(criteria.originPlace);
  const originPoint = storedOriginPoint ?? (origin === CURRENT_LOCATION_LABEL
    ? (riderLocation ? { lat: riderLocation.latitude, lng: riderLocation.longitude } : null)
    : null);

  const ease = useLayoutEase();
  const toggleMode = (mode: TransitMode) => {
    ease();
    setEnabledModes((current) => {
      if (!current.includes(mode)) return ALL_MODES.filter((item) => item === mode || current.includes(item));
      return current.length === 1 ? current : current.filter((item) => item !== mode);
    });
  };

  if (selectedItinerary) {
    return (
      <ScreenTransition key="trip">
        <PlannedTripDetailView
          destination={destination}
          destinationAddress={criteria.destinationPlace?.subtitle}
          destinationLines={stopLineBadges(criteria.destinationPlace)}
          liveFresh={liveFresh}
          isActive={false}
          isFavorite={isDestinationSaved}
          itinerary={selectedItinerary}
          onBack={onCloseTrip}
          onEnd={() => undefined}
          onStart={onStartTrip}
          onToggleFavorite={onToggleSaveDestination}
          origin={origin}
          riderLocation={riderLocation}
        />
      </ScreenTransition>
    );
  }

  const problem = plan.status === 'problem' ? PROBLEM_COPY[plan.problem] : null;

  const mapButtons = (
    <>
      <MapControlButton
        accessibilityLabel="Center on current location"
        icon="locate"
        onPress={() => {
          setCenterRequest((count) => count + 1);
          setCentered(true);
        }}
        selected={centered}
        testID="results-location"
      />
    </>
  );

  const tripCard = (
    <View onLayout={(event) => setTripCardBottom(insets.top + event.nativeEvent.layout.y + event.nativeEvent.layout.height)} style={styles.tripRow}>
      <MapControlButton accessibilityLabel="Back to destination search" icon="back" onPress={onBack} style={styles.backButton} testID="results-back" />

      <View style={styles.criteriaCard}>
        <View style={styles.endpointStack}>
          <View style={styles.endpointRow}>
            <View style={[styles.endpointDot, { backgroundColor: colors.success }]} />
            {/* Each endpoint opens the destination search page, rather than taking typed text. */}
            <PressableScale
              accessibilityHint="Opens search to change the start"
              accessibilityLabel={`Trip origin, ${origin}`}
              accessibilityRole="button"
              onPress={() => onEditEndpoint('origin')}
              style={styles.endpointField}
              testID="origin-field"
            >
              <Text numberOfLines={1} style={styles.endpointInput}>{origin}</Text>
            </PressableScale>
          </View>
          <View style={styles.endpointConnector} />
          <View style={styles.endpointRow}>
            <View style={[styles.endpointDot, { backgroundColor: colors.primary }]} />
            <PressableScale
              accessibilityHint="Opens search to change the destination"
              accessibilityLabel={`Trip destination, ${destination}`}
              accessibilityRole="button"
              onPress={() => onEditEndpoint('destination')}
              style={styles.endpointField}
              testID="destination-field"
            >
              <Text numberOfLines={1} style={styles.endpointInput}>{destination}</Text>
            </PressableScale>
          </View>
        </View>
        <PressableScale
          accessibilityLabel="Swap origin and destination"
          accessibilityRole="button"
          onPress={swapEndpoints}
          style={styles.swapButton}
          testID="swap-endpoints"
        >
          <Icon name="swap" size={20} />
        </PressableScale>
      </View>
    </View>
  );

  const map = (
    <>
      <TripMap
        centerOnUserRequest={centerRequest}
        destination={placePoint(criteria.destinationPlace)}
        // Pannable and zoomable above the results sheet, which scrolls over it.
        interactive={true}
        itinerary={visibleItineraries[0] ?? null}
        onUserPan={() => setCentered(false)}
        origin={originPoint}
        padding={{ top: tripCardBottom + 24, right: 40, bottom: 24, left: 40 }}
        testID="results-map"
        userLocation={userLocation}
      />
    </>
  );

  return (
    <ScreenTransition key="list">
      <ThemedStatusBar />
      <FareSheet fare={fareSheetFor} fareType={travelPreferences.fareType} onClose={() => setFareSheetFor(undefined)} />
      <DetailMapPage
        contentTestID="results-sheet"
        controls={tripCard}
        controlsHeight={tripCardBottom - insets.top}
        // Like Route View and Trip Details: the trip card scrolls away with the map.
        controlsScrollWithMap={true}
        fitContent={true}
        handle={{ accessibilityHint: 'Expands or collapses the route list.', accessibilityLabel: 'Route list handle', testID: 'results-sheet-handle' }}
        interactiveMap={true}
        map={map}
        mapButtons={mapButtons}
        // Just below the trip card, moving with it and the sheet.
        mapOverlay={
          <View pointerEvents="box-none" style={[styles.refreshButton, { top: tripCardBottom + 12 }]}>
            <MapControlButton accessibilityLabel="Refresh route results" icon="refresh" onPress={refresh} testID="refresh-results" />
          </View>
        }
        mapHeight={mapHeight}
        mapTestID="results-map-viewport"
        scrollTestID="results-scroll"
        testID="route-results-view"
      >
        {/* Modes, Filters, then the leave time, each a popup from the bottom. */}
        <View style={styles.controls}>
          {/* Easy mode keeps Modes only while it's narrowing the results, so nothing is filtered unseen. */}
          {!easyMode || modesFiltered ? <PressableScale
            accessibilityLabel="Choose transit modes"
            accessibilityRole="button"
            accessibilityState={{ expanded: openPanel === 'modes' }}
            onPress={() => setOpenPanel('modes')}
            style={[styles.toolbarPill, (openPanel === 'modes' || modesFiltered) && styles.activePill]}
            testID="modes-control"
          >
            <Icon color={modesFiltered ? colors.primary : colors.ink} name="modes" size={15} />
            <Text style={[styles.toolbarPillText, modesFiltered && styles.activePillText]}>{modesFiltered ? `Modes · ${enabledModes.length}` : 'Modes'}</Text>
          </PressableScale> : null}
          {!easyMode ? <PressableScale
            accessibilityLabel="Filter routes"
            accessibilityRole="button"
            accessibilityState={{ expanded: openPanel === 'filter' }}
            onPress={() => setOpenPanel('filter')}
            style={[styles.toolbarPill, openPanel === 'filter' && styles.activePill]}
            testID="filter-control"
          >
            <Icon color={colors.ink} name="filter" size={15} />
            <Text style={styles.toolbarPillText}>Filters</Text>
          </PressableScale> : null}
          <PressableScale
            accessibilityLabel="Change leave time"
            accessibilityRole="button"
            onPress={() => setTimeSheetOpen(true)}
            style={[styles.toolbarPill, tripTime.mode !== 'now' && styles.activePill]}
            testID="leave-time-control"
          >
            <Icon color={tripTime.mode === 'now' ? colors.ink : colors.primary} name="time" size={15} />
            <Text numberOfLines={1} style={[styles.toolbarPillText, tripTime.mode !== 'now' && styles.activePillText]} testID="leave-time-label">
              {formatTripTimeChoice(tripTime)}{tripDay ? ` ${tripDay}` : ''}
            </Text>
          </PressableScale>
        </View>

        <Text accessibilityLiveRegion="polite" style={styles.updated} testID="results-updated">{updatedLabel}</Text>

        <View style={styles.results}>
          {plan.status === 'loading' ? <ItinerarySkeleton /> : null}
          {plan.status === 'problem' && problem ? (
            <View accessibilityLiveRegion="polite" style={styles.emptyResults} testID={`results-${plan.problem}`}>
              <Mascot mood="worried" size={64} />
              <Text style={styles.emptyTitle}>{problem.title}</Text>
              <Text style={styles.emptyBody}>{problem.body}</Text>
              {problem.action ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => (plan.problem === 'unavailable' ? refresh() : onEditEndpoint(plan.field ?? 'origin'))}
                  style={styles.resetButton}
                  testID="results-problem-action"
                >
                  <Text style={styles.resetText}>{problem.action}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
          {plan.status === 'loaded' && planned.length === 0 ? (
            <View accessibilityLiveRegion="polite" style={styles.emptyResults} testID="results-none">
              <Mascot mood="sad" size={64} />
              <Text style={styles.emptyTitle}>No transit trips found</Text>
              <Text style={styles.emptyBody}>{`There's no transit for this trip at ${tripTime.mode === 'now' ? 'this time' : 'the time you picked'}.`}</Text>
              <PressableScale accessibilityRole="button" onPress={() => setTimeSheetOpen(true)} style={styles.resetButton} testID="results-change-time">
                <Text style={styles.resetText}>Change time</Text>
              </PressableScale>
            </View>
          ) : null}
          {plan.status === 'loaded' && planned.length > 0 && visibleItineraries.length === 0 ? (
            <View accessibilityLiveRegion="polite" style={styles.emptyResults} testID="results-empty">
              <Icon color={colors.mutedInk} name="modes" size={28} />
              <Text style={styles.emptyTitle}>No routes match these modes</Text>
              <PressableScale accessibilityRole="button" onPress={() => {
                ease();
                setEnabledModes(ALL_MODES);
              }} style={styles.resetButton} testID="results-reset-modes">
                <Text style={styles.resetText}>Show all modes</Text>
              </PressableScale>
            </View>
          ) : null}
          {walkLimitMissed ? (
            <Text accessibilityLiveRegion="polite" style={styles.walkLimitNote} testID="results-walk-limit-note">
              {`Every trip walks more than your ${maxWalkMinutes}-minute limit, so all are shown.`}
            </Text>
          ) : null}
          {listedItineraries.map((itinerary) => {
            const legs = transitSteps(itinerary);
            // The ride badges in order, with a walk icon wherever there's real walking to do.
            const parts = itinerary.steps.filter((step) => step.kind === 'transit' || step.durationSeconds >= SHOWN_WALK_SECONDS);
            const duration = formatDurationMinutes(tripMinutes(itinerary.durationSeconds));
            const fare = fareLabel(itinerary.fare, travelPreferences.fareType);
            const leavesIn = Math.round((Date.parse(itinerary.departureTime) - now) / 60_000);
            const span = `${formatTripClock(itinerary.departureTime)} - ${formatTripClock(itinerary.arrivalTime)}`;
            const leaves = leavesIn > 0 ? `Leave within ${leavesIn} min` : 'Leave now';
            const timing = tripTime.mode === 'now' ? `${leaves} · ${span}` : span;
            // The first ride's live feed is tracking it, so "Leave within" follows the real vehicle.
            const leavesLive = liveFresh && tripTime.mode === 'now' && legs[0]?.live?.status === 'tracked';
            return (
              <View key={itinerary.id} style={styles.itinerary} testID={`itinerary-${itinerary.id}`}>
                <PressableScale
                  accessibilityHint="Opens the complete trip plan"
                  accessibilityLabel={`View trip details to ${destination}, ${duration.accessibility}, ${fare}, ${timing}`}
                  accessibilityRole="button"
                  onPress={() => {
                    if (resumeRequest) onOpenTrip(itinerary, resumeRequest);
                  }}
                  style={styles.itineraryPressable}
                  testID={`search-result-view-${itinerary.id}`}
                >
                  <View style={[styles.itineraryTop, stackLargeTextMetrics && styles.itineraryTopLargeText]} testID={`search-result-layout-${itinerary.id}`}>
                    <View style={[styles.segmentColumn, stackLargeTextMetrics && styles.segmentColumnLargeText]}>
                      <View style={styles.segmentRow}>
                        {legs.length === 0 && parts.length === 0 ? <Icon color={colors.mutedInk} name="travel" size={18} /> : null}
                        {parts.map((step, partIndex) => (
                          <View key={`${step.kind}-${partIndex}`} style={styles.segmentGroup}>
                            {step.kind === 'walk' ? (
                              <Icon color={colors.mutedInk} name="travel" size={18} testID={`itinerary-walk-${itinerary.id}-${partIndex}`} />
                            ) : (
                              <RouteBadge
                                agency={step.agency.name}
                                alert={!!step.alerts?.length}
                                color={step.line.color ?? colors.primary}
                                mode={badgeMode(step)}
                                shortName={lineBadge(step)}
                                size="small"
                                textColor={step.line.textColor}
                              />
                            )}
                            {partIndex < parts.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={14} /> : null}
                          </View>
                        ))}
                      </View>
                      {leavesLive ? (
                        <View accessibilityLabel={`${timing}, live`} accessible={true} style={styles.nextRideLive} testID={`schedule-${itinerary.id}`}>
                          {/* On a narrow card the times wrap whole onto the next line. */}
                          <View style={styles.nextRideLeave}>
                            <Text style={styles.nextRide}>{leaves}</Text>
                            <LiveSignal color={colors.green} style={styles.nextRideSignal} />
                            <Text style={styles.nextRide}>{' · '}</Text>
                          </View>
                          <Text style={styles.nextRide}>{span}</Text>
                        </View>
                      ) : (
                        <Text style={styles.nextRide} testID={`schedule-${itinerary.id}`}>{timing}</Text>
                      )}
                    </View>
                    {notStepFree.has(itinerary.id) ? (
                      <View style={styles.notStepFree} testID={`not-step-free-${itinerary.id}`}>
                        <Icon color={colors.red} name="wheelchair" size={13} />
                        <Text style={styles.notStepFreeText}>{`No step-free access at ${notStepFree.get(itinerary.id)!.join(', ')}`}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.summary, stackLargeTextMetrics && styles.summaryLargeText]}>
                      {itinerary.fare ? (
                        <PressableScale accessibilityHint="Explains how this fare adds up" accessibilityRole="button" hitSlop={8} onPress={() => setFareSheetFor(itinerary.fare)} testID={`fare-button-${itinerary.id}`}>
                          <Text style={styles.fare} testID={`fare-${itinerary.id}`}>{fare}</Text>
                        </PressableScale>
                      ) : <Text style={styles.fare} testID={`fare-${itinerary.id}`}>{fare}</Text>}
                      <View style={styles.durationGroup}>
                        <Text accessibilityLabel={duration.accessibility} style={styles.duration} testID={`search-result-duration-${itinerary.id}`}>
                          {/* Big numbers, small units: "2hr 26m" reads as 2 hr 26 m. */}
                          {duration.visible.match(/\d+|\D+/g)?.map((part, partIndex) => (
                            /^\d/.test(part) ? part : <Text key={partIndex} style={styles.durationUnit}>{part}</Text>
                          ))}
                        </Text>
                      </View>
                    </View>
                  </View>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </DetailMapPage>

      {openPanel === 'modes' ? <ModesSheet enabled={enabledModes} modes={transitModes} onClose={() => setOpenPanel(null)} onToggle={toggleMode} /> : null}
      {openPanel === 'filter' ? (
        <FiltersSheet
          onClose={() => setOpenPanel(null)}
          onSelect={(next) => {
            ease();
            setPreference(next);
            setOpenPanel(null);
          }}
          options={preferences}
          selected={preference}
        />
      ) : null}
      {timeSheetOpen ? (
        <LeaveTimeSheet
          onCancel={() => setTimeSheetOpen(false)}
          onConfirm={(choice) => {
            onChangeTripTime(choice);
            setTimeSheetOpen(false);
          }}
          value={tripTime}
        />
      ) : null}
    </ScreenTransition>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  criteriaCard: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 9, paddingVertical: 8, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 8, paddingLeft: 19, paddingRight: 12 },
  // Centered where Search keeps its back arrow, so the two sit under the same thumb.
  backButton: { marginTop: 4 },
  refreshButton: { position: 'absolute', right: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingHorizontal: 14 },
  // Modes, Filters, and the leave time share the row equally; a long leave time is cut short.
  toolbarPill: { height: 36, minWidth: 0, flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  toolbarPillText: { flexShrink: 1, color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 11 },
  updated: { alignSelf: 'flex-end', paddingTop: 8, paddingHorizontal: 16, color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  results: { gap: 8, padding: 12, paddingTop: 6, paddingBottom: 30 },
  endpointStack: { minWidth: 0, flex: 1 },
  endpointRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  endpointDot: { width: 10, height: 10, borderRadius: 5 },
  endpointConnector: { width: 2, height: 7, marginLeft: 4, backgroundColor: colors.border },
  endpointField: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  endpointInput: { minWidth: 0, flex: 1, paddingVertical: 7, color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  swapButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  activePill: { borderColor: colors.primary, backgroundColor: colors.blueSoft },
  activePillText: { color: colors.primary },
  emptyResults: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, ...typography.bodyStrong },
  emptyBody: { maxWidth: 280, color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  walkLimitNote: { marginHorizontal: 16, marginBottom: 8, color: colors.mutedInk, ...typography.metadata },
  resetButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.primary },
  resetText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  itinerary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface },
  itineraryPressable: { paddingHorizontal: 12, paddingVertical: 10 },
  itineraryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itineraryTopLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  segmentColumn: { minWidth: 0, flex: 1 },
  segmentColumnLargeText: { flexGrow: 0 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notStepFree: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  notStepFreeText: { flexShrink: 1, color: colors.red, ...typography.metadata, fontSize: 11 },
  nextRide: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  nextRideLive: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  nextRideLeave: { flexDirection: 'row', alignItems: 'flex-start' },
  nextRideSignal: { marginTop: 3, marginLeft: 1, transform: [{ scale: 0.8 }] },
  summary: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLargeText: { justifyContent: 'space-between' },
  fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  durationGroup: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end' },
  duration: { flexShrink: 1, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 28, textAlign: 'right' },
  durationUnit: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 12 },
});

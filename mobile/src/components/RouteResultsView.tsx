import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SearchPlace } from '../data/placesSearch';
import { formatTripTimeChoice, type RoutePreference, type TripTimeChoice } from '../data/transit';
import {
  badgeMode,
  CURRENT_LOCATION_LABEL,
  fareLabel,
  filterItinerariesByMode,
  formatDurationMinutes,
  requestModes,
  formatTripClock,
  lineBadge,
  nextOccurrence,
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
import { ThemedStatusBar, useAppSettings, useTheme, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition, useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { Icon, type IconName } from './Icon';
import { LeaveTimeSheet } from './LeaveTimeSheet';
import { PlannedTripDetailView } from './PlannedTripDetailView';
import { PressableScale } from './PressableScale';
import { RouteBadge, type TransitMode } from './RouteBadge';
import { ItinerarySkeleton } from './Skeleton';
import { TripMap } from './TripMap';

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

export function initialResultsCriteria(destination: string, destinationPlace?: SearchPlace): ResultsCriteria {
  return { origin: CURRENT_LOCATION_LABEL, destination, destinationPlace, preference: 'fastest', enabledModes: ['subway', 'bus', 'rail', 'ferry'] };
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

const preferences: { id: RoutePreference; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'transfers', label: 'Fewer transfers' },
  { id: 'cheapest', label: 'Lowest fare' },
];

const transitModes: { id: TransitMode; label: string; icon: IconName }[] = [
  { id: 'subway', label: 'Subway', icon: 'subway' },
  { id: 'bus', label: 'Bus', icon: 'bus' },
  { id: 'rail', label: 'LIRR', icon: 'rail' },
  // Google can't be asked to avoid ferries, so this one only filters the results.
  { id: 'ferry', label: 'Ferry', icon: 'ferry' },
];

const ALL_MODES: readonly TransitMode[] = ['subway', 'bus', 'rail', 'ferry'];

/** The results sheet's top at rest, as a share of the screen; expanded, it stops below the trip card. */
const SHEET_REST_SHARE = 0.44;
/** Space kept between the trip card and an expanded sheet. */
const SHEET_EXPANDED_GAP = 10;
/** A drag shorter than this (points) is a tap on the handle. */
const HANDLE_TAP_SLOP = 6;
/** Walks at least this long show in a result's steps; shorter ones are just getting between platforms. */
const SHOWN_WALK_SECONDS = 3 * 60;

type OptionsPanel = 'modes' | 'filter' | null;

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
  const { fontScale, height, width } = useWindowDimensions();
  const stackLargeTextMetrics = fontScale >= 1.5 || width <= 360;
  const { destination, enabledModes, origin, preference } = criteria;
  const setPreference = (next: RoutePreference) => onChangeCriteria({ ...criteria, preference: next });
  const setEnabledModes = (update: readonly TransitMode[] | ((current: readonly TransitMode[]) => readonly TransitMode[])) => (
    onChangeCriteria({ ...criteria, enabledModes: typeof update === 'function' ? update(enabledModes) : update })
  );
  const [openPanel, setOpenPanel] = useState<OptionsPanel>(null);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  // The map's location button: each press centers the map on the rider, until they drag it.
  const [centerRequest, setCenterRequest] = useState(0);
  const [centered, setCentered] = useState(false);
  const userLocation = riderLocation ? { lat: riderLocation.latitude, lng: riderLocation.longitude } : null;

  // The results sheet's handle, as on Home: tap to expand or collapse, or drag it between the two.
  const insets = useSafeAreaInsets();
  const { reducedMotionActive } = useAppSettings();
  const [tripCardBottom, setTripCardBottom] = useState(insets.top + 120);
  const restTop = height * SHEET_REST_SHARE;
  const expandedTop = Math.min(restTop, tripCardBottom + SHEET_EXPANDED_GAP);
  const [sheetTop] = useState(() => new Animated.Value(restTop));
  const sheetExpanded = useRef(false);
  const dragStart = useRef(restTop);
  const sheetBounds = useRef({ restTop, expandedTop });
  const settleSheet = (expanded: boolean) => {
    sheetExpanded.current = expanded;
    const toValue = expanded ? sheetBounds.current.expandedTop : sheetBounds.current.restTop;
    if (reducedMotionActive) sheetTop.setValue(toValue);
    else Animated.spring(sheetTop, { toValue, speed: 18, bounciness: 2, useNativeDriver: false }).start();
  };
  const settleRef = useRef(settleSheet);
  useEffect(() => {
    sheetBounds.current = { restTop, expandedTop };
    settleRef.current = settleSheet;
  });
  // The refs are only read inside gesture callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [handleResponder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      sheetTop.stopAnimation((value) => {
        dragStart.current = value;
      });
    },
    onPanResponderMove: (_event, gesture) => {
      const { expandedTop: top, restTop: rest } = sheetBounds.current;
      sheetTop.setValue(Math.min(rest, Math.max(top, dragStart.current + gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const { expandedTop: top, restTop: rest } = sheetBounds.current;
      if (Math.abs(gesture.dy) < HANDLE_TAP_SLOP) {
        settleRef.current(!sheetExpanded.current);
        return;
      }
      // A flick decides by its direction; a slow drag by which position is nearer.
      const position = dragStart.current + gesture.dy;
      settleRef.current(Math.abs(gesture.vy) > 0.5 ? gesture.vy < 0 : position < (top + rest) / 2);
    },
    onPanResponderTerminate: () => settleRef.current(sheetExpanded.current),
  }));
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
    location: riderLocation,
    locationPending,
  });
  const planned = useMemo(() => (plan.status === 'loaded' ? plan.itineraries : []), [plan]);
  const resumeRequest = plan.status === 'loaded' ? plan.resumeRequest : null;
  const visibleItineraries = useMemo(
    () => orderItineraries(filterItinerariesByMode(planned, enabledModes), preference),
    [enabledModes, planned, preference],
  );
  const modesFiltered = enabledModes.length < ALL_MODES.length;
  const tomorrow = tripTime.mode !== 'now' && nextOccurrence(tripTime.minutes, new Date(now)).tomorrow;
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
  const togglePanel = (panel: Exclude<OptionsPanel, null>) => {
    ease();
    setOpenPanel((current) => (current === panel ? null : panel));
  };
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

  return (
    <ScreenTransition key="list">
    <View style={styles.viewport}>
      <View style={styles.screen} testID="route-results-view">
        <ThemedStatusBar />
        <TripMap
          centerOnUserRequest={centerRequest}
          destination={placePoint(criteria.destinationPlace)}
          // Pannable and zoomable above the results sheet, which covers the rest.
          interactive={true}
          itinerary={visibleItineraries[0] ?? null}
          onUserPan={() => setCentered(false)}
          origin={originPoint}
          padding={{ top: 140, right: 40, bottom: height * 0.58, left: 40 }}
          testID="results-map"
          userLocation={userLocation}
        />

        <SafeAreaView edges={['top']} onLayout={(event) => setTripCardBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)} style={styles.topOverlay}>
          <View style={styles.tripRow}>
            <PressableScale
              accessibilityLabel="Back to destination search"
              accessibilityRole="button"
              onPress={onBack}
              style={styles.backButton}
              testID="results-back"
            >
              <Icon name="back" size={26} />
            </PressableScale>

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
        </SafeAreaView>

        <View style={styles.mapLocation}>
          <CurrentLocationButton
            onPress={() => {
              setCenterRequest((count) => count + 1);
              setCentered(true);
            }}
            selected={centered}
            testID="results-location"
          />
        </View>

        <Animated.View style={[styles.resultsSheet, { top: sheetTop }]} testID="results-sheet">
        <SafeAreaView edges={['bottom']} style={styles.resultsSheetInner}>
          <View
            accessibilityHint="Expands or collapses the route list."
            accessibilityLabel="Route list handle"
            accessibilityRole="button"
            accessible={true}
            onAccessibilityTap={() => settleSheet(!sheetExpanded.current)}
            style={styles.dragHandle}
            testID="results-sheet-handle"
            {...handleResponder.panHandlers}
          >
            <View style={styles.dragHandleGrip} />
          </View>
          <View style={styles.controls}>
            <PressableScale
              accessibilityLabel="Choose transit modes"
              accessibilityRole="button"
              accessibilityState={{ expanded: openPanel === 'modes' }}
              onPress={() => togglePanel('modes')}
              style={[styles.toolbarPill, (openPanel === 'modes' || modesFiltered) && styles.activePill]}
              testID="modes-control"
            >
              <Icon color={modesFiltered ? colors.primary : colors.ink} name="modes" size={15} />
              <Text style={[styles.toolbarPillText, modesFiltered && styles.activePillText]}>{modesFiltered ? `Modes · ${enabledModes.length}` : 'Modes'}</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Filter routes"
              accessibilityRole="button"
              accessibilityState={{ expanded: openPanel === 'filter' }}
              onPress={() => togglePanel('filter')}
              style={[styles.toolbarPill, openPanel === 'filter' && styles.activePill]}
              testID="filter-control"
            >
              <Icon color={colors.ink} name="filter" size={15} />
              <Text style={styles.toolbarPillText}>Filter</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Refresh route results"
              accessibilityRole="button"
              onPress={refresh}
              style={styles.refreshButton}
              testID="refresh-results"
            >
              <Icon name="refresh" size={19} />
            </PressableScale>
            <PressableScale
              accessibilityLabel="Change leave time"
              accessibilityRole="button"
              onPress={() => setTimeSheetOpen(true)}
              style={[styles.leaveControl, tripTime.mode !== 'now' && styles.activePill]}
              testID="leave-time-control"
            >
              <Icon color={tripTime.mode === 'now' ? colors.ink : colors.primary} name="time" size={15} />
              <Text numberOfLines={1} style={[styles.leaveTime, tripTime.mode !== 'now' && styles.activePillText]} testID="leave-time-label">
                {formatTripTimeChoice(tripTime)}{tomorrow ? ' tomorrow' : ''}
              </Text>
            </PressableScale>
          </View>

          {openPanel === 'modes' ? <View style={styles.preferences} testID="modes-panel">
            {transitModes.map((item) => {
              const selected = enabledModes.includes(item.id);
              return (
                <PressableScale
                  key={item.id}
                  accessibilityLabel={`${item.label} routes`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleMode(item.id)}
                  style={[styles.preference, styles.modeChip, selected && styles.selectedPreference]}
                  testID={`mode-${item.id}`}
                >
                  <Icon color={selected ? colors.onPrimary : colors.mutedInk} filled={selected} name={item.icon} size={14} />
                  <Text style={[styles.preferenceText, selected && styles.selectedPreferenceText]}>{item.label}</Text>
                </PressableScale>
              );
            })}
          </View> : null}

          {openPanel === 'filter' ? <View style={styles.preferences} testID="filter-panel">
            {preferences.map((item) => {
              const selected = item.id === preference;
              return (
                <PressableScale
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    ease();
                    setPreference(item.id);
                  }}
                  style={[styles.preference,
                    selected && styles.selectedPreference]}
                  testID={`preference-${item.id}`}
                >
                  <Text style={[styles.preferenceText, selected && styles.selectedPreferenceText]}>
                    {item.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View> : null}

          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>Best routes</Text>
            <Text accessibilityLiveRegion="polite" style={styles.updated} testID="results-updated">{updatedLabel}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
            {plan.status === 'loading' ? <ItinerarySkeleton /> : null}
            {plan.status === 'problem' && problem ? (
              <View accessibilityLiveRegion="polite" style={styles.emptyResults} testID={`results-${plan.problem}`}>
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
            {visibleItineraries.map((itinerary) => {
              const legs = transitSteps(itinerary);
              // The ride badges in order, with a walk icon wherever there's real walking to do.
              const parts = itinerary.steps.filter((step) => step.kind === 'transit' || step.durationSeconds >= SHOWN_WALK_SECONDS);
              const duration = formatDurationMinutes(tripMinutes(itinerary.durationSeconds));
              const fare = fareLabel(itinerary.fare);
              const leavesIn = Math.round((Date.parse(itinerary.departureTime) - now) / 60_000);
              const span = `${formatTripClock(itinerary.departureTime)} - ${formatTripClock(itinerary.arrivalTime)}`;
              const timing = tripTime.mode === 'now' ? `${leavesIn > 0 ? `Leaves in ${leavesIn} min` : 'Leave now'} · ${span}` : span;
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
                          {legs.length === 0 && parts.length === 0 ? <Icon color={colors.mutedInk} filled={true} name="travel" size={18} /> : null}
                          {parts.map((step, partIndex) => (
                            <View key={`${step.kind}-${partIndex}`} style={styles.segmentGroup}>
                              {step.kind === 'walk' ? (
                                <Icon color={colors.mutedInk} filled={true} name="travel" size={18} testID={`itinerary-walk-${itinerary.id}-${partIndex}`} />
                              ) : (
                                <RouteBadge
                                  agency={step.agency.name}
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
                        <Text style={styles.nextRide} testID={`schedule-${itinerary.id}`}>{timing}</Text>
                      </View>
                      <View style={[styles.summary, stackLargeTextMetrics && styles.summaryLargeText]}>
                        <Text style={styles.fare} testID={`fare-${itinerary.id}`}>{fare}</Text>
                        <View style={styles.durationGroup}>
                          <Text accessibilityLabel={duration.accessibility} style={styles.duration} testID={`search-result-duration-${itinerary.id}`}>{duration.visible}</Text>
                        </View>
                      </View>
                    </View>
                  </PressableScale>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
        </Animated.View>

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
      </View>
    </View>
    </ScreenTransition>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  topOverlay: { zIndex: 4 },
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8, paddingHorizontal: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  criteriaCard: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 9, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
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
  mapLocation: { position: 'absolute', top: '35%', right: 16, zIndex: 2 },
  resultsSheetInner: { flex: 1 },
  dragHandle: { height: 24, alignItems: 'center', justifyContent: 'center' },
  dragHandleGrip: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  resultsSheet: { position: 'absolute', right: 0, bottom: 0, left: 0, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingHorizontal: 14 },
  // Modes, Filter, and the leave time share the row equally; a long leave time is cut short.
  toolbarPill: { height: 36, minWidth: 0, flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  toolbarPillText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 10 },
  leaveControl: { minWidth: 0, height: 36, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 18, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
  leaveTime: { flexShrink: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 10 },
  refreshButton: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  preferences: { flexDirection: 'row', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  preference: { minHeight: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  selectedPreference: { borderColor: colors.primary, backgroundColor: colors.primary },
  preferenceText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 10, textAlign: 'center' },
  selectedPreferenceText: { color: colors.onPrimary },
  modeChip: { flexDirection: 'row', gap: 5 },
  activePill: { borderColor: colors.primary, backgroundColor: colors.blueSoft },
  activePillText: { color: colors.primary },
  emptyResults: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, ...typography.bodyStrong },
  emptyBody: { maxWidth: 280, color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  resetButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary },
  resetText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 16 },
  resultTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  updated: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  results: { gap: 8, padding: 12, paddingTop: 9, paddingBottom: 30 },
  itinerary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  itineraryPressable: { paddingHorizontal: 12, paddingVertical: 10 },
  itineraryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itineraryTopLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  segmentColumn: { minWidth: 0, flex: 1 },
  segmentColumnLargeText: { flexGrow: 0 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextRide: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  summary: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLargeText: { justifyContent: 'space-between' },
  fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  durationGroup: { minWidth: 0, flexShrink: 1, alignItems: 'flex-end' },
  duration: { flexShrink: 1, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 28, textAlign: 'right' },
});

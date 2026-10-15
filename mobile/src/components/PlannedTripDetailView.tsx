import { useMemo, useState } from 'react';

import { legDepartureOptions, quickDepartureOptions, retimeItinerary, type DepartureChoices, type LegDepartureOption } from '../data/tripDepartures';

import {
  badgeMode,
  fareLabel,
  formatTripClock,
  lineBadge,
  tripMinutes,
  type Itinerary,
  type LatLng,
  type TransitStep,
  type WalkStep,
} from '../data/tripPlanning';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useClock } from '../hooks/useClock';
import { useTheme } from '../theme/AppSettings';
import { SharedTripDetailView, type TripDetailDeparture, type TripDetailLeg, type TripDetailModel, type TripDetailWalk } from './SharedTripDetailView';
import { TripMap } from './TripMap';

type PlannedTripDetailViewProps = {
  destination: string;
  isActive: boolean;
  isFavorite: boolean;
  itinerary: Itinerary;
  onBack: () => void;
  onEnd: () => void;
  /** Starts the trip as shown, with any departures the rider picked. */
  onStart: (itinerary: Itinerary) => void;
  onToggleFavorite: () => void;
  origin: string;
  /** The rider's real position, for the map's location button; null when unknown. */
  riderLocation?: Coordinates | null;
};

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** "0.4 mi", or feet for short walks ("250 ft"). */
export function formatWalkDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
  return `${Math.max(50, Math.round((meters * FEET_PER_METER) / 50) * 50)} ft`;
}

function walkRow(step: WalkStep): TripDetailWalk {
  return { minutes: tripMinutes(step.durationSeconds), distance: formatWalkDistance(step.distanceMeters), toName: step.toName };
}

function departureRow(option: LegDepartureOption): TripDetailDeparture {
  return { key: option.departs, time: formatTripClock(option.departs), arriveTime: formatTripClock(option.arrives), selected: option.selected, reachable: option.reachable };
}

/**
 * A real itinerary in the shared trip-detail shape: walks, legs, and the waits between them.
 * `departures` are each transit leg's departure choices (legDepartureOptions), by leg.
 */
export function toTripDetailModel(itinerary: Itinerary, origin: string, destination: string, isActive: boolean, primary: string, departures: readonly LegDepartureOption[][] = []): TripDetailModel {
  const legs: TripDetailLeg[] = [];
  let pendingWalk: WalkStep | null = null;
  let previous: TransitStep | null = null;
  let walkAfter: TripDetailWalk | undefined;

  for (const step of itinerary.steps) {
    if (step.kind === 'walk') {
      pendingWalk = step;
      continue;
    }
    const walkBefore = pendingWalk ? walkRow(pendingWalk) : undefined;
    const waitSeconds = previous
      ? (Date.parse(step.from.time) - Date.parse(previous.to.time)) / 1000 - (pendingWalk?.durationSeconds ?? 0)
      : undefined;
    const options = departures[legs.length] ?? [];
    legs.push({
      agency: step.agency.name,
      ...(options.length > 1 ? { departures: options.map(departureRow), quickDepartures: quickDepartureOptions(options).map(departureRow) } : {}),
      routeId: step.line.name,
      color: step.line.color ?? primary,
      ...(step.line.textColor ? { textColor: step.line.textColor } : {}),
      mode: badgeMode(step),
      direction: step.headsign ? `Toward ${step.headsign}` : step.line.name,
      ...(step.headsign ? { headsign: step.headsign } : {}),
      stopCount: step.stopCount,
      ...(step.stops && step.stops.length > 0 ? { stops: step.stops.map((stop) => ({ name: stop.name, time: formatTripClock(stop.time), point: stop.location })) } : {}),
      durationMinutes: tripMinutes(step.durationSeconds),
      routeName: step.line.name,
      shortName: lineBadge(step),
      startName: step.from.name,
      startTime: formatTripClock(step.from.time),
      endName: step.to.name,
      endTime: formatTripClock(step.to.time),
      ...(walkBefore ? { walkBefore } : {}),
      ...(waitSeconds !== undefined ? { waitBeforeMinutes: Math.max(0, Math.round(waitSeconds / 60)) } : {}),
    });
    pendingWalk = null;
    previous = step;
  }
  if (pendingWalk) walkAfter = walkRow(pendingWalk);

  return {
    id: itinerary.id,
    destination,
    origin,
    fare: fareLabel(itinerary.fare),
    durationMinutes: tripMinutes(itinerary.durationSeconds),
    transferCount: itinerary.transfers,
    leaveTime: formatTripClock(itinerary.departureTime),
    arriveTime: formatTripClock(itinerary.arrivalTime),
    contextLabel: isActive ? 'ACTIVE TRIP' : 'PLANNED TRIP',
    statusLabel: isActive ? 'In progress' : 'Ready',
    legs,
    ...(walkAfter ? { walkAfter } : {}),
  };
}

export function PlannedTripDetailView({ destination, isActive, isFavorite, itinerary: planned, onBack, onEnd, onStart, onToggleFavorite, origin, riderLocation }: PlannedTripDetailViewProps) {
  const { colors } = useTheme();
  // A stop pressed in a leg's stop list; the counter repeats a focus on the same stop.
  const [focusStop, setFocusStop] = useState<{ point: LatLng; key: number } | null>(null);
  // The location button: each press centers the map on the rider, until they drag it.
  const [centerRequest, setCenterRequest] = useState(0);
  const [centered, setCentered] = useState(false);
  const userLocation = riderLocation ? { lat: riderLocation.latitude, lng: riderLocation.longitude } : null;
  // Departures the rider picked from the legs' boxes; the trip's times follow them.
  const [choices, setChoices] = useState<DepartureChoices>(new Map());
  // Which departures can still be made moves with the (admin-mockable) clock.
  const now = useClock(30_000);
  const itinerary = useMemo(() => retimeItinerary(planned, choices, now), [choices, now, planned]);
  const departures = useMemo(() => legDepartureOptions(planned, choices, now), [choices, now, planned]);
  return (
    <SharedTripDetailView
      interactiveMap={true}
      actionLabel={isActive ? 'End current trip' : `Start trip to ${destination}`}
      backLabel="Back to route results"
      isFavorite={isFavorite}
      locationSelected={centered}
      map={(
        <TripMap
          centerOnUserRequest={centerRequest}
          focusStop={focusStop}
          interactive={true}
          itinerary={itinerary}
          onUserPan={() => setCentered(false)}
          padding={{ top: 76, right: 24, bottom: 36, left: 24 }}
          testID="search-trip-route-map"
          userLocation={userLocation}
        />
      )}
      model={toTripDetailModel(itinerary, origin, destination, isActive, colors.primary, departures)}
      onAction={isActive ? onEnd : () => onStart(itinerary)}
      onBack={onBack}
      onCenterOnLocation={() => {
        setCenterRequest((count) => count + 1);
        setCentered(true);
      }}
      onSelectDeparture={(legIndex, departs) => setChoices((current) => new Map(current).set(legIndex, departs))}
      onFocusStop={(stop) => setFocusStop((current) => ({ point: stop.point, key: (current?.key ?? 0) + 1 }))}
      onToggleFavorite={onToggleFavorite}
      rootTestID={`search-trip-detail-${itinerary.id}`}
      showServiceAlerts={false}
      testPrefix="search-trip"
    />
  );
}

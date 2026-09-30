import {
  itineraryById,
  scheduleItinerary,
  formatClockTime,
  formatTripTimeChoice,
  type ItineraryId,
  type RecentTripId,
  type TripTimeChoice,
} from './transit';

export type FavoriteTrip =
  | { kind: 'recent'; tripId: RecentTripId }
  | { kind: 'planned'; destination: string; itineraryId: ItineraryId; time: TripTimeChoice };

export function favoriteTripKey(trip: FavoriteTrip) {
  return trip.kind === 'recent' ? `recent-${trip.tripId}` : `planned-${trip.itineraryId}-${trip.destination}`;
}

export type TripCardLeg = {
  agency: string;
  alightTime: string;
  boardTime: string;
  color: string;
  shortName: string;
};

export type TripCardData = {
  destination: string;
  durationMinutes: number;
  fare: string;
  legs: readonly TripCardLeg[];
  origin: string;
  recency: string;
};

/** Presents a saved planned itinerary with the same card shape as a recent trip. */
export function plannedTripCardData(trip: Extract<FavoriteTrip, { kind: 'planned' }>): TripCardData {
  const itinerary = itineraryById[trip.itineraryId];
  const schedule = scheduleItinerary(itinerary, trip.time);
  return {
    destination: trip.destination,
    durationMinutes: itinerary.durationMinutes,
    fare: itinerary.fare,
    origin: 'Current location',
    recency: formatTripTimeChoice(trip.time),
    legs: itinerary.segments.map((segment, index) => ({
      agency: segment.agency,
      color: segment.color,
      shortName: segment.shortName,
      boardTime: index === 0 ? formatClockTime(schedule.departure) : '',
      alightTime: index === itinerary.segments.length - 1 ? formatClockTime(schedule.arrival) : '',
    })),
  };
}

import { realFareForItinerary } from '../data/lirrFares';
import { formatClockTime, type Itinerary, type ItinerarySchedule } from '../data/transit';
import { SharedTripDetailView, type TripDetailModel } from './SharedTripDetailView';

type PlannedTripDetailViewProps = {
  destination: string;
  isActive: boolean;
  isFavorite: boolean;
  itinerary: Itinerary;
  onBack: () => void;
  onEnd: () => void;
  onStart: () => void;
  onToggleFavorite: () => void;
  schedule: ItinerarySchedule;
};

function toTripDetailModel(destination: string, itinerary: Itinerary, schedule: ItinerarySchedule, isActive: boolean): TripDetailModel {
  const segmentDuration = Math.max(12, Math.floor((itinerary.durationMinutes - itinerary.transfers * 8) / itinerary.segments.length));
  return {
    id: itinerary.id,
    destination,
    origin: 'Current location',
    fare: realFareForItinerary(itinerary),
    durationMinutes: itinerary.durationMinutes,
    detailNote: schedule.label,
    transferCount: itinerary.transfers,
    leaveTime: formatClockTime(schedule.departure),
    arriveTime: formatClockTime(schedule.arrival),
    contextLabel: isActive ? 'ACTIVE TRIP' : 'PLANNED TRIP',
    statusLabel: isActive ? 'In progress' : 'Ready',
    legs: itinerary.segments.map((segment, index) => {
      const start = schedule.departure + index * (segmentDuration + 8);
      const end = start + segmentDuration;
      return {
        agency: segment.agency,
        routeId: segment.id,
        color: segment.color,
        direction: `${segment.direction} toward ${segment.destination}`,
        durationMinutes: segmentDuration,
        endLabel: index === itinerary.segments.length - 1 ? 'GET OFF' : 'TRANSFER',
        endName: segment.destination,
        endTime: formatClockTime(end),
        routeName: segment.routeName,
        shortName: segment.shortName,
        startLabel: index === 0 ? 'START' : 'TRANSFER',
        startName: index === 0 ? 'Current location' : `Connect to ${segment.shortName}`,
        startTime: formatClockTime(start),
      };
    }),
  };
}

export function PlannedTripDetailView({ destination, isActive, isFavorite, itinerary, onBack, onEnd, onStart, onToggleFavorite, schedule }: PlannedTripDetailViewProps) {
  return (
    <SharedTripDetailView
      actionLabel={isActive ? 'End current trip' : `Start trip to ${destination}`}
      backLabel="Back to route results"
      isFavorite={isFavorite}
      model={toTripDetailModel(destination, itinerary, schedule, isActive)}
      onAction={isActive ? onEnd : onStart}
      onBack={onBack}
      onToggleFavorite={onToggleFavorite}
      rootTestID={`search-trip-detail-${itinerary.id}`}
      testPrefix="search-trip"
    />
  );
}

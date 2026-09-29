import type { Itinerary } from '../data/transit';
import { SharedTripDetailView, type TripDetailModel } from './SharedTripDetailView';

type PlannedTripDetailViewProps = {
  destination: string;
  isActive: boolean;
  itinerary: Itinerary;
  onBack: () => void;
  onEnd: () => void;
  onStart: () => void;
};

type ClockTime = { hours: number; minutes: number };

function parseDeparture(nextRide: string): ClockTime {
  const match = nextRide.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { hours: 10, minutes: 0 };
  let hours = Number(match[1]) % 12;
  if (match[3]?.toUpperCase() === 'PM') hours += 12;
  return { hours, minutes: Number(match[2]) };
}

function addMinutes(time: ClockTime, minutesToAdd: number): ClockTime {
  const total = time.hours * 60 + time.minutes + minutesToAdd;
  return { hours: Math.floor(total / 60) % 24, minutes: total % 60 };
}

function formatTime(time: ClockTime) {
  const period = time.hours >= 12 ? 'PM' : 'AM';
  return `${time.hours % 12 || 12}:${String(time.minutes).padStart(2, '0')} ${period}`;
}

function toTripDetailModel(destination: string, itinerary: Itinerary, isActive: boolean): TripDetailModel {
  const departure = parseDeparture(itinerary.nextRide);
  const segmentDuration = Math.max(12, Math.floor((itinerary.durationMinutes - itinerary.transfers * 8) / itinerary.segments.length));
  return {
    id: itinerary.id,
    destination,
    origin: 'Current location',
    fare: itinerary.fare,
    durationMinutes: itinerary.durationMinutes,
    detailNote: itinerary.nextRide,
    transferCount: itinerary.transfers,
    leaveTime: formatTime(departure),
    arriveTime: formatTime(addMinutes(departure, itinerary.durationMinutes)),
    contextLabel: isActive ? 'ACTIVE TRIP' : 'PLANNED TRIP',
    statusLabel: isActive ? 'In progress' : 'Ready',
    legs: itinerary.segments.map((segment, index) => {
      const start = addMinutes(departure, index * (segmentDuration + 8));
      const end = addMinutes(start, segmentDuration);
      return {
        agency: segment.agency,
        color: segment.color,
        direction: `${segment.direction} toward ${segment.destination}`,
        durationMinutes: segmentDuration,
        endLabel: index === itinerary.segments.length - 1 ? 'GET OFF' : 'TRANSFER',
        endName: segment.destination,
        endTime: formatTime(end),
        routeName: segment.routeName,
        shortName: segment.shortName,
        startLabel: index === 0 ? 'START' : 'TRANSFER',
        startName: index === 0 ? 'Current location' : `Connect to ${segment.shortName}`,
        startTime: formatTime(start),
      };
    }),
  };
}

export function PlannedTripDetailView({ destination, isActive, itinerary, onBack, onEnd, onStart }: PlannedTripDetailViewProps) {
  return (
    <SharedTripDetailView
      actionLabel={isActive ? 'End current trip' : `Start trip to ${destination}`}
      backLabel="Back to route results"
      model={toTripDetailModel(destination, itinerary, isActive)}
      onAction={isActive ? onEnd : onStart}
      onBack={onBack}
      rootTestID={`search-trip-detail-${itinerary.id}`}
      testPrefix="search-trip"
    />
  );
}

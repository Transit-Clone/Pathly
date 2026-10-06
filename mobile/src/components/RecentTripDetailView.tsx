import { realFareForRecentTrip } from '../data/lirrFares';
import type { RecentTrip } from '../data/transit';
import { SharedTripDetailView, type TripDetailModel } from './SharedTripDetailView';

type RecentTripDetailViewProps = {
  isActive: boolean;
  isFavorite: boolean;
  onBack: () => void;
  onEnd: () => void;
  onStart: () => void;
  onToggleFavorite: () => void;
  trip: RecentTrip;
};

function timeToMinutes(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = Number(match[1]) % 12;
  if (match[3]?.toUpperCase() === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}

function legDuration(start: string, end: string) {
  const delta = timeToMinutes(end) - timeToMinutes(start);
  return delta >= 0 ? delta : delta + 24 * 60;
}

function toTripDetailModel(trip: RecentTrip, isActive: boolean): TripDetailModel {
  const firstLeg = trip.legs[0];
  const lastLeg = trip.legs.at(-1);
  return {
    id: trip.id,
    destination: trip.destination,
    origin: trip.origin,
    fare: realFareForRecentTrip(trip),
    durationMinutes: trip.durationMinutes,
    detailNote: isActive ? 'Started now' : trip.recency,
    transferCount: Math.max(0, trip.legs.length - 1),
    leaveTime: firstLeg?.boardTime ?? '—',
    arriveTime: lastLeg?.alightTime ?? '—',
    contextLabel: isActive ? 'ACTIVE TRIP' : `RECENT TRIP · ${trip.recency.toUpperCase()}`,
    statusLabel: isActive ? 'In progress' : 'Completed',
    legs: trip.legs.map((leg, index) => ({
      agency: leg.agency,
      routeId: leg.routeId,
      color: leg.color,
      direction: leg.direction,
      durationMinutes: legDuration(leg.boardTime, leg.alightTime),
      endLabel: index === trip.legs.length - 1 ? 'GET OFF' : 'TRANSFER',
      endName: leg.alightStop,
      endTime: leg.alightTime,
      routeName: leg.routeName,
      shortName: leg.shortName,
      startLabel: index === 0 ? 'BOARD' : 'TRANSFER',
      startName: leg.boardStop,
      startTime: leg.boardTime,
    })),
  };
}

export function RecentTripDetailView({ isActive, isFavorite, onBack, onEnd, onStart, onToggleFavorite, trip }: RecentTripDetailViewProps) {
  return (
    <SharedTripDetailView
      actionLabel={isActive ? 'End current trip' : `Start trip to ${trip.destination}`}
      backLabel="Back to Recents"
      isFavorite={isFavorite}
      model={toTripDetailModel(trip, isActive)}
      onAction={isActive ? onEnd : onStart}
      onBack={onBack}
      onToggleFavorite={onToggleFavorite}
      rootTestID={`recent-trip-detail-${trip.id}`}
      testPrefix="recent-trip"
      tone="recent"
    />
  );
}

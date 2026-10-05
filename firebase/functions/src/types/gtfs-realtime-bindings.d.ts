/** gtfs-realtime-bindings ships no types; this covers only the fields this project reads. */
declare module 'gtfs-realtime-bindings' {
  namespace transit_realtime {
    interface StopTimeEvent {
      delay?: number | null;
      time?: number | string | null;
    }

    interface StopTimeUpdate {
      stopSequence?: number | null;
      stopId?: string | null;
      arrival?: StopTimeEvent | null;
      departure?: StopTimeEvent | null;
    }

    interface TripDescriptor {
      tripId?: string | null;
      routeId?: string | null;
      directionId?: number | null;
      startDate?: string | null;
    }

    interface TripUpdate {
      trip: TripDescriptor;
      stopTimeUpdate?: StopTimeUpdate[] | null;
    }

    interface Position {
      latitude: number;
      longitude: number;
    }

    interface VehiclePosition {
      trip?: TripDescriptor | null;
      position?: Position | null;
      currentStatus?: string | null;
      currentStopSequence?: number | null;
      stopId?: string | null;
      timestamp?: number | string | null;
    }

    interface FeedEntity {
      id: string;
      tripUpdate?: TripUpdate | null;
      vehicle?: VehiclePosition | null;
    }

    interface FeedMessage {
      entity: FeedEntity[];
    }

    const FeedMessage: {
      decode(buffer: Uint8Array): FeedMessage;
    };
  }

  export { transit_realtime };
}

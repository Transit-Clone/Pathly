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
      /** GTFS-RT StopTimeUpdate.ScheduleRelationship (0 SCHEDULED, 1 SKIPPED, 2 NO_DATA). */
      scheduleRelationship?: number | null;
    }

    interface TripDescriptor {
      tripId?: string | null;
      routeId?: string | null;
      directionId?: number | null;
      startDate?: string | null;
      /** GTFS-RT TripDescriptor.ScheduleRelationship (0 SCHEDULED … 3 CANCELED). */
      scheduleRelationship?: number | null;
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

    interface TranslatedString {
      translation?: { text?: string | null; language?: string | null }[] | null;
    }

    interface TimeRange {
      start?: number | string | null;
      end?: number | string | null;
    }

    interface EntitySelector {
      agencyId?: string | null;
      routeId?: string | null;
      stopId?: string | null;
    }

    interface Alert {
      activePeriod?: TimeRange[] | null;
      informedEntity?: EntitySelector[] | null;
      headerText?: TranslatedString | null;
      descriptionText?: TranslatedString | null;
      /** GTFS-RT Alert.Effect (1 NO_SERVICE … 9 STOP_MOVED). */
      effect?: number | null;
    }

    interface FeedEntity {
      id: string;
      tripUpdate?: TripUpdate | null;
      vehicle?: VehiclePosition | null;
      alert?: Alert | null;
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

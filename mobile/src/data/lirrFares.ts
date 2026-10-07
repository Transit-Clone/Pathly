import type { Itinerary, RecentTrip, RouteDetail } from './transit';

/**
 * Real MTA fares — source: official LIRR station fare chart, effective January 4, 2026
 * (https://www.mta.info/document/194866). Stony Brook and Port Jefferson are LIRR Zone 10 —
 * the only branch stations this app boards riders at — so this only needs Zone 10's fares to
 * the two destinations riders actually transfer or arrive at: Penn Station (Zone 1) and
 * Jamaica (Zone 3).
 */
const ZONE_10_FARES = {
  penn: { peak: 21.50, offPeak: 16.00 },
  jamaica: { peak: 16.50, offPeak: 12.25 },
} as const;

/** NYC Subway flat fare (OMNY/MetroCard) — one fare covers an entire journey through the subway system, including free transfers between lines, so it's charged once per trip, not once per subway leg. */
const SUBWAY_FARE = 2.90;

/**
 * Standard LIRR peak-hour definition: weekday trains timed around the AM/PM rush (arriving
 * Manhattan 6-10am or departing Manhattan 4-8pm) are "peak"; everything else — including all
 * weekend travel — is "off-peak". Approximated here as weekday 6-10am or 4-8pm local time,
 * independent of actual travel direction.
 */
export function isLirrPeakFare(now: Date = new Date()): boolean {
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const hour = now.getHours();
  return (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20);
}

export type FareLeg = { routeId: string; lirrDestination?: keyof typeof ZONE_10_FARES };

/**
 * Real fare for a trip's legs: real Zone 10 LIRR pricing (peak vs. off-peak picked from the
 * actual current time, not a fixed guess) plus one flat subway fare if any leg is on the
 * subway. Returns null when a leg is on a route this app doesn't have real fare data for yet
 * (Suffolk County Transit's S1/51) — callers should fall back to their existing placeholder
 * rather than show a confidently wrong number for those.
 */
export function computeRealFare(legs: readonly FareLeg[], now: Date = new Date()): string | null {
  let total = 0;
  let hasSubwayLeg = false;

  for (const leg of legs) {
    if (leg.routeId === 'ronkonkoma') {
      if (!leg.lirrDestination) return null;
      const fare = ZONE_10_FARES[leg.lirrDestination];
      total += isLirrPeakFare(now) ? fare.peak : fare.offPeak;
    } else if (leg.routeId === 'e' || leg.routeId === '7') {
      hasSubwayLeg = true;
    } else {
      return null;
    }
  }

  if (hasSubwayLeg) total += SUBWAY_FARE;
  return `$${total.toFixed(2)}`;
}

/** Reads a LIRR leg's real Zone 10 destination off its plain-text alight stop — matches this app's own station name strings (e.g. "Penn Station", "Jamaica"). */
export function lirrZone10DestinationFromStop(alightStop: string): keyof typeof ZONE_10_FARES | undefined {
  if (alightStop.includes('Penn Station')) return 'penn';
  if (alightStop.includes('Jamaica')) return 'jamaica';
  return undefined;
}

/** Real fare for a recorded trip's actual legs (which already carry each leg's real alight stop), falling back to its placeholder fare if any leg is on a route without real fare data yet. */
export function realFareForRecentTrip(trip: RecentTrip, now: Date = new Date()): string {
  const legs = trip.legs.map((leg) => ({
    routeId: leg.routeId,
    lirrDestination: leg.routeId === 'ronkonkoma' ? lirrZone10DestinationFromStop(leg.alightStop) : undefined,
  }));
  return computeRealFare(legs, now) ?? trip.fare;
}

/**
 * Real fare for a planned itinerary. Itinerary segments don't carry per-leg stop names (just
 * which routes are involved), so the one itinerary that boards the LIRR ("rail-fast") is
 * treated as transferring at Jamaica — the only station the Port Jefferson Branch and the E
 * train actually share — since that's the only itinerary that combines them today.
 */
export function realFareForItinerary(itinerary: Itinerary, now: Date = new Date()): string {
  const legs = itinerary.segments.map((segment) => ({
    routeId: segment.id,
    lirrDestination: segment.id === 'ronkonkoma' ? ('jamaica' as const) : undefined,
  }));
  return computeRealFare(legs, now) ?? itinerary.fare;
}

export type RouteFare =
  | { kind: 'flat'; amount: string }
  | { kind: 'peakOffPeak'; peak: string; offPeak: string; isPeakNow: boolean; isPeakFromRealTrip: boolean }
  | null;

/**
 * Real fare for a route's own page (shown when you open a branch directly, not a specific
 * planned trip) — always priced for the route's primary/westbound-style direction (its own
 * `destination` field, e.g. Stony Brook -> Penn Station for the Port Jefferson Branch)
 * regardless of which direction tab is active, since the reverse direction either ends at the
 * same zone (no well-defined LIRR fare) or, for subway, costs the same anyway. Null for routes
 * without real fare data yet (Suffolk County Transit).
 *
 * LIRR shows both the peak and off-peak price rather than picking one, so there's nothing to
 * be confused by if it's checked at a different time of day than it's actually ridden — but
 * `isPeakNow` still says which one currently applies, so the UI can highlight it. That flag
 * prefers the real next train's own schedule classification (`nextTripPeakOffpeak`, LIRR's
 * own trips.txt peak_offpeak field — individual trips near the boundary don't always land
 * exactly on the hour) over the generic time-of-day guess, falling back to the guess only when
 * no live/static trip data is available yet (`isPeakFromRealTrip` says which happened).
 */
export function realFareForRoute(
  route: Pick<RouteDetail, 'destination' | 'id'>,
  now: Date = new Date(),
  nextTripPeakOffpeak?: boolean | null,
): RouteFare {
  if (route.id === 'ronkonkoma') {
    const destination = lirrZone10DestinationFromStop(route.destination);
    if (!destination) return null;
    const fare = ZONE_10_FARES[destination];
    const isPeakFromRealTrip = nextTripPeakOffpeak != null;
    const isPeakNow = nextTripPeakOffpeak ?? isLirrPeakFare(now);
    return {
      kind: 'peakOffPeak',
      peak: `$${fare.peak.toFixed(2)}`,
      offPeak: `$${fare.offPeak.toFixed(2)}`,
      isPeakNow,
      isPeakFromRealTrip,
    };
  }
  if (route.id === 'e' || route.id === '7') return { kind: 'flat', amount: `$${SUBWAY_FARE.toFixed(2)}` };
  return null;
}

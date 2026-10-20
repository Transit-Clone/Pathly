import { haversineMeters } from './geo';
import { isSuffolk, LIRR_AGENCY, NYC_FERRY_AGENCY } from './tripAgencies';
import type { GtfsStop } from './gtfsFeed';
import type { FareEstimator, TransitStep, TripFare } from './tripPlanning';

/**
 * Fare estimates for itineraries Google can't price (it has no fares for the LIRR, NICE, or
 * Suffolk County Transit; it does price NYC subway and bus trips, and its fare always wins).
 *
 * Sources, all effective January 4, 2026:
 *   - LIRR: MTA/Long Island Rail Road Station Fares fare chart (https://www.mta.info/document/194866):
 *     each station's zone, and zone-to-zone one-way peak and off-peak fares.
 *   - NYC Transit subway and local bus, NICE: $3.00 base fare, one free transfer within 2 hours
 *     (OMNY, including between NICE and NYC Transit); express bus $7.25.
 *   - Suffolk County Transit: $2.25, plus $0.25 once for a transfer ticket covering up to 2 more
 *     buses within 2 hours (Suffolk's GTFS fare_products.txt / fare_transfer_rules.txt), also
 *     onto NICE; NICE transfers are accepted on Suffolk buses.
 *   - NYC Ferry: $4.50 one way, $5.00 from October 19, 2026 (NYCEDC board vote, September 2026),
 *     its own ticket with no transfers to or from other systems.
 */

const OMNY_AGENCIES = new Set(['MTA New York City Transit', 'Mta Bus Company', 'MTA Bus Company', 'MTA', 'Nassau Inter-County Express']);

const OMNY_FARE_CENTS = 300;
/** NYC Ferry one-way: $4.50, then $5.00 from Sunday, October 19, 2026 (NYCEDC fare change). */
const NYC_FERRY_FARE_CHANGE = Date.parse('2026-10-19T04:00:00Z');
const nycFerryFareCents = (departsMs: number) => (departsMs >= NYC_FERRY_FARE_CHANGE ? 500 : 450);
const EXPRESS_BUS_FARE_CENTS = 725;
const SUFFOLK_FARE_CENTS = 225;
const SUFFOLK_TRANSFER_CENTS = 25;
const TRANSFER_WINDOW_MS = 2 * 60 * 60 * 1000;
// NYC express buses: X, BM, BxM, QM, and SIM routes.
const EXPRESS_BUS = /^(X|BM|BxM|QM|SIM)\d/i;

const LIRR_ZONES = [1, 3, 4, 7, 9, 10, 12, 14] as const;
type LirrZone = (typeof LIRR_ZONES)[number];

/** One-way fares in cents, [from zone][to zone], in LIRR_ZONES order (fare chart rows "One-Way Peak"/"Off-Peak"). */
const LIRR_PEAK: Record<LirrZone, number[]> = {
  1: [725, 725, 1350, 1525, 1825, 2150, 2550, 3300],
  3: [725, 600, 900, 1075, 1325, 1650, 2200, 2825],
  4: [1350, 900, 375, 375, 650, 825, 1225, 1950],
  7: [1525, 1075, 375, 375, 375, 650, 1075, 1800],
  9: [1825, 1325, 650, 375, 375, 375, 825, 1475],
  10: [2150, 1650, 825, 650, 375, 375, 375, 1050],
  12: [2550, 2200, 1225, 1075, 825, 375, 375, 725],
  14: [3300, 2825, 1950, 1800, 1475, 1050, 725, 375],
};
const LIRR_OFF_PEAK: Record<LirrZone, number[]> = {
  1: [525, 525, 1000, 1125, 1350, 1600, 1875, 2450],
  3: [525, 450, 675, 800, 975, 1225, 1625, 2100],
  4: [1000, 675, 375, 375, 650, 825, 1225, 1950],
  7: [1125, 800, 375, 375, 375, 650, 1075, 1800],
  9: [1350, 975, 650, 375, 375, 375, 825, 1475],
  10: [1600, 1225, 825, 650, 375, 375, 375, 1050],
  12: [1875, 1625, 1225, 1075, 825, 375, 375, 725],
  14: [2450, 2100, 1950, 1800, 1475, 1050, 725, 375],
};

/** Each station's fare zone (fare chart "LIRR Stations and Fare Zones"), by GTFS stop name. */
const LIRR_STATION_ZONES: Record<string, LirrZone> = Object.fromEntries(
  ([
    [1, ['Penn Station', 'Grand Central', 'Atlantic Terminal', 'Hunterspoint Avenue', 'Long Island City', 'Nostrand Avenue', 'East New York', 'Woodside', 'Forest Hills', 'Kew Gardens', 'Mets-Willets Point']],
    [3, ['Jamaica', 'Locust Manor', 'Laurelton', 'Rosedale', 'St. Albans', 'Hollis', 'Queens Village', 'Flushing Main Street', 'Murray Hill', 'Broadway', 'Auburndale', 'Bayside', 'Douglaston', 'Little Neck']],
    [4, ['Gibson', 'Hewlett', 'Woodmere', 'Cedarhurst', 'Lawrence', 'Inwood', 'Far Rockaway', 'Lynbrook', 'Valley Stream', 'Westwood', 'Malverne', 'Lakeview', 'Hempstead Gardens', 'West Hempstead', 'Belmont Park', 'Elmont-UBS Arena', 'Bellerose', 'Stewart Manor', 'Floral Park', 'Nassau Boulevard', 'New Hyde Park', 'Garden City', 'Country Life Press', 'Merillon Avenue', 'Hempstead', 'Mineola', 'East Williston', 'Great Neck', 'Manhasset', 'Plandome', 'Port Washington']],
    [7, ['Centre Avenue', 'East Rockaway', 'Oceanside', 'Island Park', 'Long Beach', 'Rockville Centre', 'Baldwin', 'Freeport', 'Merrick', 'Bellmore', 'Wantagh', 'Seaford', 'Massapequa', 'Massapequa Park', 'Carle Place', 'Westbury', 'Hicksville', 'Bethpage', 'Farmingdale', 'Syosset', 'Albertson', 'Roslyn', 'Greenvale', 'Glen Head', 'Sea Cliff', 'Glen Street', 'Glen Cove', 'Locust Valley', 'Oyster Bay']],
    [9, ['Amityville', 'Copiague', 'Lindenhurst', 'Babylon', 'Pinelawn', 'Wyandanch', 'Deer Park', 'Cold Spring Harbor', 'Huntington', 'Greenlawn', 'Northport']],
    [10, ['Bay Shore', 'Islip', 'Great River', 'Oakdale', 'Sayville', 'Patchogue', 'Brentwood', 'Central Islip', 'Ronkonkoma', 'Medford', 'Kings Park', 'Smithtown', 'St. James', 'Stony Brook', 'Port Jefferson']],
    [12, ['Bellport', 'Mastic-Shirley', 'Speonk', 'Yaphank-BNL']],
    [14, ['Westhampton', 'Hampton Bays', 'Southampton', 'Bridgehampton', 'East Hampton', 'Amagansett', 'Montauk', 'Riverhead', 'Mattituck', 'Southold', 'Greenport']],
  ] as [LirrZone, string[]][]).flatMap(([zone, names]) => names.map((name) => [name, zone])),
);

/** Google's stop for an LIRR leg is matched to the nearest LIRR station; names differ between the two. */
const MAX_STATION_MATCH_METERS = 400;

const nyWeekdayHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });

/**
 * LIRR peak: weekday trains in the morning (6–10 AM) and evening (4–8 PM) rush, by departure
 * time in New York. The same approximation the app's lirrFares.ts uses; the real rule is about
 * trains arriving at or leaving NYC terminals in those windows.
 */
export function isLirrPeak(iso: string): boolean {
  const parts = Object.fromEntries(nyWeekdayHour.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const hour = Number(parts.hour);
  return (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20);
}

export function lirrFareCents(fromZone: LirrZone, toZone: LirrZone, peak: boolean): number {
  return (peak ? LIRR_PEAK : LIRR_OFF_PEAK)[fromZone][LIRR_ZONES.indexOf(toZone)]!;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Builds the estimator over the LIRR stations (GTFS stops), for matching Google's stops to zones. */
export function createFareEstimator(lirrStops: Iterable<GtfsStop>): FareEstimator {
  const stations = [...lirrStops].filter((stop) => LIRR_STATION_ZONES[stop.name] !== undefined);
  const zoneAt = (location: { lat: number; lng: number }): LirrZone | undefined => {
    let best: { zone: LirrZone; meters: number } | undefined;
    for (const station of stations) {
      const meters = haversineMeters(location.lat, location.lng, station.lat, station.lon);
      if (meters <= MAX_STATION_MATCH_METERS && (!best || meters < best.meters)) best = { zone: LIRR_STATION_ZONES[station.name]!, meters };
    }
    return best?.zone;
  };

  return (steps: readonly TransitStep[]): TripFare | undefined => {
    let cents = 0;
    // The latest paid bus/subway fare's transfer: which system issued it, until when, how many left.
    // Suffolk's $0.25 buys one transfer ticket that covers both of its transfers.
    let transfer: { system: 'omny' | 'suffolk'; expiresMs: number; remaining: number; ticketBought?: boolean } | null = null;
    const useSuffolkTransfer = () => {
      if (!transfer!.ticketBought) cents += SUFFOLK_TRANSFER_CENTS;
      transfer!.ticketBought = true;
      transfer!.remaining -= 1;
    };

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      const departsMs = Date.parse(step.from.time);
      const transferValid = transfer && transfer.remaining > 0 && departsMs <= transfer.expiresMs;

      if (step.agency.name === LIRR_AGENCY) {
        // A change of trains (at Jamaica, say) is still one station-to-station ticket.
        let last = index;
        while (steps[last + 1]?.agency.name === LIRR_AGENCY) last += 1;
        const fromZone = zoneAt(step.from.location);
        const toZone = zoneAt(steps[last]!.to.location);
        if (fromZone === undefined || toZone === undefined) return undefined;
        cents += lirrFareCents(fromZone, toZone, isLirrPeak(step.from.time));
        index = last;
        continue;
      }

      if (OMNY_AGENCIES.has(step.agency.name)) {
        const express = step.mode === 'bus' && EXPRESS_BUS.test(step.line.shortName ?? '');
        if (transferValid && transfer!.system === 'omny' && !express) {
          transfer!.remaining -= 1;
        } else if (transferValid && transfer!.system === 'suffolk' && !express) {
          useSuffolkTransfer();
        } else {
          cents += express ? EXPRESS_BUS_FARE_CENTS : OMNY_FARE_CENTS;
          transfer = { system: 'omny', expiresMs: departsMs + TRANSFER_WINDOW_MS, remaining: 1 };
        }
        continue;
      }

      if (isSuffolk(step.agency.name)) {
        if (transferValid && transfer!.system === 'suffolk') {
          useSuffolkTransfer();
        } else if (transferValid && transfer!.system === 'omny') {
          // NICE (OMNY) transfers are accepted on Suffolk buses.
          transfer!.remaining -= 1;
        } else {
          cents += SUFFOLK_FARE_CENTS;
          transfer = { system: 'suffolk', expiresMs: departsMs + TRANSFER_WINDOW_MS, remaining: 2 };
        }
        continue;
      }

      if (step.agency.name === NYC_FERRY_AGENCY) {
        // Its own ticket: no OMNY or Suffolk transfer applies in either direction.
        cents += nycFerryFareCents(departsMs);
        continue;
      }

      // An agency without a fare the app knows: no honest estimate.
      return undefined;
    }
    return { text: dollars(cents), cents, currency: 'USD', estimated: true };
  };
}

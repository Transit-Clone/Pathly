import { MTA_BUS_AGENCY_IDS, type AgencyId } from './gtfsAgencies';

/**
 * The colors Pathly shows for routes. Rail and ferry lines keep their official GTFS colors
 * (riders know the lines by them). Buses don't: their GTFS colors carry no meaning (MTA's borough
 * feeds spread all 300+ city routes over seven colors at random, NICE puts 46 routes in six), so
 * buses get one color per agency, with MTA's service types told apart the way the MTA's own bus
 * maps do. Suffolk's two GTFS colors do mean something and are kept: on its route map (sctbus.org)
 * red routes run about every 30 minutes on weekdays, blue ones every 60.
 */
export const BUS_COLORS = {
  mtaLocal: '#006CB7',
  mtaSelectBusService: '#00AEEF',
  mtaLimited: '#B933AD',
  mtaExpress: '#00933C',
  nice: '#257489',
  suffolk: '#0454A2',
  suffolkFrequent: '#C63F49',
} as const;

const FALLBACK_COLOR = '#0B4F9C';
const MTA_BUS_AGENCIES = new Set<AgencyId>(MTA_BUS_AGENCY_IDS);
// X27, BM1, BxM10, QM2, SIM1C, ...
const MTA_EXPRESS_NAME = /^(X|BM|BxM|QM|SIM)\d/i;

type RouteNames = { routeId?: string; shortName?: string; name?: string };

/** Which kind of MTA bus a route is, from its ids and names (GTFS or Google's). */
function mtaBusColor({ routeId = '', shortName = '', name = '' }: RouteNames): string {
  if (MTA_EXPRESS_NAME.test(shortName) || /\bexpress\b/i.test(name)) return BUS_COLORS.mtaExpress;
  // MTA's GTFS ids an SBS route with a trailing "+" (S79+); its short name ends "-SBS".
  if (routeId.endsWith('+') || /-SBS$/i.test(shortName) || /\bselect bus\b/i.test(name)) return BUS_COLORS.mtaSelectBusService;
  // Limited-stop routes (S89, S93) say so at the end of their long name.
  if (/\bLTD\b|\blimited\b/i.test(name)) return BUS_COLORS.mtaLimited;
  return BUS_COLORS.mtaLocal;
}

const isSuffolkFrequent = (color: string | undefined) => color?.replace(/^#/, '').toUpperCase() === BUS_COLORS.suffolkFrequent.slice(1);

/** The color to show for a GTFS route, as "#RRGGBB". */
export function displayRouteColor(agencyId: AgencyId, route: RouteNames & { color?: string }): string {
  if (MTA_BUS_AGENCIES.has(agencyId)) return mtaBusColor(route);
  if (agencyId === 'nice') return BUS_COLORS.nice;
  if (agencyId === 'suffolk') return isSuffolkFrequent(route.color) ? BUS_COLORS.suffolkFrequent : BUS_COLORS.suffolk;
  const color = route.color?.replace(/^#/, '');
  return color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : FALLBACK_COLOR;
}

/**
 * The color to show for a transit leg Google planned, given the Pathly agencies it runs on
 * (tripAgencies.ts). Undefined keeps Google's own color (rail, ferry, anything unrecognized).
 */
export function displayStepColor(agencyIds: readonly AgencyId[], line: { name?: string; shortName?: string; color?: string }): string | undefined {
  const agencyId = agencyIds[0];
  if (!agencyId || (!MTA_BUS_AGENCIES.has(agencyId) && agencyId !== 'nice' && agencyId !== 'suffolk')) return undefined;
  return displayRouteColor(agencyId, line);
}

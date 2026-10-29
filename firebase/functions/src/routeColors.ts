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
  // The MTA's bus-map hues, tuned deep and vivid to sit with the LIRR shades below as one family.
  mtaLocal: '#1668D8',
  mtaSelectBusService: '#0099E6',
  mtaLimited: '#B5279F',
  mtaExpress: '#009247',
  nice: '#0A8BA8',
  suffolk: '#2557D6',
  suffolkFrequent: '#E4002B',
} as const;

/**
 * Pathly's shades of the LIRR's branch colors, keyed by the official color (GTFS and Google both
 * send it). Each keeps its branch's hue, tuned deeper and more vivid so the lines look like one
 * family with the bus colors. The subway keeps its official colors untouched.
 */
export const LIRR_LINE_COLORS: Readonly<Record<string, string>> = {
  '#006EC7': '#0A3A8C', // Port Jefferson
  '#00985F': '#007A4D', // Babylon
  '#CE8E00': '#E08A00', // Hempstead
  '#00AF3F': '#00A443', // Oyster Bay
  '#A626AA': '#9B1FA8', // Ronkonkoma, Greenport
  '#00B2A9': '#00968F', // Montauk
  '#FF6319': '#F2541B', // Long Beach
  '#6E3219': '#7A3418', // Far Rockaway
  '#00A1DE': '#0088D1', // West Hempstead
  '#C60C30': '#D2102F', // Port Washington
  '#60269E': '#5B21B6', // Belmont Park
  '#4D5357': '#4A5058', // City Terminal Zone
};

/** An LIRR line's Pathly shade, from its official color (with or without "#"). */
export function lirrLineColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return LIRR_LINE_COLORS[`#${color.replace(/^#/, '').toUpperCase()}`];
}

/** Suffolk's GTFS color for its frequent (red) routes, as the feed publishes it. */
const SUFFOLK_GTFS_FREQUENT = 'C63F49';

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

const isSuffolkFrequent = (color: string | undefined) => color?.replace(/^#/, '').toUpperCase() === SUFFOLK_GTFS_FREQUENT;

/** The color to show for a GTFS route, as "#RRGGBB". */
export function displayRouteColor(agencyId: AgencyId, route: RouteNames & { color?: string }): string {
  if (MTA_BUS_AGENCIES.has(agencyId)) return mtaBusColor(route);
  if (agencyId === 'nice') return BUS_COLORS.nice;
  if (agencyId === 'suffolk') return isSuffolkFrequent(route.color) ? BUS_COLORS.suffolkFrequent : BUS_COLORS.suffolk;
  if (agencyId === 'lirr') {
    const shade = lirrLineColor(route.color);
    if (shade) return shade;
  }
  const color = route.color?.replace(/^#/, '');
  return color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : FALLBACK_COLOR;
}

/**
 * The color to show for a transit leg Google planned, given the Pathly agencies it runs on
 * (tripAgencies.ts). Undefined keeps Google's own color (subway, ferry, anything unrecognized).
 */
export function displayStepColor(agencyIds: readonly AgencyId[], line: { name?: string; shortName?: string; color?: string }): string | undefined {
  const agencyId = agencyIds[0];
  if (agencyId === 'lirr') return lirrLineColor(line.color);
  if (!agencyId || (!MTA_BUS_AGENCIES.has(agencyId) && agencyId !== 'nice' && agencyId !== 'suffolk')) return undefined;
  return displayRouteColor(agencyId, line);
}

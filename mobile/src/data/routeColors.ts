import { useTheme } from '../theme/AppSettings';
import type { StationTransfer } from './stationTransfers';

/**
 * Bus colors, one per agency (with MTA's service types told apart), mirroring the backend's
 * firebase/functions/src/routeColors.ts, which colors every route the backend sends; a test keeps
 * the two identical. Here they recolor data built into the app, like the station transfer chips
 * (generated from raw GTFS colors, which for buses mean nothing).
 */
export const BUS_COLORS = {
  // The MTA's bus-map hues, tuned deep and vivid to sit with the LIRR shades below as one family.
  mtaLocal: '#1668D8',
  mtaSelectBusService: '#0099E6',
  mtaLimited: '#B5279F',
  mtaExpress: '#009247',
  nice: '#0A8BA8',
  suffolk: '#2557D6',
  // Suffolk's red routes run about every 30 minutes on weekdays, blue ones every 60 (sctbus.org).
  suffolkFrequent: '#E4002B',
} as const;

/**
 * Pathly's shades of the LIRR's branch colors, keyed by the official color the station data
 * carries; mirrors the backend's table. Each keeps its branch's hue, tuned deeper and more vivid so
 * the lines look like one family with the bus colors. The subway keeps its official colors.
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

/** Suffolk's GTFS color for its frequent (red) routes, as the station data carries it. */
const SUFFOLK_GTFS_FREQUENT = '#C63F49';

// X27, BM1, BxM10, QM2, SIM1C, ...
const MTA_EXPRESS_NAME = /^(X|BM|BxM|QM|SIM)\d/i;

/** The color a station transfer chip shows: its agency's bus color, Pathly's LIRR shade, or the line's own. */
export function transferColor(transfer: Pick<StationTransfer, 'agency' | 'mode' | 'name' | 'color'>): string | null {
  if (transfer.mode !== 'bus') return (transfer.agency === 'LIRR' ? lirrLineColor(transfer.color ?? undefined) : undefined) ?? transfer.color;
  if (transfer.agency === 'NICE Bus') return BUS_COLORS.nice;
  if (transfer.agency === 'Suffolk County Transit') return transfer.color?.toUpperCase() === SUFFOLK_GTFS_FREQUENT ? BUS_COLORS.suffolkFrequent : BUS_COLORS.suffolk;
  if (transfer.agency === 'MTA Bus') {
    if (MTA_EXPRESS_NAME.test(transfer.name)) return BUS_COLORS.mtaExpress;
    if (/-SBS$/i.test(transfer.name)) return BUS_COLORS.mtaSelectBusService;
    return BUS_COLORS.mtaLocal;
  }
  return transfer.color;
}

/** How much of its lightness a route color keeps in dark mode. */
const DARK_MODE_LIGHTNESS = 0.78;

const APP_BUS_COLORS = new Set<string>(Object.values(BUS_COLORS));

/**
 * A route color as drawn in the current theme. The bus colors Pathly picks itself go a shade
 * darker in dark mode, where they glare against the dark map and sheets; official line colors
 * (the subway's, the railroads', the ferries') always stay as published.
 */
export function themedRouteColor(color: string, isDark: boolean): string {
  if (!isDark || !APP_BUS_COLORS.has(color.toUpperCase())) return color;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = parseInt(match[1]!, 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * DARK_MODE_LIGHTNESS);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** themedRouteColor for the active theme. */
export function useRouteColor(): (color: string) => string {
  const { isDark } = useTheme();
  return (color) => themedRouteColor(color, isDark);
}

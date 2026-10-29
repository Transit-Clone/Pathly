import { useTheme } from '../theme/AppSettings';
import type { StationTransfer } from './stationTransfers';

/**
 * Bus colors, one per agency (with MTA's service types told apart), mirroring the backend's
 * firebase/functions/src/routeColors.ts, which colors every route the backend sends; a test keeps
 * the two identical. Here they recolor data built into the app, like the station transfer chips
 * (generated from raw GTFS colors, which for buses mean nothing).
 */
export const BUS_COLORS = {
  // The MTA's bus-map hues, lifted a little so they glow on the map rather than sit dull on it.
  mtaLocal: '#1A7FD4',
  mtaSelectBusService: '#00B2F0',
  mtaLimited: '#C845BC',
  mtaExpress: '#00A651',
  nice: '#1F9BB5',
  suffolk: '#2F6FE0',
  // Suffolk's red routes run about every 30 minutes on weekdays, blue ones every 60 (sctbus.org).
  suffolkFrequent: '#E8453C',
} as const;

/** Suffolk's GTFS color for its frequent (red) routes, as the station data carries it. */
const SUFFOLK_GTFS_FREQUENT = '#C63F49';

// X27, BM1, BxM10, QM2, SIM1C, ...
const MTA_EXPRESS_NAME = /^(X|BM|BxM|QM|SIM)\d/i;

/** The color a station transfer chip shows: its agency's bus color, or the line's own for rail. */
export function transferColor(transfer: Pick<StationTransfer, 'agency' | 'mode' | 'name' | 'color'>): string | null {
  if (transfer.mode !== 'bus') return transfer.color;
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

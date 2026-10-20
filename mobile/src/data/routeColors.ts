import type { StationTransfer } from './stationTransfers';

/**
 * Bus colors, one per agency (with MTA's service types told apart), mirroring the backend's
 * firebase/functions/src/routeColors.ts, which colors every route the backend sends; a test keeps
 * the two identical. Here they recolor data built into the app, like the station transfer chips
 * (generated from raw GTFS colors, which for buses mean nothing).
 */
export const BUS_COLORS = {
  mtaLocal: '#006CB7',
  mtaSelectBusService: '#00AEEF',
  mtaLimited: '#B933AD',
  mtaExpress: '#00933C',
  nice: '#257489',
  suffolk: '#0454A2',
  // Suffolk's red routes run about every 30 minutes on weekdays, blue ones every 60 (sctbus.org).
  suffolkFrequent: '#C63F49',
} as const;

// X27, BM1, BxM10, QM2, SIM1C, ...
const MTA_EXPRESS_NAME = /^(X|BM|BxM|QM|SIM)\d/i;

/** The color a station transfer chip shows: its agency's bus color, or the line's own for rail. */
export function transferColor(transfer: Pick<StationTransfer, 'agency' | 'mode' | 'name' | 'color'>): string | null {
  if (transfer.mode !== 'bus') return transfer.color;
  if (transfer.agency === 'NICE Bus') return BUS_COLORS.nice;
  if (transfer.agency === 'Suffolk County Transit') return transfer.color?.toUpperCase() === BUS_COLORS.suffolkFrequent ? BUS_COLORS.suffolkFrequent : BUS_COLORS.suffolk;
  if (transfer.agency === 'MTA Bus') {
    if (MTA_EXPRESS_NAME.test(transfer.name)) return BUS_COLORS.mtaExpress;
    if (/-SBS$/i.test(transfer.name)) return BUS_COLORS.mtaSelectBusService;
    return BUS_COLORS.mtaLocal;
  }
  return transfer.color;
}

import { callable } from '../lib/firebase';
import type { RideFix } from './rideDetection';
import type { LiveSource } from './transit';

/** Mirrors firebase/functions/src/rideReports.ts. */
export const RIDE_REPORTS = [
  { kind: 'seats', label: 'Seats open' },
  { kind: 'packed', label: 'Packed' },
  { kind: 'temperature', label: 'Too hot or cold' },
  { kind: 'stuck', label: 'Not moving' },
  { kind: 'dirty', label: 'Not clean' },
] as const;
export type RideReportKind = typeof RIDE_REPORTS[number]['kind'];
export type VehicleReport = { kind: RideReportKind; count: number };

const reportRideCondition = callable<{ agencyId: string; routeId: string; tripId: string; lat: number; lon: number; accuracyMeters: number; kind: RideReportKind }, { accepted: boolean }>('reportRideCondition');

export function rideReportLabel(kind: RideReportKind): string {
  return RIDE_REPORTS.find((report) => report.kind === kind)?.label ?? kind;
}

export function isRideReportKind(kind: string): kind is RideReportKind {
  return RIDE_REPORTS.some((report) => report.kind === kind);
}

/** Whether the backend took it: it won't when the rider's location doesn't put them on the vehicle. */
export async function sendRideReport(source: Pick<LiveSource, 'agencyId' | 'routeId'>, tripId: string, kind: RideReportKind, fix: RideFix): Promise<boolean> {
  if (fix.accuracyMeters == null) return false;
  const { data } = await reportRideCondition({ agencyId: source.agencyId, routeId: source.routeId, tripId, lat: fix.lat, lon: fix.lon, accuracyMeters: fix.accuracyMeters, kind });
  return data.accepted;
}

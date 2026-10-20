import type { RouteDetail, RoutePrediction } from './transit';

/** Running this many minutes late or more is called out; less is ordinary running time. */
export const LATE_THRESHOLD_MINUTES = 2;

export type RouteNotice = { kind: 'delay' | 'alert'; title: string; detail: string | null };

const VEHICLE_NOUNS = { subway: 'Train', rail: 'Train', bus: 'Bus', ferry: 'Boat' } as const;

/**
 * What the delays dropdown under a route's time cards lists, delays first: each tracked departure
 * in `predictions` (the shown direction's) running late, then the route's MTA service alerts, then a
 * demo route's hand-written advisory. Empty means there's nothing to show.
 */
export function routeNotices(route: RouteDetail, predictions: readonly RoutePrediction[], mode: keyof typeof VEHICLE_NOUNS): RouteNotice[] {
  const noun = VEHICLE_NOUNS[mode];
  const delays: RouteNotice[] = predictions
    .filter((prediction) => prediction.live && (prediction.delayMinutes ?? 0) >= LATE_THRESHOLD_MINUTES)
    .map((prediction) => ({
      kind: 'delay',
      title: `${noun} ${prediction.minutes <= 0 ? 'due now' : `in ${prediction.minutes} min`} is running ${prediction.delayMinutes} min late`,
      detail: null,
    }));
  const alerts: RouteNotice[] = (route.serviceAlerts ?? []).map((alert) => ({ kind: 'alert', title: alert.header, detail: alert.description }));
  // A live route's own `alert` is always "No delays reported..."; only demo routes carry a written one.
  const advisory: RouteNotice[] = route.alert.startsWith('No delays') ? [] : [{ kind: 'alert', title: route.alert, detail: null }];
  return [...delays, ...alerts, ...advisory];
}

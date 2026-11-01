import type { RouteDetail, RoutePrediction } from './transit';

/** Running this many minutes late or more is called out; less is ordinary running time. */
export const LATE_THRESHOLD_MINUTES = 2;

/** `label` names it on the route's alert pill; a `warning` notice turns the pill yellow. */
export type RouteNotice = { kind: 'delay' | 'alert' | 'outlook'; label: string; warning: boolean; title: string; detail: string | null };

const VEHICLE_NOUNS = { subway: 'Train', rail: 'Train', bus: 'Bus', ferry: 'Boat' } as const;

/**
 * What the alert pill under a route's time cards stands for, most pressing first: each tracked
 * departure in `predictions` (the shown direction's) running late, then the route's service
 * alerts (warnings before notices and upcoming changes, as the backend orders them), then a demo
 * route's hand-written advisory. Empty means there's nothing to show.
 */
export function routeNotices(route: RouteDetail, predictions: readonly RoutePrediction[], mode: keyof typeof VEHICLE_NOUNS): RouteNotice[] {
  const noun = VEHICLE_NOUNS[mode];
  const delays: RouteNotice[] = predictions
    .filter((prediction) => prediction.live && (prediction.delayMinutes ?? 0) >= LATE_THRESHOLD_MINUTES)
    .map((prediction) => ({
      kind: 'delay',
      label: 'Running late',
      warning: true,
      title: `${noun} ${prediction.minutes <= 0 ? 'due now' : `in ${prediction.minutes} min`} is running ${prediction.delayMinutes} min late`,
      detail: null,
    }));
  const alerts: RouteNotice[] = (route.serviceAlerts ?? []).map((alert) => ({
    kind: 'alert',
    label: alert.label ?? 'Service alert',
    warning: alert.warning ?? true,
    title: alert.header,
    detail: alert.description,
  }));
  // A live route's own `alert` is always "No delays reported..."; only demo routes carry a written one.
  const advisory: RouteNotice[] = route.alert.startsWith('No delays') ? [] : [{ kind: 'alert', label: 'Service advisory', warning: true, title: route.alert, detail: null }];
  // Warnings lead, so the pill names the most pressing one.
  return [...delays, ...alerts, ...advisory].map((notice, index) => ({ notice, index }))
    .sort((a, b) => Number(b.notice.warning) - Number(a.notice.warning) || a.index - b.index)
    .map(({ notice }) => notice);
}

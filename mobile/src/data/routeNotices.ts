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

/** One pill on Route View: notices that read alike, opened together in one sheet. */
export type NoticeGroup<T extends RouteNotice = RouteNotice> = { label: string; warning: boolean; notices: T[] };

/** What makes two pills "the same thing" to a rider: upcoming changes of any kind, or the same name. */
function groupKey(notice: RouteNotice): string {
  const label = notice.label.trim().toLowerCase().replace(/s$/, '');
  return notice.kind === 'alert' && label.startsWith('upcoming') ? 'upcoming' : `${notice.kind}:${label}`;
}

/**
 * Notices merged into one pill each where they'd read as the same thing (three "Upcoming service
 * change" pills, two "Running late"), in the order their first one came. A notice repeated word
 * for word is kept once. A group of mixed upcoming kinds is named "Upcoming changes".
 */
export function groupNotices<T extends RouteNotice>(notices: readonly T[]): NoticeGroup<T>[] {
  const groups = new Map<string, NoticeGroup<T>>();
  for (const notice of notices) {
    const key = groupKey(notice);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { label: notice.label, warning: notice.warning, notices: [notice] });
      continue;
    }
    if (group.notices.some((other) => other.title === notice.title && other.detail === notice.detail)) continue;
    group.notices.push(notice);
    group.warning ||= notice.warning;
    if (key === 'upcoming' && group.label !== notice.label) group.label = 'Upcoming changes';
  }
  return [...groups.values()];
}

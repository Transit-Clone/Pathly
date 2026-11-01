import { useEffect, useState } from 'react';

import { callable } from '../lib/firebase';
import type { RouteNotice } from './routeNotices';

/** How far ahead a holiday is called out. */
export const HOLIDAY_LEAD_DAYS = 7;
const DAY_MS = 86_400_000;
const WEATHER_REFRESH_MS = 15 * 60 * 1000;

/** A notice about what's coming, with the short form its pill uses beside a warning pill. */
export type OutlookNotice = RouteNotice & { icon: 'calendar' | 'snow'; shortLabel: string; /** A holiday's date, "YYYYMMDD". */ dateKey?: string };

const utcDay = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

/** The nth (1-based) `weekday` (0 = Sunday) of a month; n = -1 is the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = utcDay(year, month, 1);
    return first + (((weekday - new Date(first).getUTCDay() + 7) % 7) + (n - 1) * 7) * DAY_MS;
  }
  const last = utcDay(year, month + 1, 0);
  return last - ((new Date(last).getUTCDay() - weekday + 7) % 7) * DAY_MS;
}

/** A fixed-date holiday falling on a weekend is observed on the nearest weekday. */
function observed(day: number): number {
  const weekday = new Date(day).getUTCDay();
  return weekday === 6 ? day - DAY_MS : weekday === 0 ? day + DAY_MS : day;
}

function holidaysIn(year: number): { name: string; day: number }[] {
  return [
    { name: "New Year's Day", day: observed(utcDay(year, 1, 1)) },
    { name: 'Martin Luther King Jr. Day', day: nthWeekday(year, 1, 1, 3) },
    { name: "Presidents' Day", day: nthWeekday(year, 2, 1, 3) },
    { name: 'Memorial Day', day: nthWeekday(year, 5, 1, -1) },
    { name: 'Juneteenth', day: observed(utcDay(year, 6, 19)) },
    { name: 'Independence Day', day: observed(utcDay(year, 7, 4)) },
    { name: 'Labor Day', day: nthWeekday(year, 9, 1, 1) },
    { name: 'Indigenous Peoples’ Day', day: nthWeekday(year, 10, 1, 2) },
    { name: 'Veterans Day', day: observed(utcDay(year, 11, 11)) },
    { name: 'Thanksgiving', day: nthWeekday(year, 11, 4, 4) },
    { name: 'Christmas Day', day: observed(utcDay(year, 12, 25)) },
  ];
}

/** Today in New York, as midnight UTC of that date. */
function newYorkToday(now: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map((part) => [part.type, part.value]));
  return utcDay(Number(parts.year), Number(parts.month), Number(parts.day));
}

/** Holidays from today through the next HOLIDAY_LEAD_DAYS, soonest first. */
export function upcomingHolidays(now: Date): OutlookNotice[] {
  const today = newYorkToday(now);
  const year = new Date(today).getUTCFullYear();
  return [...holidaysIn(year), ...holidaysIn(year + 1)]
    .filter(({ day }) => day >= today && day <= today + HOLIDAY_LEAD_DAYS * DAY_MS)
    .sort((a, b) => a.day - b.day)
    .map(({ day, name }) => {
      const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(day);
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(day);
      const when = day === today ? 'Today' : date;
      return {
        kind: 'outlook',
        icon: 'calendar',
        label: `${name} · ${when}`,
        shortLabel: when,
        dateKey: new Date(day).toISOString().slice(0, 10).replaceAll('-', ''),
        warning: false,
        title: day === today ? `${name} is today` : `${name} is ${weekday}, ${date}`,
        detail: 'Many lines run a holiday schedule, with fewer trips and longer waits. Check the times again that day.',
      };
    });
}

type WinterAlert = { id: string; event: string; headline: string; onset: string | null };
type HolidayService = { status: 'none' | 'reduced' | 'regular' | 'unknown'; percentFewer?: number };
type OutlookRoute = { agencyId: string; routeId: string };
const getServiceOutlook = callable<Partial<OutlookRoute> & { holidayDates?: string[] }, { winterAlerts?: WinterAlert[]; holidayService?: Record<string, HolidayService> }>('getServiceOutlook');

/**
 * Holidays as this route's own timetable has them: how service changes, and nothing at all when
 * the agency confirms a regular day. A timetable that can't say keeps the general wording.
 */
export function withHolidayService(holidays: readonly OutlookNotice[], service: Readonly<Record<string, HolidayService>>): OutlookNotice[] {
  return holidays.flatMap((notice) => {
    const found = notice.dateKey ? service[notice.dateKey] : undefined;
    if (found?.status === 'regular') return [];
    if (found?.status === 'none') return [{ ...notice, detail: 'The timetable shows no service on this line that day.' }];
    if (found?.status === 'reduced') return [{ ...notice, detail: `The timetable shows about ${found.percentFewer}% fewer trips on this line that day than usual.` }];
    return [notice];
  });
}

export function winterNotices(alerts: readonly WinterAlert[]): OutlookNotice[] {
  return alerts.map((alert) => ({
    kind: 'outlook',
    icon: 'snow',
    label: alert.event,
    shortLabel: 'Snow',
    warning: false,
    title: alert.headline,
    detail: 'Service may be slower or reduced. From the National Weather Service.',
  }));
}

let loaded: { at: number; alerts: Promise<WinterAlert[]> } | null = null;

/** Clears the shared weather lookup (tests). */
export function resetServiceOutlookForTests() {
  loaded = null;
}

function loadWinterAlerts(): Promise<WinterAlert[]> {
  if (loaded && Date.now() - loaded.at < WEATHER_REFRESH_MS) return loaded.alerts;
  // Weather is extra: a backend without it, or a failed request, just shows no snow pill.
  const alerts = getServiceOutlook({}).then(({ data }) => data.winterAlerts ?? [], () => []);
  loaded = { at: Date.now(), alerts };
  return alerts;
}

/** What Route View's outlook pill stands for: winter weather first, then coming holidays as this line's timetable has them. */
export function useServiceOutlook(now: Date, route?: OutlookRoute): OutlookNotice[] {
  const [alerts, setAlerts] = useState<readonly WinterAlert[]>([]);
  const [service, setService] = useState<Readonly<Record<string, HolidayService>>>({});
  useEffect(() => {
    let cancelled = false;
    void loadWinterAlerts().then((next) => {
      if (!cancelled) setAlerts(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const holidays = upcomingHolidays(now);
  const dates = holidays.flatMap((notice) => (notice.dateKey ? [notice.dateKey] : [])).join(',');
  const agencyId = route?.agencyId;
  const routeId = route?.routeId;
  useEffect(() => {
    if (!agencyId || !routeId || !dates) return undefined;
    let cancelled = false;
    // Extra as well: without an answer, the holiday keeps its general wording.
    void getServiceOutlook({ agencyId, routeId, holidayDates: dates.split(',') }).then(({ data }) => {
      if (!cancelled) setService(data.holidayService ?? {});
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [agencyId, dates, routeId]);
  return [...winterNotices(alerts), ...withHolidayService(holidays, service)];
}

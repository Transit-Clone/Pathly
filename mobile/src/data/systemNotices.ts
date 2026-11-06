import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { upcomingHolidays, type OutlookNotice } from './serviceOutlook';

/**
 * Holidays that change service on nearly every line Pathly covers (subway, buses, LIRR, NICE,
 * Suffolk, ferries): Sunday or holiday schedules, or no service at all on some lines. Smaller
 * holidays (Veterans Day, Columbus Day) change only some lines, so they stay on Route View's pill.
 */
export const SYSTEM_WIDE_HOLIDAYS: readonly string[] = ["New Year's Day", 'Memorial Day', 'Independence Day', 'Labor Day', 'Thanksgiving', 'Christmas Day'];

/** How far ahead the home screen reminds riders of one. */
export const SYSTEM_NOTICE_LEAD_DAYS = 4;
const DAY_MS = 86_400_000;

export type SystemNotice = { id: string; text: string; accessibilityLabel: string };

/** The system-wide holiday coming up within SYSTEM_NOTICE_LEAD_DAYS, soonest first, worded for the home screen. */
export function upcomingSystemNotices(now: Date): SystemNotice[] {
  const soon = now.getTime() + SYSTEM_NOTICE_LEAD_DAYS * DAY_MS;
  return upcomingHolidays(now)
    .filter((notice): notice is OutlookNotice & { holiday: string; dateKey: string; when: string } => notice.holiday != null && notice.dateKey != null && notice.when != null && SYSTEM_WIDE_HOLIDAYS.includes(notice.holiday))
    .filter((notice) => {
      const day = Date.UTC(Number(notice.dateKey.slice(0, 4)), Number(notice.dateKey.slice(4, 6)) - 1, Number(notice.dateKey.slice(6, 8)));
      return day <= soon;
    })
    .map((notice) => ({
      id: `holiday-${notice.dateKey}`,
      text: `${notice.holiday} ${notice.when === 'Today' ? 'today' : notice.when}: holiday schedules on most lines`,
      accessibilityLabel: `${notice.title}. Most lines run a holiday or Sunday schedule, with fewer trips. Check times before you go.`,
    }));
}

const STORAGE_KEY = 'pathly.systemNotices.dismissed.v1';

async function readDismissed(): Promise<string[]> {
  try {
    const text = await AsyncStorage.getItem(STORAGE_KEY);
    const saved: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The home screen's reminder for a holiday that changes service everywhere, under the search bar.
 * Closing it hides that holiday's reminder on this device for good.
 */
export function useSystemNotice(now: Date = new Date()) {
  const notice = upcomingSystemNotices(now)[0] ?? null;
  const id = notice?.id ?? null;
  // Which id was checked against the dismissed list, and whether it was dismissed: hidden until known.
  const [checked, setChecked] = useState<{ id: string; dismissed: boolean } | null>(null);
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    void readDismissed().then((dismissed) => {
      if (!cancelled) setChecked({ id, dismissed: dismissed.includes(id) });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const shown = notice && checked?.id === notice.id && !checked.dismissed ? notice : null;
  return {
    notice: shown,
    dismiss: () => {
      if (!id) return;
      setChecked({ id, dismissed: true });
      void readDismissed().then((dismissed) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed.filter((other) => other !== id), id].slice(-20)))).catch(() => undefined);
    },
  };
}

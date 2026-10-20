import { nyInstant } from '../data/tripPlanning';

const ONE_DAY_MS = 24 * 60 * 60_000;
const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });

/** The next day on or after `fromMs` (New York calendar) whose weekday passes `accept`. */
function nextDay(fromMs: number, accept: (weekday: string) => boolean): number {
  let day = fromMs + ONE_DAY_MS;
  while (!accept(weekdayFormat.format(day))) day += ONE_DAY_MS;
  return day;
}

const isWeekday = (weekday: string) => weekday !== 'Sat' && weekday !== 'Sun';

/** Quick picks for testing time-dependent behavior: rush hour, late night, and a weekend. */
export function mockTimePresets(nowMs: number): { label: string; at: number }[] {
  const weekday = nextDay(nowMs, isWeekday);
  const saturday = nextDay(nowMs, (day) => day === 'Sat');
  return [
    { label: 'Weekday 7:30 AM (peak)', at: nyInstant(weekday, 7 * 60 + 30) },
    { label: 'Weekday 11:30 PM', at: nyInstant(weekday, 23 * 60 + 30) },
    { label: 'Weekday 2:30 AM', at: nyInstant(weekday, 2 * 60 + 30) },
    { label: 'Saturday 1:00 PM', at: nyInstant(saturday, 13 * 60) },
  ];
}

/** "2026-10-15" and "23:30" read as New York time; null when either doesn't parse. */
export function parseMockTime(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hours > 23 || minutes > 59) return null;
  // Noon UTC on that date is the same calendar day in New York.
  const dayMs = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12);
  if (Number.isNaN(dayMs)) return null;
  return nyInstant(dayMs, hours * 60 + minutes);
}

import { upcomingHolidays, winterNotices, withHolidayService } from '../src/data/serviceOutlook';

const labels = (iso: string) => upcomingHolidays(new Date(iso)).map((notice) => notice.label);

describe('upcomingHolidays', () => {
  it('finds Thanksgiving a week ahead, but not eight days ahead', () => {
    expect(labels('2026-11-19T17:00:00Z')).toEqual(['Thanksgiving · Nov 26']);
    expect(labels('2026-11-18T17:00:00Z')).toEqual([]);
  });

  it('says today on the day itself, in New York time', () => {
    expect(labels('2026-11-26T17:00:00Z')).toEqual(['Thanksgiving · Today']);
    // 11 PM on the 26th in New York is already the 27th in UTC.
    expect(labels('2026-11-27T04:00:00Z')).toEqual(['Thanksgiving · Today']);
  });

  it('moves a weekend holiday to the weekday it is observed', () => {
    // July 4, 2026 is a Saturday.
    expect(labels('2026-07-01T17:00:00Z')).toEqual(['Independence Day · Jul 3']);
  });

  it('looks across the new year', () => {
    expect(labels('2026-12-28T17:00:00Z')).toEqual(["New Year's Day · Jan 1"]);
  });

  it('computes floating Monday holidays', () => {
    expect(labels('2027-05-30T17:00:00Z')).toEqual(['Memorial Day · May 31']);
    expect(labels('2026-09-07T17:00:00Z')).toEqual(['Labor Day · Today']);
  });
});

describe('winterNotices', () => {
  it('uses the short form beside a warning and the headline in the sheet', () => {
    const [notice] = winterNotices([{ id: '1', event: 'Winter Storm Watch', headline: 'Winter Storm Watch from Friday', onset: null }]);
    expect(notice).toMatchObject({ kind: 'outlook', icon: 'snow', label: 'Winter Storm Watch', shortLabel: 'Snow', title: 'Winter Storm Watch from Friday', warning: false });
  });
});

describe('withHolidayService', () => {
  const [holiday] = upcomingHolidays(new Date('2026-11-19T17:00:00Z'));

  it('says what the timetable shows, and drops a day confirmed regular', () => {
    expect(holiday!.dateKey).toBe('20261126');
    expect(withHolidayService([holiday!], { '20261126': { status: 'none' } })[0]!.detail).toMatch(/no service/);
    expect(withHolidayService([holiday!], { '20261126': { status: 'reduced', percentFewer: 40 } })[0]!.detail).toMatch(/40% fewer/);
    expect(withHolidayService([holiday!], { '20261126': { status: 'regular' } })).toEqual([]);
  });

  it('keeps the general wording when the timetable can’t say', () => {
    expect(withHolidayService([holiday!], { '20261126': { status: 'unknown' } })).toEqual([holiday]);
    expect(withHolidayService([holiday!], {})).toEqual([holiday]);
  });
});

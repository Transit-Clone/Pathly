const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { transit_realtime } = require('gtfs-realtime-bindings');

const { getRouteAlerts, MTA_ALERTS_FEED_URL } = require('../lib/gtfsAlerts');
const { getStopPredictions } = require('../lib/gtfsSchedule');
const { resetGtfsStaticDataForTests, setAgencyDataForTests } = require('../lib/gtfsStaticData');

const nowSeconds = Math.floor(Date.now() / 1000);
const text = (value) => ({ translation: [{ text: value, language: 'en' }, { text: `<p>${value}</p>`, language: 'en-html' }] });

function alertsFeed() {
  const alert = (id, informedEntity, extra = {}) => ({ id, alert: { informedEntity, headerText: text(`Header ${id}`), descriptionText: text(`Details ${id}`), ...extra } });
  const message = transit_realtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: nowSeconds },
    entity: [
      alert('now', [{ agencyId: 'MTASBWY', routeId: 'A' }, { agencyId: 'MTASBWY', routeId: 'C' }], { activePeriod: [{ start: nowSeconds - 600 }] }),
      alert('ended', [{ agencyId: 'MTASBWY', routeId: 'A' }], { activePeriod: [{ start: nowSeconds - 7200, end: nowSeconds - 3600 }] }),
      alert('later', [{ agencyId: 'MTASBWY', routeId: 'A' }], { activePeriod: [{ start: nowSeconds + 3600 }] }),
      alert('other-line', [{ agencyId: 'MTASBWY', routeId: 'E' }]),
      // Same route_id under another agency: Metro-North's line "A" isn't the A train.
      alert('other-agency', [{ agencyId: 'MNR', routeId: 'A' }]),
      alert('bus', [{ agencyId: 'MTA NYCT', routeId: 'M15' }]),
    ],
  });
  return Buffer.from(transit_realtime.FeedMessage.encode(message).finish());
}

test('service alerts in effect now are matched to a route by agency and route_id', async () => {
  const originalFetch = global.fetch;
  const fetched = [];
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(alertsFeed());
  };
  try {
    assert.deepEqual(await getRouteAlerts('subway', 'A'), [{ id: 'now', header: 'Header now', description: 'Details now' }]);
    assert.deepEqual((await getRouteAlerts('mn', 'M15')).map((alert) => alert.id), ['bus']);
    assert.deepEqual(await getRouteAlerts('lirr', '10'), []);
    // Agencies the MTA feed doesn't cover never ask for it.
    const before = fetched.length;
    assert.deepEqual(await getRouteAlerts('nice', 'n4'), []);
    assert.deepEqual(await getRouteAlerts('siferry', 'SIF'), []);
    assert.equal(fetched.length, before);
    assert.ok(fetched.every((url) => url === MTA_ALERTS_FEED_URL));
  } finally {
    global.fetch = originalFetch;
  }
});

/** Eastern-time "HH:MM:SS" for `offsetMinutes` from now, past 24:00:00 when it runs into tomorrow. */
function easternTime(offsetMinutes) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((part) => [part.type, part.value]));
  const total = Number(parts.hour) * 60 + Number(parts.minute) + offsetMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

/** A one-route bus timetable with trips leaving stop 1 at 20, 30 and 40 minutes from now. */
function busTimetableDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathly-delays-'));
  const trips = ['T20', 'T30', 'T40'];
  fs.writeFileSync(path.join(dir, 'routes.txt'), 'route_id,route_short_name,route_long_name,route_color\nB1,B1,Test Av,006CB7\n');
  fs.writeFileSync(path.join(dir, 'stops.txt'), 'stop_id,stop_name,stop_lat,stop_lon\n1,First St,40.7,-73.9\n2,Second St,40.71,-73.91\n');
  fs.writeFileSync(path.join(dir, 'calendar.txt'), 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nDAILY,1,1,1,1,1,1,1,20200101,20991231\n');
  fs.writeFileSync(path.join(dir, 'trips.txt'), `trip_id,route_id,service_id,direction_id,trip_headsign\n${trips.map((trip) => `${trip},B1,DAILY,0,Second St`).join('\n')}\n`);
  const rows = trips.flatMap((trip) => {
    const minutes = Number(trip.slice(1));
    return [`${trip},1,${easternTime(minutes)},${easternTime(minutes)},1`, `${trip},2,${easternTime(minutes + 5)},${easternTime(minutes + 5)},2`];
  });
  fs.writeFileSync(path.join(dir, 'stop_times.txt'), `trip_id,stop_id,arrival_time,departure_time,stop_sequence\n${rows.join('\n')}\n`);
  return dir;
}

test('a tracked trip shows how late it runs, from the feed or from its timetable', async () => {
  resetGtfsStaticDataForTests();
  // mn: live trip_ids match the timetable's, so a trip's live time can be compared with it.
  setAgencyDataForTests('mn', busTimetableDir());
  // From the start of this minute, as the timetable's times are.
  const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
  const at = (minutes) => new Date(minuteStart + minutes * 60_000).toISOString();
  const live = (tripId, minutes, delaySeconds) => ({ tripId, directionId: 0, peakOffpeak: null, stops: [{ stopId: '1', stopName: 'First St', lat: 0, lon: 0, sequence: 1, scheduledTime: at(minutes), delaySeconds }] });
  const predictions = await getStopPredictions('mn', 'B1', '1', '1', [
    live('T20', 27, null), // 7 minutes behind its 20-minute timetable time
    live('T30', 33, 180), // the feed says 3 minutes late
  ]);
  const [first, second, third] = predictions.towardDirection0;
  assert.deepEqual([first.live, first.delayMinutes], [true, 7]);
  assert.deepEqual([second.live, second.delayMinutes], [true, 3]);
  // The untracked trip is the timetable's: no delay to tell.
  assert.deepEqual([third.live, third.delayMinutes], [false, null]);
});

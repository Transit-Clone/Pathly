const assert = require('node:assert/strict');
const test = require('node:test');

const { alertMessage, isPeakTime, wantsAlertsNow } = require('../lib/routeAlerts');

// 2026-10-26 is a Monday; New York is on EDT (UTC-4).
const nyc = (day, hour, minute = 0) => new Date(Date.UTC(2026, 9, day, hour + 4, minute));

test('peak is weekday 6-10 AM and 4-8 PM in New York', () => {
  assert.equal(isPeakTime(nyc(26, 5, 59)), false);
  assert.equal(isPeakTime(nyc(26, 6)), true);
  assert.equal(isPeakTime(nyc(26, 9, 59)), true);
  assert.equal(isPeakTime(nyc(26, 10)), false);
  assert.equal(isPeakTime(nyc(26, 17, 30)), true);
  assert.equal(isPeakTime(nyc(26, 20)), false);
  // Saturday morning rush hour isn't one.
  assert.equal(isPeakTime(nyc(24, 8)), false);
});

test('each setting decides whether to alert now', () => {
  assert.equal(wantsAlertsNow('all', nyc(24, 3)), true);
  assert.equal(wantsAlertsNow('peak', nyc(24, 8)), false);
  assert.equal(wantsAlertsNow('peak', nyc(26, 8)), true);
  assert.equal(wantsAlertsNow('off', nyc(26, 8)), false);
  assert.equal(wantsAlertsNow(undefined, nyc(26, 8)), false);
});

test('the push names the line and says what is wrong', () => {
  assert.deepEqual(
    alertMessage({ agencyId: 'subway', routeId: '1', shortName: '1' }, { id: 'a', header: 'No trains between 96 St and 242 St', description: null }),
    { title: '1 service alert', body: 'No trains between 96 St and 242 St' },
  );
});

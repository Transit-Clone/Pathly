const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { subwayAccessibleStopIds } = require('../lib/accessibleStops');

describe('subway accessible stops', () => {
  it('keeps fully accessible stations and only the accessible direction of partial ones', () => {
    assert.deepEqual(subwayAccessibleStopIds([
      { gtfs_stop_id: '127', ada: '1', ada_northbound: '1', ada_southbound: '1' },
      { gtfs_stop_id: 'R43', ada: '0', ada_northbound: '0', ada_southbound: '0' },
      { gtfs_stop_id: 'A41', ada: '2', ada_northbound: '1', ada_southbound: '0' },
    ]), ['127', '127N', '127S', 'A41N']);
  });
});

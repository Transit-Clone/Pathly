const assert = require('node:assert/strict');
const test = require('node:test');

const { fetchFeedEntities } = require('../lib/gtfsRealtime');

test('coalesces repeated provider failures instead of retrying once per route', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response('temporarily unavailable', { status: 503 });
  };

  try {
    const feedUrl = 'https://example.test/failed-gtfs-rt';
    await assert.rejects(fetchFeedEntities(feedUrl), /failed: 503/);
    await assert.rejects(fetchFeedEntities(feedUrl), /failed: 503/);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

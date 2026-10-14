/* global beforeEach */
// Firestore's mock (jest.setup.js) keeps data in memory; start every test with an empty database.
beforeEach(() => {
  globalThis.__mockAuthUser.email = 'rider@example.com';
  require('firebase/firestore').__resetMockFirestore();
  // Each test starts as a fresh app session, so it sends its own warm-up when its rider signs in.
  require('./src/data/backendWarmup').resetBackendWarmupForTests();
  require('./src/data/tripPlanning').resetTripPlanCacheForTests();
});

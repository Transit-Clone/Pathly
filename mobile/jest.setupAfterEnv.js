/* global beforeEach */
// Firestore's mock (jest.setup.js) keeps data in memory; start every test with an empty database.
beforeEach(async () => {
  // Saved display settings and preferences live on the device; every test starts with none.
  await require('@react-native-async-storage/async-storage').clear();
  globalThis.__mockAuthUser.email = 'rider@example.com';
  globalThis.__mockAuthUser.displayName = 'Pathly Rider';
  require('firebase/firestore').__resetMockFirestore();
  // Each test starts as a fresh app session, so it sends its own warm-up when its rider signs in.
  require('./src/data/backendWarmup').resetBackendWarmupForTests();
  require('./src/data/tripPlanning').resetTripPlanCacheForTests();
});

/* global beforeEach */
// Firestore's mock (jest.setup.js) keeps data in memory; start every test with an empty database.
beforeEach(() => {
  require('firebase/firestore').__resetMockFirestore();
});

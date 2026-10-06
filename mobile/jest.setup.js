jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// transit.ts has no React Native/Firebase dependencies of its own, so it's safe to pull in here
// and reuse its real station list/offsets for the Port Jefferson Branch geometry mock below —
// keeping the mock's data consistent with the app's own data instead of a hand-duplicated copy.
const { routeById: mockRouteById, stopsForDirection: mockStopsForDirection } = require('./src/data/transit');

// Firebase needs real project config (unavailable in Jest) and hits the network on init;
// stub it so existing screens still render as if a user is already signed in.
const mockUser = { uid: 'test-uid', email: 'rider@example.com', displayName: 'Pathly Rider' };

jest.mock('firebase/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('@firebase/auth', () => ({
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  onAuthStateChanged: jest.fn((_auth, callback) => {
    callback(mockUser);
    return () => undefined;
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getFirestore: jest.fn(() => ({})),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

// Resolves with one upcoming live prediction per direction and a tiny two-stop geometry by
// default, echoing back whatever routeId was actually requested (not a single hardcoded one —
// every live route needs to see its own routeId match, or applyRouteLive treats it as a
// mismatch and reports an error status, same as it would for real mismatched data).
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn((_functions, name) => {
    if (name === 'getNearestRouteStop') {
      // Echoes back a stop distinct from any route's hardcoded fallback (see transit.ts) so
      // tests can tell the dynamic nearest-stop lookup actually overrode it.
      return jest.fn((request) => Promise.resolve({
        data: {
          stopId: 'mock-nearest',
          name: `Mock Nearest Stop for ${request?.routeId ?? ''}`,
          lat: 40.85,
          lon: -73.42,
          distanceMeters: 321,
          direction1: { headsign: 'Mock Headsign 1', stopId: 'mock-nearest-1' },
          direction0: { headsign: 'Mock Headsign 0', stopId: 'mock-nearest-0' },
        },
      }));
    }
    if (name === 'getRouteGeometry') {
      return jest.fn((request) => {
        if (request?.routeId === '10') {
          // The Port Jefferson Branch's real station list/offsets (transit.ts), reused rather
          // than hand-duplicated, so tests asserting specific real stop names/times (e.g.
          // "Port Jefferson, departs 10:04 AM") exercise the same data the real backend would
          // return. ronkonkoma's liveSource has direction1Index: 0, so GTFS direction_id 1
          // corresponds to `directions` index 0.
          const directionIndex = request.directionId === 1 ? 0 : 1;
          const stops = mockStopsForDirection(mockRouteById.ronkonkoma, directionIndex);
          return Promise.resolve({
            data: {
              headsign: 'Mock Destination',
              stops: stops.map((stop, i) => ({ stopId: String(i), name: stop.name, lat: 40.9 - i * 0.01, lon: -73.1 + i * 0.01, offsetMinutes: stop.offsetMinutes })),
            },
          });
        }
        // Other live routes (E, 7) just need a plausible stop count for map-rendering tests —
        // stop counts mirror the real station counts those tests assert on (E train: 32, 7
        // train: 21), with real-feeling, monotonically increasing offsets.
        const stopCountByRouteId = { E: 32, '7': 21 };
        const stopCount = stopCountByRouteId[request?.routeId] ?? 2;
        return Promise.resolve({
          data: {
            headsign: 'Mock Destination',
            stops: Array.from({ length: stopCount }, (_, i) => ({
              stopId: `mock-${i}`,
              name: `Mock Stop ${i}`,
              lat: 40.9 - i * 0.01,
              lon: -73.1 + i * 0.01,
              offsetMinutes: i * 2,
            })),
          },
        });
      });
    }
    return jest.fn((request) => Promise.resolve({
      data: {
        routeId: request?.routeId ?? '',
        routeName: 'Mock Route',
        vehicles: [],
        stopPredictions: {
          towardDirection1: [{ minutes: 4, live: true, peakOffpeak: null }],
          towardDirection0: [{ minutes: 18, live: false, peakOffpeak: null }],
        },
      },
    }));
  }),
}));

// Keep location deterministic in tests: permission denied, so screens render with the
// Stony Brook fallback rather than racing a real (mocked) GPS lookup.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
  Accuracy: { Balanced: 3 },
}));

// react-native-maps needs a real native module (TurboModule) that doesn't exist under Jest.
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  const MockMapView = forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return <View {...props} />;
  });
  const MockPolygon = (props) => <View {...props} />;
  const MockMarker = (props) => <View {...props} />;
  const MockPolyline = (props) => <View {...props} />;
  return {
    __esModule: true,
    default: MockMapView,
    PROVIDER_GOOGLE: 'google',
    Polygon: MockPolygon,
    Marker: MockMarker,
    Polyline: MockPolyline,
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  const MockIcon = ({ name, ...props }) => <Text {...props}>{name}</Text>;
  MockIcon.font = {};
  return { __esModule: true, default: MockIcon };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  const MockIcon = ({ name, ...props }) => <Text {...props}>{name}</Text>;
  MockIcon.font = {};
  return { __esModule: true, default: MockIcon };
});

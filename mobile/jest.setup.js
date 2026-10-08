jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// transit.ts has no React Native/Firebase dependencies of its own, so it's safe to pull in here
// and reuse its real station list/offsets for the Port Jefferson Branch geometry mock below —
// keeping the mock's data consistent with the app's own data instead of a hand-duplicated copy.
const { routeById: mockRouteById, routes: mockRoutes, stopsForDirection: mockStopsForDirection } = require('./src/data/transit');

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

// A tiny in-memory Firestore: refs are just paths, writes notify listeners synchronously (like
// Firestore's local-write latency compensation), and collections list newest write first.
// jest.setupAfterEnv.js empties it before each test.
jest.mock('firebase/firestore', () => {
  const mockDocs = new Map();
  const mockListeners = new Set();
  const ref = (_db, ...segments) => ({ path: segments.join('/') });
  const snapshotOf = (collectionPath) => ({
    docs: [...mockDocs]
      .filter(([path]) => path.startsWith(`${collectionPath}/`) && !path.slice(collectionPath.length + 1).includes('/'))
      .reverse()
      .map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })),
  });
  const notify = () => mockListeners.forEach((listener) => listener.onNext(snapshotOf(listener.path)));
  return {
    __resetMockFirestore: () => {
      mockDocs.clear();
      mockListeners.clear();
    },
    collection: jest.fn(ref),
    deleteDoc: jest.fn((docRef) => {
      mockDocs.delete(docRef.path);
      notify();
      return Promise.resolve();
    }),
    doc: jest.fn(ref),
    getFirestore: jest.fn(() => ({})),
    limit: jest.fn(),
    onSnapshot: jest.fn((queryRef, onNext) => {
      const listener = { path: queryRef.path, onNext };
      mockListeners.add(listener);
      onNext(snapshotOf(listener.path));
      return () => mockListeners.delete(listener);
    }),
    orderBy: jest.fn(),
    query: jest.fn((collectionRef) => collectionRef),
    runTransaction: jest.fn(async (_db, update) => {
      await update({
        get: async (docRef) => ({ exists: () => mockDocs.has(docRef.path), data: () => mockDocs.get(docRef.path) }),
        set: (docRef, data) => {
          mockDocs.set(docRef.path, data);
          notify();
        },
      });
    }),
    serverTimestamp: jest.fn(() => null),
    setDoc: jest.fn((docRef, data) => {
      mockDocs.delete(docRef.path);
      mockDocs.set(docRef.path, data);
      notify();
      return Promise.resolve();
    }),
  };
});

// Resolves with one upcoming live prediction per direction and a tiny two-stop geometry by
// default, echoing back whatever routeId was actually requested (not a single hardcoded one —
// every live route needs to see its own routeId match, or applyRouteLive treats it as a
// mismatch and reports an error status, same as it would for real mismatched data).
jest.mock('firebase/functions', () => {
  // Every callable's mock, by name, so the batch mock can answer through the per-route one.
  const mockCallables = new Map();
  const create = (name) => {
    if (name === 'findNearbyTransit') {
      // Mirrors every demo-catalog live route as a "discovered" result, so tests can open a
      // route through the real dynamic-discovery path, not just a pinned one. Which of these
      // actually show up in the Nearby list is production code's job (HomeScreen.tsx's
      // filterOutPinnedDuplicates), not this mock's — a pinned route's real line (e.g.
      // ronkonkoma/LIRR route 10) is correctly excluded only while it's actually pinned.
      return jest.fn(() => Promise.resolve({
        data: {
          routes: mockRoutes
            .filter((route) => route.liveSource)
            .map((route) => ({
              agencyId: route.liveSource.agencyId,
              agencyDisplayName: route.agency,
              routeId: route.liveSource.routeId,
              routeName: route.routeName,
              shortName: route.shortName,
              color: route.color,
              distanceMeters: 500,
              direction1: { stopId: route.liveSource.direction1StopId, name: route.directions[0].stopName, headsign: route.directions[0].direction },
              direction0: { stopId: route.liveSource.direction0StopId, name: route.directions[1].stopName, headsign: route.directions[1].direction },
            })),
        },
      }));
    }
    if (name === 'getNearestRouteStop') {
      // Echoes back stops distinct from any route's hardcoded fallback (see transit.ts) so
      // tests can tell the dynamic nearest-stop lookup actually overrode it. Each direction
      // gets its own stop/name, matching the real backend never assuming they share a station.
      return jest.fn((request) => Promise.resolve({
        data: {
          distanceMeters: 321,
          direction1: { stopId: 'mock-nearest-1', name: `Mock Nearest Stop 1 for ${request?.routeId ?? ''}`, headsign: 'Mock Headsign 1' },
          direction0: { stopId: 'mock-nearest-0', name: `Mock Nearest Stop 0 for ${request?.routeId ?? ''}`, headsign: 'Mock Headsign 0' },
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
          // Each station sits at the same spot in both directions (positioned by its westbound
          // order), so the eastbound list and path run the opposite way across the map.
          const lastStop = stops.length - 1;
          const place = (i) => (request.directionId === 1 ? i : lastStop - i);
          return Promise.resolve({
            data: {
              headsign: 'Mock Destination',
              stops: stops.map((stop, i) => ({ stopId: String(i), name: stop.name, lat: 40.9 - place(i) * 0.01, lon: -73.1 + place(i) * 0.01, offsetMinutes: stop.offsetMinutes })),
              // A real-shape-like path: three points per stop-to-stop hop, so tests can tell it
              // apart from a line that simply joins the stops.
              path: Array.from({ length: lastStop * 3 + 1 }, (_, i) => {
                const at = request.directionId === 1 ? i : lastStop * 3 - i;
                return { lat: 40.9 - (at / 3) * 0.01, lon: -73.1 + (at / 3) * 0.01 + (at % 3 ? 0.002 : 0) };
              }),
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
    if (name === 'getRoutesLiveStatus') {
      // Answers each route through the getRouteLiveStatus mock, so tests that customize that one
      // (and count its calls by routeId) cover batched requests too.
      return jest.fn((request) => Promise.all((request?.routes ?? []).map((route) => mockCallables.get('getRouteLiveStatus')({
        ...route,
        ...(request.lat !== undefined ? { lat: request.lat, lon: request.lon } : {}),
      }).then(({ data }) => ({ ok: true, data }), () => ({ ok: false, code: 'internal' })))).then((results) => ({ data: { results } })));
    }
    if (name === 'getStopDepartures') {
      // A short full-day list: one live departure, then the timetable.
      return jest.fn(() => Promise.resolve({
        data: {
          departures: [
            { minutes: 4, live: true, peakOffpeak: null },
            { minutes: 34, live: false, peakOffpeak: null },
            { minutes: 95, live: false, peakOffpeak: null },
          ],
        },
      }));
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
  };
  return {
    getFunctions: jest.fn(() => ({})),
    httpsCallable: jest.fn((_functions, name) => {
      if (!mockCallables.has(name)) mockCallables.set(name, create(name));
      return mockCallables.get(name);
    }),
  };
});

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
  // Shared across every map instance so tests can assert when a map was told to move, and set
  // the camera a map reports (e.g. rotated by the rider).
  const mockAnimateToRegion = jest.fn();
  const mockAnimateCamera = jest.fn();
  const mockFitToCoordinates = jest.fn();
  const mockCamera = { heading: 0, pitch: 0 };
  const MockMapView = forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({
      animateToRegion: mockAnimateToRegion,
      animateCamera: mockAnimateCamera,
      fitToCoordinates: mockFitToCoordinates,
      getCamera: () => Promise.resolve({ ...mockCamera, center: { latitude: 0, longitude: 0 }, zoom: 14 }),
    }));
    return <View {...props} />;
  });
  const MockPolygon = (props) => <View {...props} />;
  const MockMarker = (props) => <View {...props} />;
  const MockPolyline = (props) => <View {...props} />;
  return {
    __esModule: true,
    default: MockMapView,
    mockAnimateToRegion,
    mockAnimateCamera,
    mockCamera,
    mockFitToCoordinates,
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

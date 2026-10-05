jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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

// Resolves with no live/static predictions by default; keeps screens on their static fallback data in tests.
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({
    data: {
      routeId: '10',
      routeName: 'Port Jefferson Branch',
      vehicles: [],
      stopPredictions: { towardDirection1: [], towardDirection0: [] },
    },
  }))),
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

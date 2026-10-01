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

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
}));

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

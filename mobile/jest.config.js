// jest-expo's default `.[jt]sx?` transform doesn't cover @firebase/util's tiny .mjs
// postinstall hint file; reuse the same babel-jest transformer for it.
const { transform: presetTransform } = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['App.tsx', 'src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  watchman: false,
  transform: {
    '\\.mjs$': presetTransform['\\.[jt]sx?$'],
  },
  // jest-expo's default allowlist doesn't include firebase, whose "firebase/auth" resolves
  // to an ESM build under Jest's module resolution (no "react-native" export condition there).
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|firebase|@firebase))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};

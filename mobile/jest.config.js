module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['App.tsx', 'src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  watchman: false,
};

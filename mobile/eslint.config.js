const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['.expo/**', 'coverage/**', 'dist/**']),
  expoConfig,
  {
    rules: {
      'react/jsx-boolean-value': ['error', 'always'],
      // tsc already checks namespace members, and this rule misreads SDK 58's compiled enums
      // (e.g. Notifications.AndroidImportance).
      'import/namespace': 'off',
    },
  },
]);

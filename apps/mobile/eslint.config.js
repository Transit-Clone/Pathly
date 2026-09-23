const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['.expo/**', 'coverage/**', 'dist/**']),
  expoConfig,
  {
    rules: {
      'react/jsx-boolean-value': ['error', 'always'],
    },
  },
]);

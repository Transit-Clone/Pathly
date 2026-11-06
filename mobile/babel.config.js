// Expo's default preset. Tests also run the React Compiler, as app builds do (app.config.js
// `experiments.reactCompiler`), which Jest's Babel caller doesn't turn on by itself.
const path = require('path');

const appSource = [path.join(__dirname, 'src') + path.sep, path.join(__dirname, 'App.tsx')];

module.exports = function config(api) {
  api.cache.using(() => process.env.NODE_ENV);
  return {
    presets: ['babel-preset-expo'],
    env: {
      test: {
        // The app's own code only: test files and jest.setup.js's mock factories stay as written.
        plugins: [['babel-plugin-react-compiler', { sources: (filename) => appSource.some((prefix) => filename.startsWith(prefix)) }]],
      },
    },
  };
};

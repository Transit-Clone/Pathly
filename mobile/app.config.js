module.exports = {
  expo: {
    name: 'Pathly',
    slug: 'pathly',
    version: '0.1.0',
    orientation: 'portrait',
    // Icon, adaptive icon, splash, and favicon are drawn by scripts/make-icons.mjs.
    icon: './assets/icon.png',
    scheme: 'pathly',
    userInterfaceStyle: 'automatic',
    platforms: ['ios', 'android', 'web'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pathly.prototype',
    },
    android: {
      package: 'com.pathly.prototype',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0B4F9C',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png',
      output: 'single',
    },
    plugins: [
      'expo-status-bar',
      'expo-web-browser',
      'expo-sharing',
      ['expo-notifications', { color: '#0B4F9C' }],
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      ],
      [
        'expo-splash-screen',
        {
          // The logo alone on the app's own light or dark background (App.tsx's LoadingScreen).
          backgroundColor: '#F7FAFF',
          image: './assets/pathly-mark.png',
          imageWidth: 140,
          dark: {
            backgroundColor: '#000000',
            image: './assets/pathly-mark.png',
          },
          resizeMode: 'contain',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Pathly uses your location to center the map on you and show nearby transit.',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'ddb0b432-4e44-463e-b30e-3f60be0ca6b2',
      },
    },
  },
};

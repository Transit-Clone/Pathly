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
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
    },
    android: {
      package: 'com.pathly.prototype',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0B4F9C',
      },
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png',
      output: 'single',
    },
    plugins: [
      'expo-web-browser',
      'expo-sharing',
      ['expo-notifications', { color: '#0B4F9C' }],
      [
        'expo-splash-screen',
        {
          // The mascot alone on brand blue, in light and dark mode alike.
          backgroundColor: '#0B4F9C',
          image: './assets/splash-icon.png',
          imageWidth: 160,
          dark: {
            backgroundColor: '#0B4F9C',
            image: './assets/splash-icon.png',
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

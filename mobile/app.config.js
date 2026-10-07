module.exports = {
  expo: {
    name: 'Pathly',
    slug: 'pathly',
    version: '0.1.0',
    orientation: 'portrait',
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
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
    },
    web: {
      bundler: 'metro',
      output: 'single',
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F7FAFF',
          image: './assets/pathly-logo.png',
          imageWidth: 220,
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

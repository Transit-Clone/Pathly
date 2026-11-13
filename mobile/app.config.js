const fs = require('fs');
const path = require('path');
const { readAdminEmails } = require('../scripts/adminEmails.cjs');

// Who sees Admin tools: the backend's own list (ADMIN_EMAILS in firebase/functions/.env.<project-id>),
// so the two can't drift apart. Expo compiles EXPO_PUBLIC_ variables into the app on every
// platform (web included, unlike `extra`), so pass it on as one. The backend still checks every
// admin call itself.
const adminEmails = readAdminEmails()?.value;
if (adminEmails) process.env.EXPO_PUBLIC_ADMIN_EMAILS = adminEmails;

// Firebase's Android config (needed for push notifications through FCM). EAS builds read it from
// the GOOGLE_SERVICES_JSON file variable; local builds read mobile/google-services.json. Both are
// optional so the app still starts without push.
const localGoogleServices = path.join(__dirname, 'google-services.json');
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(localGoogleServices) ? './google-services.json' : undefined);

module.exports = {
  expo: {
    name: 'Pathly',
    slug: 'pathly',
    // EAS account that builds and submits the app.
    owner: 'pathlyapp',
    version: '0.1.0',
    orientation: 'portrait',
    // Icon, adaptive icon, splash, and favicon are drawn by scripts/make-icons.mjs.
    icon: './assets/icon.png',
    scheme: 'pathly',
    userInterfaceStyle: 'automatic',
    platforms: ['ios', 'android', 'web'],
    // Memoizes components and hooks at build time, so a state change re-renders only what reads it.
    // The web build lives at pathly.web.app/app; the landing page (website/) has the root.
    // Native builds ignore baseUrl.
    experiments: { reactCompiler: true, baseUrl: '/app' },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pathly.app',
    },
    android: {
      // Permanent once the app is uploaded to Google Play.
      package: 'com.pathly.app',
      ...(googleServicesFile ? { googleServicesFile } : {}),
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
      [
        'expo-build-properties',
        {
          android: {
            // Store builds shrink the code, which renamed Android WorkManager's database class
            // (pulled in by a dependency) so it couldn't be found, and the app crashed as it opened.
            extraProguardRules: [
              '-keep class androidx.work.** { *; }',
              '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
            ].join('\n'),
          },
        },
      ],
    ],
    extra: {
      eas: {
        // @pathlyapp/pathly on expo.dev
        projectId: 'deefeb3d-b292-44e7-8e70-64f8f7bf6a87',
      },
    },
  },
};

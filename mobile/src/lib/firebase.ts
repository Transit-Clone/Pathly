import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseOptions, getApps, initializeApp } from 'firebase/app';
// The RN-specific persistence helper is only exposed via @firebase/auth's "react-native"
// export condition; the firebase/auth wrapper package doesn't re-export it for tsc.
import { getReactNativePersistence, initializeAuth } from '@firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

/** Populated from mobile/.env (copy .env.example); these are safe to ship in the app bundle. */
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

/** Cloud Functions client; call e.g. httpsCallable(functions, 'geocode') from a feature module. */
export const functions = getFunctions(app);

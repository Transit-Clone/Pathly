import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseOptions, getApps, initializeApp } from 'firebase/app';
// The RN-specific persistence helper is only exposed via @firebase/auth's "react-native"
// export condition; the firebase/auth wrapper package doesn't re-export it for tsc.
import { getReactNativePersistence, initializeAuth } from '@firebase/auth';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { Platform } from 'react-native';

import { isRequestLogEnabled, recordRequest } from '../debug/requestLog';
import { initializePlatformAppCheck } from './firebaseAppCheck';

/** Populated from mobile/.env; these are safe to ship in the app bundle. */
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
initializePlatformAppCheck(app);

// @firebase/auth's "react-native" build (which getReactNativePersistence requires) has no
// web implementation; on web, the regular browser-persisted getAuth() is the right call.
export const auth = Platform.OS === 'web' ? getAuth(app) : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(app);

/** Cloud Functions client; feature modules call functions through `callable` below. */
export const functions = getFunctions(app);

/**
 * A Cloud Functions callable, recorded in the admin's Recent requests list when an admin is
 * signed in. `summarize` keeps that list small (and keeps provider content out of it).
 */
export function callable<Request, Response>(name: string, summarize?: (response: Response) => unknown) {
  const call = httpsCallable<Request, Response>(functions, name);
  return async (data?: Request): Promise<HttpsCallableResult<Response>> => {
    if (!isRequestLogEnabled()) return call(data);
    const startedAt = Date.now();
    try {
      const result = await call(data);
      recordRequest({ name, startedAt, ms: Date.now() - startedAt, ok: true, request: data ?? null, ...(summarize ? { responseSummary: summarize(result.data) } : {}) });
      return result;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      recordRequest({ name, startedAt, ms: Date.now() - startedAt, ok: false, ...(typeof code === 'string' ? { code } : {}), request: data ?? null });
      throw error;
    }
  };
}

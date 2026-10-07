import { type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

let initialized = false;

export function initializePlatformAppCheck(app: FirebaseApp): void {
  if (initialized) return;
  const siteKey = process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) return;

  // Localhost uses a Firebase-console-registered debug token; production web builds use
  // reCAPTCHA Enterprise. The generated debug token must never be committed or shared.
  if (__DEV__) {
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
}

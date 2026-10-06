import type { FirebaseApp } from 'firebase/app';

/**
 * Firebase's JavaScript SDK needs a custom native-attestation provider in React Native.
 * Keep this explicit no-op until the native Firebase apps are registered and wired to
 * App Attest/DeviceCheck (iOS) and Play Integrity (Android); see README.md.
 */
export function initializePlatformAppCheck(_app: FirebaseApp): void {}

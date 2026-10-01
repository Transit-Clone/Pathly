import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

/**
 * @firebase/auth ships getReactNativePersistence only behind its "react-native" export
 * condition, but that condition's package.json entry lists "types" before "react-native",
 * so tsc always resolves to the browser types and misses this export. The JS value does
 * exist at runtime (Metro correctly picks the react-native build) — this just restores the type.
 */
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}

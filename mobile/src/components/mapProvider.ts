import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';

/**
 * Expo Go on iOS ships without the Google Maps SDK, so asking for the Google provider there draws
 * a blank map. Fall back to Apple Maps in that one case; development and store builds (and Android,
 * where Expo Go bundles Google Maps) keep Google. Apple Maps ignores `customMapStyle`.
 */
export const NATIVE_MAP_PROVIDER =
  Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? undefined : PROVIDER_GOOGLE;

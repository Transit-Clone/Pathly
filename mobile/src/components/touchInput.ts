import { Platform } from 'react-native';

/**
 * A web browser on a touch screen, where horizontal rows already scroll under the finger. Rows
 * that also scroll themselves for mouse drags must skip that here, or each swipe moves them twice.
 */
export const webTouchInput = Platform.OS === 'web'
  && typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: coarse)').matches === true;

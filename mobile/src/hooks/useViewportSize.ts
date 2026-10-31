import { useWindowDimensions } from 'react-native';

/** The screen size to lay pages out against. On native, simply the window (see the `.web` version). */
export function useViewportSize() {
  return useWindowDimensions();
}

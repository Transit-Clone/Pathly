import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is in the foreground (on web: the tab is visible). Live polling pauses while
 * it isn't, so a phone in a pocket or a forgotten browser tab doesn't keep the backend fetching
 * rate-limited live feeds for nobody.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

import { useEffect, useState } from 'react';

import { appNow } from '../debug/clock';
import { useDebug } from '../debug/DebugContext';

/**
 * Like useNow, but on the app's clock: an admin's mock time when one is set. For trip planning
 * and its labels; live predictions keep using useNow's real time.
 */
export function useClock(intervalMs: number) {
  const { mockTime } = useDebug();
  const [now, setNow] = useState(() => appNow());
  // Turning mock time on or off moves the clock at once, not at the next tick.
  const [seenMockTime, setSeenMockTime] = useState(mockTime);
  if (seenMockTime !== mockTime) {
    setSeenMockTime(mockTime);
    setNow(appNow());
  }
  useEffect(() => {
    const id = setInterval(() => setNow(appNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

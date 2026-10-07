import { useEffect, useState } from 'react';

/** Current time (epoch ms), re-rendering every `intervalMs`, for ticking "updated 3s ago" labels. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

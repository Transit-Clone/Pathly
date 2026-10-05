import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { fetchLirrBranchLiveData, type LirrBranchLiveData } from './lirrLive';

const POLL_INTERVAL_MS = 30_000;

const LirrLiveContext = createContext<LirrBranchLiveData | null>(null);

type LirrLiveProviderProps = {
  children: ReactNode;
  /** Which LIRR branch/stop to poll — see routes.txt/stops.txt in firebase/functions/static_data/lirr. */
  routeId: string;
  stopId: string;
};

/** Polls one LIRR branch's live data; stays mounted across HomeScreen's view switches. */
export function LirrLiveProvider({ children, routeId, stopId }: LirrLiveProviderProps) {
  const [data, setData] = useState<LirrBranchLiveData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchLirrBranchLiveData(routeId, stopId);
        if (!cancelled) setData(result);
      } catch {
        // Keep whatever was last fetched; consumers fall back to static data when null.
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [routeId, stopId]);

  return <LirrLiveContext.Provider value={data}>{children}</LirrLiveContext.Provider>;
}

/** Null until the first live fetch resolves (or if it's failing); callers should fall back to static data. */
export function useLirrLive() {
  return useContext(LirrLiveContext);
}

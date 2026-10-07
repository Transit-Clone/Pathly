import { useCallback, useEffect, useRef, useState } from 'react';

import {
  autocompletePlaces,
  createSessionToken,
  getPlacesApiKey,
  type SearchPlace,
} from '../data/placesSearch';

/** Wait for a pause in typing before asking Google; one constant to tune. */
export const PLACES_DEBOUNCE_MS = 300;

export type PlacesSearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'unconfigured';

type SettledResult = {
  query: string;
  attempt: number;
  status: 'success' | 'error';
  suggestions: readonly SearchPlace[];
};

const NO_SUGGESTIONS: readonly SearchPlace[] = [];

/**
 * Debounced Google place suggestions for `query`. Each new query (or retry) aborts the
 * previous request, and a response is only kept if it still matches the current query and
 * attempt, so late answers for older partial queries can never replace newer ones.
 */
export function usePlacesSearch(query: string) {
  const trimmedQuery = query.trim();
  const isConfigured = getPlacesApiKey().length > 0;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledResult | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  /** The current billing session's token, started lazily on the first request. */
  const getSessionToken = useCallback(() => {
    sessionTokenRef.current ??= createSessionToken();
    return sessionTokenRef.current;
  }, []);

  /** Call after the details request that ends a session (a place was picked). */
  const endSession = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!trimmedQuery || !isConfigured) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompletePlaces({
          input: trimmedQuery,
          sessionToken: getSessionToken(),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setSettled({ query: trimmedQuery, attempt, status: 'success', suggestions });
      } catch {
        if (!controller.signal.aborted) setSettled({ query: trimmedQuery, attempt, status: 'error', suggestions: NO_SUGGESTIONS });
      }
    }, PLACES_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, getSessionToken, isConfigured, trimmedQuery]);

  let status: PlacesSearchStatus = 'loading';
  if (!trimmedQuery) status = 'idle';
  else if (!isConfigured) status = 'unconfigured';
  else if (settled && settled.query === trimmedQuery && settled.attempt === attempt) status = settled.status;

  return {
    status,
    suggestions: status === 'success' && settled ? settled.suggestions : NO_SUGGESTIONS,
    retry,
    getSessionToken,
    endSession,
  };
}

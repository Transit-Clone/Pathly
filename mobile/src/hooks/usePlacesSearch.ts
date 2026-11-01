import { useCallback, useEffect, useRef, useState } from 'react';

import {
  autocompletePlaces,
  createSessionToken,
  getPlacesApiKey,
  type SearchPlace,
} from '../data/placesSearch';
import { addStationLines, mergeSearchResults, searchTransitStops } from '../data/stopSearch';

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

type SettledStops = { query: string; stops: readonly SearchPlace[] };
type SettledLines = { forSuggestions: readonly SearchPlace[]; lines: Map<string, Pick<SearchPlace, 'routes' | 'agency'>> };

/**
 * Debounced suggestions for `query`: Google's places in Google's order, then Pathly's own transit
 * stops (with their lines). Both are asked at once. Each new query (or retry) aborts the previous Google
 * request, and each answer is only kept if it still matches the current query (and attempt), so
 * late answers for older partial queries can never replace newer ones. The status is Google's: a
 * failed or slow stop search just leaves the stops out, and stops that arrive later are added
 * without reordering Google's rows. Google's own station rows get their lines from
 * Pathly's stops once Google has answered.
 */
export function usePlacesSearch(query: string, near?: { latitude: number; longitude: number } | null) {
  const trimmedQuery = query.trim();
  const isConfigured = getPlacesApiKey().length > 0;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledResult | null>(null);
  const [settledStops, setSettledStops] = useState<SettledStops | null>(null);
  const [settledLines, setSettledLines] = useState<SettledLines | null>(null);
  // Read when a search starts, so routine GPS updates don't search again.
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);
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
          origin: nearRef.current,
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

  useEffect(() => {
    if (!trimmedQuery) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchTransitStops(trimmedQuery, nearRef.current).then(
        (stops) => {
          if (!cancelled) setSettledStops({ query: trimmedQuery, stops });
        },
        () => undefined,
      );
    }, PLACES_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  // Google's answer for the current query, once it has one.
  const googleSuggestions = settled?.status === 'success' && settled.query === trimmedQuery && settled.attempt === attempt ? settled.suggestions : null;
  useEffect(() => {
    if (!googleSuggestions) return undefined;
    let cancelled = false;
    addStationLines(googleSuggestions, nearRef.current).then(
      (lines) => {
        if (!cancelled && lines.size > 0) setSettledLines({ forSuggestions: googleSuggestions, lines });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [googleSuggestions]);

  let status: PlacesSearchStatus = 'loading';
  if (!trimmedQuery) status = 'idle';
  else if (!isConfigured) status = 'unconfigured';
  else if (settled && settled.query === trimmedQuery && settled.attempt === attempt) status = settled.status;

  return {
    status,
    suggestions: status === 'success' && settled
      ? mergeSearchResults(
        settledStops?.query === trimmedQuery ? settledStops.stops : NO_SUGGESTIONS,
        settledLines?.forSuggestions === settled.suggestions
          ? settled.suggestions.map((place) => ({ ...place, ...settledLines.lines.get(place.id) }))
          : settled.suggestions,
      )
      : NO_SUGGESTIONS,
    retry,
    getSessionToken,
    endSession,
  };
}

import { useEffect, useState } from 'react';

import { callable } from '../lib/firebase';
import { readCache, writeCache } from './deviceCache';
import type { LiveSource } from './transit';

type AgencyId = LiveSource['agencyId'];

/** One line in the on-device index (firebase/functions/src/gtfsDiscovery.ts's IndexedLine). */
export type IndexedLine = { agencyId: AgencyId; agencyDisplayName: string; routeId: string; shortName: string; routeName: string; color: string };

const INDEX_KEY = 'pathly.lineIndex.v1';
// Lines change with timetable updates, a few times a year; a week-old index is still right.
const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const listTransitLinesCallable = callable<Record<string, never>, { lines: IndexedLine[] }>('listTransitLines');

let memoryIndex: readonly IndexedLine[] | null = null;
let loading: Promise<readonly IndexedLine[] | null> | null = null;

/**
 * Every line, kept on the device so a search for "1" or "S76" answers on the first keystroke.
 * Read from the device first, and refreshed from the backend once per app session.
 */
export function loadLineIndex(): Promise<readonly IndexedLine[] | null> {
  if (loading) return loading;
  loading = (async () => {
    const cached = await readCache<IndexedLine[]>(INDEX_KEY, INDEX_MAX_AGE_MS);
    if (cached?.length) memoryIndex = cached;
    const fresh = listTransitLinesCallable({}).then(({ data }) => {
      if (data.lines.length > 0) {
        memoryIndex = data.lines;
        void writeCache(INDEX_KEY, data.lines);
      }
      return memoryIndex;
    });
    if (memoryIndex) {
      // A cached index answers now; the fresh one replaces it in the background.
      fresh.catch(() => undefined);
      return memoryIndex;
    }
    return fresh.catch(() => {
      loading = null;
      return null;
    });
  })();
  return loading;
}

/** The line index once it's on the device (null until then), loading it on first use. */
export function useLineIndex(enabled: boolean): readonly IndexedLine[] | null {
  const [index, setIndex] = useState<readonly IndexedLine[] | null>(memoryIndex);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void loadLineIndex().then((lines) => {
      if (!cancelled && lines) setIndex(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return index;
}

/** Test isolation only. */
export function resetLineIndexForTests(index: readonly IndexedLine[] | null = null): void {
  memoryIndex = index;
  loading = index ? Promise.resolve(index) : null;
}

type Mode = 'subway' | 'bus' | 'rail' | 'ferry';

const AGENCY_MODE: Record<AgencyId, Mode> = {
  subway: 'subway', lirr: 'rail', nycferry: 'ferry', siferry: 'ferry',
  nice: 'bus', suffolk: 'bus', bx: 'bus', bk: 'bus', mn: 'bus', qn: 'bus', si: 'bus', busco: 'bus',
};
// Rail, subway and ferry lines come first: they're what people search for by name.
const MODE_RANK: Record<Mode, number> = { subway: 0, rail: 0, ferry: 1, bus: 2 };

/** Words that say which kind of line is meant, and the agencies or modes they narrow to. */
const FILTER_WORDS: { words: readonly string[]; keep: (line: IndexedLine) => boolean }[] = [
  { words: ['subway', 'train', 'trains', 'metro', 'mta subway'], keep: (line) => line.agencyId === 'subway' || line.agencyId === 'lirr' },
  { words: ['lirr', 'long island rail road', 'long island railroad', 'rail', 'railroad'], keep: (line) => line.agencyId === 'lirr' },
  { words: ['bus', 'buses'], keep: (line) => AGENCY_MODE[line.agencyId] === 'bus' },
  { words: ['ferry', 'ferries', 'boat'], keep: (line) => AGENCY_MODE[line.agencyId] === 'ferry' },
  { words: ['nice', 'n i c e', 'nassau'], keep: (line) => line.agencyId === 'nice' },
  { words: ['suffolk', 'sct', 'suffolk county transit'], keep: (line) => line.agencyId === 'suffolk' },
  { words: ['sbs', 'select bus', 'select bus service', 'select'], keep: (line) => /-SBS$|\+$/i.test(line.shortName) || /-SBS$|\+$/i.test(line.routeId) },
  { words: ['express bus'], keep: (line) => /^(X|BM|BxM|QM|SIM)\d/i.test(line.shortName) },
];
/** Words that carry nothing once stripped: "the 1 line", "route 51", "S76 bus route". */
const FILLER_WORDS = new Set(['the', 'line', 'lines', 'route', 'routes', 'branch', 'number', 'no', 'mta', 'nyc', 'take', 'to']);

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
/** A line code compacted for comparing: "M15-SBS", "M15 SBS" and "m15+" all read "m15+". */
const compactCode = (text: string) => text.toLowerCase().replace(/[-\s]*sbs$/, '+').replace(/[^a-z0-9+]/g, '');

/** A line's own codes: its short name, its route id, and the subway's "6X" as "6 express". */
function lineCodes(line: IndexedLine): string[] {
  const codes = [compactCode(line.shortName), compactCode(line.routeId)];
  const express = /^([0-9A-Z])X$/i.exec(line.shortName);
  if (line.agencyId === 'subway' && express) codes.push(`${express[1]!.toLowerCase()}express`);
  return [...new Set(codes.filter(Boolean))];
}

const MAX_RESULTS = 12;
const MAX_BROWSE_RESULTS = 40;

/**
 * Each line once: MTA's borough bus feeds overlap (the Bronx and Staten Island feeds both carry
 * Brooklyn's routes), and an index saved before the backend removed the copies still has them.
 */
function uniqueLines(lines: readonly IndexedLine[]): IndexedLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.agencyDisplayName}:${line.routeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Lines matching what the rider typed, best first, on the device. Understands a line's code
 * ("1", "S76", "m15 sbs", "Q44+", "6 express"), words of its name ("port jeff", "east river"), and
 * words that narrow the kind ("train", "bus", "ferry", "LIRR", "NICE", "SBS", "express bus"); a
 * kind on its own ("ferry") lists every line of that kind.
 */
export function searchLineIndex(index: readonly IndexedLine[], query: string): IndexedLine[] {
  let text = ` ${normalize(query)} `;
  const filters: ((line: IndexedLine) => boolean)[] = [];
  // Longest phrases first, so "express bus" and "select bus" win over "bus".
  for (const filter of [...FILTER_WORDS].sort((a, b) => Math.max(...b.words.map((w) => w.length)) - Math.max(...a.words.map((w) => w.length)))) {
    for (const word of [...filter.words].sort((a, b) => b.length - a.length)) {
      if (text.includes(` ${word} `)) {
        filters.push(filter.keep);
        text = text.replace(` ${word} `, ' ');
        break;
      }
    }
  }
  const tokens = text.split(' ').filter((token) => token && !FILLER_WORDS.has(token));
  const candidates = index.filter((line) => filters.every((keep) => keep(line)));
  if (tokens.length === 0) {
    if (filters.length === 0) return [];
    return uniqueLines(sortLines(candidates.map((line) => ({ line, score: 1 })))).slice(0, MAX_BROWSE_RESULTS);
  }

  const code = compactCode(tokens.join(''));
  const scored = candidates.flatMap((line) => {
    const codes = lineCodes(line);
    // A bus's long name is just where it runs ("Jamaica - Hempstead"), so a bus is found by its code:
    // searching a place like "Jamaica" then lists that place, not every bus ending there.
    // Rail, subway and ferry names are what riders call them ("Port Jefferson Branch").
    const nameWords = normalize(AGENCY_MODE[line.agencyId] === 'bus' ? line.agencyDisplayName : `${line.routeName} ${line.agencyDisplayName}`).split(' ');
    let score = 0;
    if (codes.includes(code)) score = 100;
    // "S7" finds S74, S76, S78 (but "1" alone shouldn't list every route starting with 1).
    else if (code.length >= 2 && codes.some((own) => own.startsWith(code) && own.length - code.length <= 2)) score = 60 - codes[0]!.length;
    // Name words need two letters: "a" alone would match every Avenue.
    else if (tokens.every((token) => (token.length >= 2 && nameWords.some((word) => word.startsWith(token))) || codes.includes(compactCode(token)))) score = 30;
    return score > 0 ? [{ line, score }] : [];
  });
  return uniqueLines(sortLines(scored)).slice(0, MAX_RESULTS);
}

function sortLines(scored: { line: IndexedLine; score: number }[]): IndexedLine[] {
  return scored.sort((a, b) => b.score - a.score
    || MODE_RANK[AGENCY_MODE[a.line.agencyId]] - MODE_RANK[AGENCY_MODE[b.line.agencyId]]
    || a.line.shortName.length - b.line.shortName.length
    || a.line.shortName.localeCompare(b.line.shortName, undefined, { numeric: true }))
    .map(({ line }) => line);
}

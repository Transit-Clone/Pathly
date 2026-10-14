# Tasks

## 1. Backend: stop search

- [x] 1.1 Add `src/stopSearch.ts`:
  - the name normalizer;
  - the lazily built index over every agency (parent-station grouping, same-name merging within 150 m, the route union in agency order, mode and agency label);
  - `searchStops(query, near?)` with the scoring and tie-breaks from design decision 1.

  Verify with `test/stopSearch.test.js` against the checked-in GTFS data:
  - "jamaica" returns the LIRR and subway Jamaica stations, each once;
  - a subway station merges its N/S platforms into one entry with all its lines;
  - a two-way bus stop merges into one entry;
  - `near` reorders same-score results;
  - a 1-character query returns nothing.
- [x] 1.2 Add the `searchTransitStops` callable in `src/index.ts` (`protectedCallableOptions`, `RATE_LIMITS.searchTransitStops = { userPerMinute: 60 }`, input validation). Verify with tests that it requires auth, consumes a rate-limit token, and rejects an over-long query. Run `npm test` and `npm run build`.

## 2. Client: data

- [x] 2.1 In `data/placesSearch.ts`, map `placePrediction.types` to `kind`, and add `kind`, `routes`, and `source` to `SearchPlace`. Add `data/stopSearch.ts` (the callable client and the shared normalizer). Verify with `placesSearch.test.ts`: types map to kinds, with a plain `transit_station` mapping to rail.
- [x] 2.2 In `usePlacesSearch`, run both searches in parallel with separate stale guards, and merge them (stops first, at most 3, then Google's minus duplicates). Stop failures are silent, and late stops are inserted above Google's rows. Verify with hook tests: the merge order, duplicate removal, Google-only results on a stop failure, and late stops not reordering Google's rows.

## 3. Client: rows

- [x] 3.1 In `SearchView`: kind icons (add a `ferry` glyph to `Icon`), stop rows with up to 6 `RouteBadge`s and "+N", the agency line, the accessibility label, and selecting a stop without a details request. Recents keep kind and routes. Verify with App tests:
  - typing "jamaica" shows the stop rows first with badges, then Google rows;
  - a Google `subway_station` row shows the subway icon;
  - selecting a stop opens Route Results without calling `fetchPlaceDetails`;
  - the stop's recent row shows its badges.

## 3b. Follow-up after review (2026-10-14)

- [x] 3b.1 Stop rows say what they are ("LIRR station", "Subway station", "Bus stop · <agency>"). Google's own station rows get their lines: `searchTransitStops` also takes `stations` (Google station names and kinds) and `lookupStations` matches them to Pathly stops, ignoring station words and treating "42nd" as "42". Station complexes combine their lines (within 300 m) in both search and lookup. Verified with `stopSearch.test.js` (Jamaica Station, Times Square-42nd Street, Grand Central, Sutphin Blvd, no match, the callable's validation) and an App test (Sutphin's Google row shows E, J, and Z).
- [x] 3b.2 While typing, up to three matching recent searches come first and aren't repeated in the results; a recent stop says "Recent · …". Verified with an App test ("jamaica" shows the recent Jamaica first, once; "sutphin" shows no recents).

## 4. Integration check

- [ ] 4.1 Run `npm test` and `npm run build` in `firebase/functions`, and `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`. After deploying, on web at phone width in light and dark: search "jamaica", "stony brook", "penn", and "nicolls rd"; check the icons, badges, and lack of duplicates; pick a stop and confirm Route Results plans to it.

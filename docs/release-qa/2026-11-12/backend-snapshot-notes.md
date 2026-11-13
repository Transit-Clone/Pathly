# Backend snapshot check and route performance notes

Read-only follow-up to the mobile QA integration on November 12, 2026. No Firebase source, test, configuration, or Git reference was changed.

## Backend failure: local incomplete snapshot cache

The root integration run reported 214/215 backend tests passing, with `activates new remote snapshots through the static-data readers and keeps the last good version` throwing at `firebase/functions/test/gtfsSnapshots.test.js:659` (`routesById.get('10').name`).

- Reusing this machine's normal temporary directory reproduces it in the isolated whole test file: **45/46 pass**, same assertion. [Evidence](backend-snapshots-isolated.txt).
- Running the same compiled code and whole test file with a fresh unique `TMPDIR` gives **46/46 pass**. [Evidence](backend-snapshots-fresh-tmp.txt).
- `git diff --name-only -- firebase` is empty. The mobile-only changes have no dependency on this server-side cache path.

The existing local content-addressed directory for the second fixture version (`7d6597859a1e2a9f5c8aed6966f0f1719127751a6a35cdfcd0a74557e5bcdb8f`) contained only `derived/`; `routes.txt` and `trips.txt` were absent. The first version was correctly pruned after activation of the second. The origin of the incomplete directory is unknown.

The source explains why reuse does not repair it: `gtfsSnapshots.ts:1745,1747` accepts an existing destination after a rename conflict without validating its contents. The freshly downloaded staging directory is then removed at `:1791`. `gtfsFeed.ts:24` silently returns an empty array for a missing CSV, so the active cache has no route 10 and the assertion fails. A unique clean temporary directory avoids this stale content-addressed entry and passes.

Classification: **preexisting local cache/test-isolation failure, with a separate backend robustness opportunity**. It is not evidence that mobile navigation edits broke backend snapshot updates. A future server-side fix should validate/rebuild an incomplete existing target and add a regression, or isolate each suite's cache directory. Do not blindly delete a cache potentially shared by another running test. A fresh per-run `TMPDIR` provides a clean validation baseline without deleting it.

## Route performance: concrete source observations

- `useTripVehicles.ts:81-111` pauses its 15-second map polling while the app is inactive, cancels state updates after cleanup, and fetches geometry once per stable line key. `legLines` also deduplicates the same agency/route/direction within an itinerary (`:32-49`). These are useful existing safeguards.
- There is a bounded request-sharing opportunity when signed-in ride sharing is enabled: Home keeps `useTripRide` mounted for the current transit leg (`HomeScreen.tsx:249-253`), and the En Route view simultaneously mounts `useTripVehicles` (`EnrouteNavigationView.tsx:130`). Each makes its own 15-second `fetchRouteLiveData` call (`useTripRide.ts:49-68`; `useTripVehicles.ts:85-96`). `transitLive.ts:95-100` and `lib/firebase.ts:40-54` perform direct callables with no request deduplication. Therefore that leg can receive two overlapping client requests per cycle. Shared keyed in-flight results/a short live-data cache or a common owner would remove that duplication. Request-count instrumentation should verify its actual cost before changing behavior.
- `useTripRide` lacks the app-active polling guard that the map hook has (`useTripRide.ts:51-68`). It should be considered together with the intended native ride-sharing/background behavior, rather than adding a background pause during a UI polish pass.
- Guidance already deduplicates spoken transitions and progress notification copy (`useTripGuidanceAlerts.ts:64-99`). Repeated location fixes do not inherently mean repeated notifications. No speculative memoization or timing changes were made.

These are source observations, not a measured frame-rate, battery, network-latency, or physical-device performance assessment.

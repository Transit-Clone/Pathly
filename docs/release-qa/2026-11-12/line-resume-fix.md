# Line-based Ride Guide resume fix

## Problem and implementation

Route View → Ride Guide creates a local `ride:` itinerary. Its saved request was previously sent to the destination route planner on relaunch, whose generated itinerary IDs cannot match that local ride. Retry repeated the mismatch.

Explicit Ride Guide starts now retain an optional, separately versioned `rideSnapshot` in the existing UID-scoped active document. It contains only the selected Pathly-built itinerary: walking/rail geometry, selected times, boarding/exit and intermediate stops, line presentation and live-route identifiers. The source is Route View's GTFS route data and Pathly walking graph, not a serialized destination-planning response.

- Parsing validates the actual one-line producer shape, finite coordinates, chronology, request/coordinate endpoints and exact departure selection. Alternative departures, fare payloads, cached live status/connection state and alerts are removed.
- Snapshot recovery avoids the route planner. Saved ordinal/step/phase/stop-index and anchor evidence identify the confirmed checkpoint in unchanged snapshot geometry, including nearby/co-located stops. Fresh destination-planner recovery still uses its existing semantic rebase and exact-service checks.
- Candidate snapshots are validated before start/replacement storage writes. A rejected replacement cannot clear or archive the existing trip.
- Cursor advances, reset and legacy selection migration retain the active snapshot. End, replacement, arrival and expiry remove the old active snapshot. Recent history receives only lightweight summaries.
- Existing UID isolation, 24-hour active expiry and temporary-coordinate expiry remain in force. No backend, account role, notification/background-location or GPS threshold changes.

## Verification

| Check | Result |
| --- | --- |
| Coordinator regressions before fix | Two initial line-restore/replacement cases failed active→recovery; arrival positive control passed |
| Additional review regressions before fix | Nearby/co-located stops failed restore; invalid replacement cleared stored old trip; conflicting co-located cursor was accepted |
| Snapshot storage before/after | 10 new failing checks before implementation; final storage suite 22/22 passed |
| Final coordinator suite | 21/21 passed: selected later departure/nonterminal exit, account isolation, repeated reload/progress/reset, co-located stops, corrupt cursor, failed replacement, End/arrival cleanup, unchanged planned recovery |
| Full final mobile suite | **65 suites, 644/644 tests passed**, 86.58s |
| TypeScript / ESLint / diff checks | Passed |
| OpenSpec validation | Standard validation passed. Strict mode reports the same eight long-requirement warnings as unchanged HEAD; baseline comparison confirmed no additional warnings. |
| Independent product review | Validation, restore, and cleanup reviewed; identified close-stop and replacement issues were fixed with regressions |
| Live browser reload | Passed: selected later PW train Broadway 1:00 AM → Woodside 1:14 AM restored with identical walking instruction and both selected-time map markers; no recovery view |
| Home Back/Resume | Passed, same ride/instruction |
| Close tab → new app tab | Passed, identical departure/exit/instruction restored from storage; no recovery view |
| Cancel/End and reload | Cancel preserved navigation; confirmed End returned Home; another reload had no active navigation, recovery or Resume control |

The live test used an existing ordinary-user Chrome session, real public-station data, no mock time/location and no simulated transit movement. Reload was checked at 390×844; reopening a new tab also checked the normal desktop-width viewport. Confirmed mid-ride progress, loop stops, corruption, expiry and account isolation were exercised through automated tests, not a physical train ride. Native process-kill/device behavior remains unverified by these browser checks.

## Compatibility and cleanup

Old line-trip records written before this fix do not contain the missing itinerary. They remain safely recoverable/endable rather than being guessed; end and start such a ride once to create a snapshot. Destination-planned records and their prior migrations remain supported without a snapshot.

The QA trip was ended. Home was verified again after reload with no active/recovery/Resume state. Browser viewport reset; no account settings, favorites, roles, or credentials changed. Unit transcripts and verbose command logs remain outside Git under `/tmp/pathly-line-*.log` and `/tmp/pathly-ride-storage-*.log`; no configuration values are included here.

Screenshots: [before reload](evidence/line-resume-before-reload.jpg), [after reload](evidence/line-resume-after-reload.jpg), [after closing/reopening](evidence/line-resume-after-reopen.jpg).

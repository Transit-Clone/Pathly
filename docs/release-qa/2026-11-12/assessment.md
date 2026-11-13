# Pathly release QA — November 12, 2026

UI follow-up: the user selected a [fixed bottom End trip bar](fixed-end-footer.md), which now supersedes the toolbar placement described in this audit's initial fix batch. Follow-up screenshots, layout measurements and passing tests are recorded there.

## Decision

**Prepare an internal native test release; this is not public-store release signoff.** The reviewed route screens have a coherent identity and do not need a redesign. The instruction-obscuring END control is corrected, long waits are readable, and notification lifecycle/stop-data regressions have fixes. Two important navigation gaps remain: line-based trips cannot restore after relaunch, and the current foreground location/notification code does not establish locked-screen navigation advancement.

This audit combines live browser QA, source review, regression tests, independent visual/functional/native reviews, and a local native build attempt. Supporting screens received smoke/source assessment, not complete end-to-end coverage of every account, remote-write failure, or platform. Unrun native combinations remain open.

## Baseline and cleanup

- Base `82d5f0f` on `main`, fetched/fast-forwarded first. Contains all published `feat/sammi` work plus 24 commits. Changes are on `codex/mobile-release-polish`.
- Expo SDK 58 / React Native, Metro at localhost:8081, existing ordinary-user Chrome session. No signup, role changes, auth bypass, sign-out, account deletion, reset email, feedback submission, or push campaign.
- Public-station journey: Stony Brook → Huntington → Penn Station, selected 11:38 PM / 12:19 AM departures. Separately: Nearby LIRR PW → Broadway → Woodside for the line-only flow. Mock location/time were off; no actual route traversal.
- Browser 390×844 and 320×568; app Default/Large text, light/dark, both handed navigation arrangements. These are browser CSS dimensions/app font settings, not native rendering or OS font-scaling tests.
- Restored original Light theme, Default text, right-handed mode; ended both audit-owned trips; confirmed Home has no Resume card; reset viewport. Existing favorites/account data were not edited. Public-station QA search/recents remain rather than clearing unrelated history.
- Ignored mobile environment preserved; no credential/configuration values in report. Generated native files/caches remain ignored. No cloud signing/store changes, Git push, deployment, or store submission.
- Host 8 GB RAM: first-time Gradle/emulator/Jest initially competed for memory; later heavy checks were serialized. This is not a phone-performance finding.

## Implemented and verified changes

| Issue | Result and evidence | Commit |
| --- | --- | --- |
| NAV-01 · P1: END covers boarding instructions on scroll | [Before](evidence/navigation-scrolled-390-before.jpg). END now has a measured fixed toolbar slot, retains confirmation, stays reachable. Checked 320px Large/both hands and 390px light/dark. [After](evidence/navigation-light-390-after.jpg). | `ee6211e` |
| NAV-02 · P2: long countdowns show raw total minutes | Shared hours/minutes formatter for future/past countdowns and spoken labels; regression covers both directions. | `ee6211e` |
| NAV-03 · P1: old notification posts after end/overwrites new step | Deferred-permission/native-post regressions failed before fix. Version guards and ordered post/dismiss queue prevent races. End/replacement/unmount stops old speech; arrival speech retained. | `1f2aa05` |
| NAV-04 · P1: incomplete stop data announces exit is next too early | Pipeline reproduction with empty/partial arrays and larger reported totals. Exact counts now require complete sequences; actual one-stop journey remains supported. | `1f2aa05` |
| NAV-06 · P2: accessible directions contain interactive descendants | Read-only guidance remains grouped; sharing/report controls and location notices remain separate. Source/component assertion verified; native traversal still open. | `ee6211e` |
| Android channel/permission ordering | Channels prepared before trip, departure-nudge and favorite-line permission requests. Mocked ordering passes; clean-install OS prompt still needs observation. | `1f2aa05` |

Trade-off: inconsistent stop metadata produces an unknown count instead of a confidently false get-off warning. No invented stops, relaxed GPS thresholds, ETA proximity inference, or new background alert service. Preserve exact service identity, reliable cancellation and honest stale-location status.

## Top three next steps

1. **Repair line-based persistence.** Save enough validated Ride Guide data to reconstruct the chosen service, departure, boarding and exit. Test relaunch, Home Resume, account isolation and expiry. Do not remove identity checks or substitute another service by line name.
2. **Resolve locked-screen navigation behavior.** If alerts while locked/using another app remain a launch promise, implement native background lifecycle, consent, reconciliation and cleanup, then observe it on phones. Persistent notification display does not prove progression. Keep platform caveats in documentation, not the trip UI.
3. **Run an internal release-like native test track.** Exercise Android shrinking/cold launch, Google sign-in/reauthentication, Maps, permission denial/recovery, GPS progression, sound/haptics, accessibility and safe areas. Emulator coverage helps without owning Android; actual alert/battery testing needs a teammate/tester with a phone.

## Prioritized remaining work

P1: resolve or explicitly decide launch scope before public release. P2: targeted reliability/usability. Estimates are planning ranges.

| Priority / ID | Evidence / confidence | Next action and acceptance | Effort |
| --- | --- | --- | --- |
| P1 · NAV-05 | **Live failure:** PW Route View → choose Woodside → GO → reload enters recovery; Retry returns to failure. Destination-planned trip restores in the same session. [Screenshot](evidence/ride-guide-reload-recovery-390.jpg). Synthetic `ride:` ID cannot match backend-planned ID. | Explicit safe reconstruction plus persist/relaunch regression for both entry paths; no loose matching. | 1–2 days |
| P1 · N1 | **Source-backed gap:** foreground watcher/current-guidance notification, no configured background task. Device delivery unverified. | Decide promise; implement background lifecycle if retained; run [device script](native-platform-notes.md#exact-remaining-physical-device-script). | Several days + devices |
| P1 · N2/N3 | **Validation gaps:** documented prior Android R8 startup crash; debug/export cannot close it. Native OAuth IDs/services config absent locally, EAS may differ. | Test actual configured internal/release-like artifact, signing restrictions, native auth/Maps, clean-install prompts; distinguish local trip notifications from FCM push. | 0.5–1 day after artifact/config |
| P1 · SF-1 | **Source-confirmed:** admin guard checks allowlisted email without verified ownership. Traced protected capability is diagnostics; no exploit performed. | Require verified identity or server-issued claim; cover allowlisted unverified token and ordinary user. | Small patch + auth tests |
| P2 · NAV-07 | **Source dimensions, effective native hit bounds unmeasured:** result filters 36pt, swap 38pt, departure chips 34pt, stop toggle 32pt; map controls 46pt. | Measure and enlarge frequent targets to platform recommendations without crowding sheets; check one-hand/screen-reader use. | ~0.5 day |
| P2 · VIS-04 | **Conditional source case, not live reproduced:** missing textColor can yield white/yellow selected chip (~1.52:1). | Representative fixture; contrast-aware fallback; selected/unselected/light/dark checks. | Small |
| P2 · SF-3/SF-4 | **Source-backed failure recovery:** favorite editor closes before write resolves/errors swallowed; interrupted Android PDF may leave partial file treated as saved. | Pending/retry editor; temporary download/validated completion; rejected-write and interruption tests, native offline reopen. | 0.5–1 day |
| P2 · SF-2 | **Source-confirmed:** account export omits saved lines/alert inbox; local preferences/navigation need a scope decision. | Complete supported account-owned export; document local scope; safe fixture-account verification. | ~0.5 day |
| P2 · N4/N5 | **Configuration/docs:** absent expo-system-ui warning; README previously referenced deleted .env.example (corrected). | Observe system theme/bars; supported integration if needed. Setup docs corrected in this audit using key names only; native prerequisites explicit. Appearance integration remains pending observation. | Small–medium |
| P2/P3 · PERF-01 | **Source-backed, not profiled:** ride sharing and navigation map independently poll same current route every 15s. | Share/dedupe results with account/session ownership; measure requests before/after; preserve refresh/cleanup. | ~0.5 day |

Other small improvements: “Favorite places” versus “Favorite lines”; improve tiny timing/freshness text if native glanceability confirms it; keep complete hours/minutes together at 320px. Offline Maps is official PDF diagrams, not offline route planning/live arrivals. Retain accurate scope. Defer decorative animation/new feature breadth.

## Live coverage matrix

| Flow/state | Observed result | Boundary |
| --- | --- | --- |
| Destination search, edit origin, rail alternatives | Passed, coherent badges/timing/hierarchy | Not every filter/timezone/fare/accessibility combination |
| Transfer itinerary/details/GO | Passed, recognizable boarding/exit/transfer timeline | Fare sheets/every departure alternative not exercised |
| Destination navigation → Home → Resume → reload | Passed; selected Stony Brook service restored | No real GPS boarding/transfer/arrival traversal |
| END → Cancel; END → confirm | Cancel retained trip; confirm removed Resume and returned Home | Native Back/gestures not exercised |
| Waiting/walking guidance | Waiting rail trip and line-only walking entry observed | Riding/transfer/arrival/poor-GPS ride not performed |
| 320px Large/both hands | Readable wrapping; reachable END | OS scaling/landscape/keyboard/safe areas unverified |
| 390px light/dark navigation | Legible card hierarchy and notice | Patchy dark map tiles in one theme-transition frame; persistence not established, no map defect filed |
| Nearby → Route View → Ride Guide → choose Woodside → GO | Initial flow passed; chosen exit changes destination | Exit picker appropriate because line alone has no chosen destination |
| Line-only reload → Retry | **Failed twice**, exact recovery unavailable | Identity mismatch traced; broader fix deferred |
| Favorites, Notifications, Offline Maps, Location & Privacy | Read-only smoke passed at 390px | No write/download/share/export/deletion or push-delivery test |
| Appearance/accessibility settings | Settings applied and restored via UI | AX bridge reported switches value0 even visually on; screenshots/toasts used for setting verification |
| Ordinary-user/admin separation | No admin tools in existing ordinary-user Profile | No account switching/privilege experiment |
| First-install auth/recovery/help/external links | Source handlers traced | No fresh native auth/reviewer-access/store-link pass |

## Verification

| Check | Result |
| --- | --- |
| Full final mobile Jest | **65 suites, 625/625 tests passed**, 83.1s |
| Compiled backend tests in fresh unique TMPDIR | **215/215 passed**, 17.4s |
| TypeScript / ESLint | Passed |
| Expo web/iOS/Android JS exports, one worker | Passed: web 3.1 MB / iOS 5.2 MB / Android 5.3 MB bundles; these are JS artifact sizes, not install sizes or native runtime proof |
| Independent patch review | No actionable regression found in queue/session cleanup, completeness gate or toolbar |
| git diff --check | Passed before commits |
| Android debug native compilation | Passed in 6m01s, ARM64 only, 393 tasks. Debug assembly does not exercise release shrinking or store signing. |
| Android emulator package installation | Passed on booted Android 36 AVD. Package retained; emulator and Studio then stopped. |
| Native app UI / iOS build / physical devices | Not tested. CUA controls Studio but cannot access the standalone emulator app window; no alternate input workaround used. See [native record](native-platform-notes.md). |

Initial mobile baseline 604/609 had five App/Home timeouts during host contention. Isolated App passed 99/99; final whole-mobile 625/625. Initial final backend 214/215 failure came from an existing temp snapshot directory containing only derived files. Hydration reused it without checking raw data. Same code passes with fresh cache. No shared cache deletion/backend edits; retain this preexisting cache-hardening/test-isolation follow-up in [backend notes](backend-snapshot-notes.md).

Before/after regression transcripts accompany this report. Verbose config/build logs remain outside Git. Machine-readable baseline marks unverified categories; no whole-app health score is justified by incomplete native coverage.

## Console and performance

Browser logs: repeated web BackHandler errors, accessible-attribute warning, Expo web push-listener warning, unsupported native-driver fallback, ProfileView/SettingsPages require cycle, legacy Google Marker warning. Tested flows continued rendering/responding; repetitions are not separate product bugs. Classify web-only warnings separately from native defects; the require cycle is a maintenance target. No native crash-log pass.

No trustworthy native startup/FPS/memory/battery benchmark. Read-only browser bridge did not expose Performance entries; development build/host contention would not establish release performance. On a versioned native artifact, record cold/warm startup, map/list scrolling, request counts, memory after ending/resuming trips, and a representative ride's battery use. Compare repeated same-device runs. Existing map polling already pauses inactive and dedupes lines within its hook; preserve that when fixing cross-consumer duplication.

The README now links a [configuration reference](../../mobile-configuration.md) in place of the deleted `.env.example`, distinguishes native auth from web login, and documents the selected EAS environments without private values. Documentation-only verification: references and key names cross-checked against current source.

## Release handoff

[Native notes](native-platform-notes.md) include the exact remaining device script and official Apple/Google links for SDK targets, privacy/Data Safety, account deletion/external request, reviewer access, conditional closed testing and iOS third-party-login requirements. Console fields, intended iOS login offering, signing/cloud environments and final store artifacts remain owner checks, not completed submissions or assumed failures.

Use Play internal testing/TestFlight with approved accounts. Assign real-device locked-screen GPS/audio/haptics/battery coverage to a teammate. Test shrinking-enabled Android because a debug pass cannot close the previous startup problem. iPad support is enabled and needs layout coverage or an explicit supported-device decision.

Details: [functional](route-functional-notes.md), [visual](route-visual-notes.md), [supporting features](supporting-feature-notes.md), [backend cache](backend-snapshot-notes.md). Screenshots: [evidence](evidence/). This is an assessment plus a verified small-fix batch; remaining work is explicitly open.

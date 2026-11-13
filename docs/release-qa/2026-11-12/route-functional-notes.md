# Route/navigation functional audit notes

Base: `82d5f0f`, branch `codex/mobile-release-polish`, November 12, 2026.

This is a source and focused-regression audit. It does not claim physical-device, notification-delivery, or real-GPS verification. The main agent owns live UI evidence and the consolidated assessment.

## Findings and reproduction evidence

### RF-1 — P1: a pending notification can outlive the trip or overwrite newer guidance

At the base revision, `showTripNotification` awaits notification permission and Android channel work, then schedules the shared `pathly-trip-progress` identifier without a cancellation/version guard. `clearTripNotification` independently dismisses that identifier. The hook starts delivery without awaiting it. If the rider ends a trip or turns its notification off during permission work, dismissal can run first and the delayed call can then post an obsolete sticky notification. Two permission answers can also settle out of order and replace the newest step with an older one.

Base source: `mobile/src/lib/notifications.ts:50-80`; `mobile/src/hooks/useTripGuidanceAlerts.ts:73-90`.

The original tests covered immediately resolved scheduling, ordinary step replacement, and ordinary end cleanup. New deferred-promise regressions reproduced the permission/cancellation, stale-guidance, and in-flight native-post races. These now pass with version checks around asynchronous permission/channel work and an ordered native post/dismiss queue. Valid native delivery has no new foreground restriction.

### RF-2 — P2: ending/unmounting navigation does not stop active speech

At the base revision, speech stops before another spoken instruction or when the voice preference becomes false. Ending a trip only resets the last-guidance ref and clears its notification; no session or unmount cleanup stops speech already in progress. A rider who explicitly ends navigation can therefore continue hearing the old instruction. Unmounting Home during an account change has the same cleanup gap.

Base source: `mobile/src/hooks/useTripGuidanceAlerts.ts:61-65,84-112`.

Session replacement, trip end, and unmount now stop prior speech and clear its progress notification. Regression coverage retains the intended arrival announcement, stops it on a later owner unmount, and keeps the initial/reopened step quiet. Replacing a trip with identical initial copy still posts the new owner's progress notification.

### RF-3 — P1: line-based GO trips cannot safely resume after relaunch

This is a concrete identity mismatch in the current code path, not a claim that the backend was exercised by this subagent:

1. `rideGuideItinerary` gives a locally constructed line-based trip an ID beginning `ride:` (`mobile/src/data/rideGuide.ts:162`).
2. `HomeScreen.startRide` stores an ordinary backend planning request for it (`mobile/src/components/HomeScreen.tsx:690-702`).
3. `useActiveTrip.recover` always re-requests a plan through that backend (`mobile/src/hooks/useActiveTrip.ts:323-324`).
4. `sameTripSelection` rejects a different itinerary ID before comparing any other identity (`mobile/src/data/enrouteNavigation.ts:369-370`).
5. Backend-normalized planned itineraries use a 12-character SHA-derived ID, not `ride:` IDs (`firebase/functions/src/tripPlanning.ts:343`).

Consequently a new backend plan cannot match this saved synthetic ride. Recovery is safe in that it does not switch the user to another service, but Retry cannot reconstruct the original line-based trip. Existing Ride Guide tests cover construction/start, not this relaunch round trip. The main agent is checking the live flow. A repair needs an explicit safe reconstruction strategy; relaxing identity checks alone would be unsafe.

### RF-4 — P1: empty/partial stop enrichment can produce a false immediate get-off warning

The backend explicitly returns `{ stops: [], live }` when it has live-route metadata but cannot match the intermediate stop pattern (`firebase/functions/src/tripStops.ts:299`). The navigation normalizer treats any present `step.stops` array as a known sequence (`mobile/src/data/enrouteNavigation.ts:545`), including an empty or partial one. `guidanceForNavigation` counts only known checkpoints when this flag is present (`:821-825`), so an eight-stop service with `stops: []` has `remainingStops === 1` immediately after boarding. `announcementFor` then interprets it as the actual next exit (`mobile/src/data/tripAnnouncements.ts:13-15,42-43`).

This was reproduced through the actual normalizer → simulated boarding/progress → guidance → announcement pipeline. Empty enrichment with reported eight stops, partial enrichment with reported eight stops, and an unknown reported count all produced **“Your stop, S terminal, is next. Get ready to get off.”** before the fix. [Failing evidence](stop-count-regressions-before.txt).

The normalizer now exposes a remaining-stop count only when a supplied array's filtered intermediate count plus its exit exactly matches the reported total. A real one-stop trip with `stopCount: 1` and `stops: []` remains complete. All known checkpoints and geometry remain available for ordinary progress; GPS advancement thresholds are unchanged. [Passing evidence](stop-count-regressions-after.txt): four relevant navigation/guidance/active-trip/RideGuide suites pass all **65 tests**, including five new count-integrity cases.

Trade-off: even a plausibly complete GTFS list is treated as count-unknown when its total disagrees with the provider. This can suppress a next-stop warning/count until data agrees; it avoids sounding a confidently false get-off warning or inventing missing stops. It does not introduce an approach alarm, infer stops from ETA, or claim real-device alert verification.

### RF-5 — P1 native verification item: Android notification permission precedes channel creation

At the base revision, both trip-progress and saved-line notification registration ask permission before creating their Android channels (`mobile/src/lib/notifications.ts:53-54,128-132`). Expo's current documentation states that Android 13+ does not show the notification permission prompt until a channel exists. This makes a clean-install Android check necessary, rather than relying on a previously configured emulator/device.

Android channel preparation now precedes the trip, saved-line, and departure-nudge permission paths. Regressions verify trip/saved-line ordering and that denied permission does not request a push token. Reference: [Expo notifications documentation](https://docs.expo.dev/versions/latest/sdk/notifications/). These code checks do not establish actual OS prompt/delivery behavior.

## Implemented changes and focused verification

The notification/speech fix owns `mobile/src/lib/notifications.ts`, `mobile/src/hooks/useTripGuidanceAlerts.ts`, and `mobile/__tests__/tripGuidanceAlerts.test.ts`. A second count-integrity fix owns `mobile/src/data/enrouteNavigation.ts` and `mobile/__tests__/enrouteNavigation.test.ts`. No commit was made by this subagent; root owns integration and commit grouping.

- Before the product fix, six new regressions failed and the seven original tests passed. [Before evidence](notification-regressions-before.txt).
- After the fix, four relevant suites pass all **62 tests**, including **17 guidance/notification tests** (seven original plus ten regressions). [After evidence](notification-consumers-after.txt).
- Covered races: delayed permission after end, older permission response after a newer step, native scheduling still in flight at end, master preference disabled while pending, replacement with identical copy, end/unmount speech cleanup, and arrival speech cleanup.
- Related consumer suites: settings, saved-line alerts/place editing, and departure nudges/live trips.
- TypeScript and focused ESLint checks pass. Root should repeat final integration checks after all agents' changes are combined.
- RF-3 remains a separate P1 safe-reconstruction issue; no identity-relaxation or route-resume redesign was attempted here. RF-4 is now fixed as described above, with positive controls for complete multi-stop and genuine one-stop legs.

## UI candidates sent to the main agent for live confirmation

- Long navigation arrival/departure countdowns use raw total minutes (`EnrouteNavigationView.relativeTimeCopy`, base lines 81-89), while trip durations elsewhere use hour/minute formatting. Candidate bounded consistency/readability fix; live long-trip evidence is required.
- Recovery uses a fixed top margin and a non-scrollable card (`EnrouteNavigationView`, base lines 402-425 and 447-452). Short-screen/large-text clipping needs visual verification; source alone is insufficient.
- Nested fare actions are not automatically a web bubbling defect: the installed React Native Web `PressResponder` explicitly stops click propagation before calling an inner `onPress`. Native touch behavior still belongs in the platform matrix.

## Coverage boundaries

- No credentials, email addresses, secret values, production account changes, or backend writes were used by this subagent.
- No native OS notification banner/sound, locked-screen navigation progression, physical GPS, or route-camera behavior has been verified by this source audit.
- Root owns baseline test results, live screenshots, final implementation decisions, and final integration checks.

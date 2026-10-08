# Tasks

## 1. Backend

- [x] 1.1 Add `getRoutesLiveStatus`: shared `routeLiveStatus` body, one security check, agencies prepared one at a time, routes in parallel, per-route errors, at most 12 routes. Add its rate limit. Verify with security tests (signed-out rejection, size bounds, per-route error) and a local run with 4 real routes: 0.67 s cold vs about 1.8 s one after another.

## 2. App

- [x] 2.1 Add `fetchRoutesLiveData` with a not-found fallback signal. The provider sends one batch per agency (chunks of 12), falls back to per-route requests, and keeps the nearest-stop compatibility path. Verify with App tests: batches never mix agencies, a stuck subway batch doesn't block the LIRR card, and the per-route fallback still fills cards.
- [x] 2.2 Add the device cache: nearby list (24 h, rider's own location only) and live times (10 min, no vehicles, never over fresher data). App tests clear storage before each test. Verify with an App test that, with a stuck backend, the saved card shows with the updating indicator and its time aged by a minute.

## 3. Integration

- [ ] 3.1 Deploy functions (`npx firebase-tools deploy --only functions`). On web, reopen the app and confirm that cards appear at once and that the network tab shows one live-status request per agency per refresh.

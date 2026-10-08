# Proposal

## Why

Departure times load slowly. After the security update, live status runs on one backend instance that answers one request at a time. Every card's request from every rider waits in that single queue, and every card on screen sent its own request. Opening the app also showed nothing until the nearby search and every card's request had finished, even when the backend was cold.

## What Changes

- **Batched live status:**
  - A new `getRoutesLiveStatus` callable answers up to 12 routes in one request: one security check, each agency's static snapshot prepared once, routes answered in parallel, errors reported per route.
  - The app sends one batch per agency for the cards on screen. A screen now waits in the queue about 2–3 times instead of once per card, and a slow agency feed can't hold up another agency's cards.
  - If the deployed backend predates batching, the app falls back to one request per route.
- **Instant reopening:** the app saves on the device
  - the last nearby list at the rider's own location (used for up to 24 hours), shown at once on launch and marked as updating;
  - recent live times (used for up to 10 minutes, without vehicle positions), shown for cards still loading. Countdowns age from when they were fetched, and passed departures drop.
- **Measured locally:** a cold batch of 4 routes takes 0.67 s, against about 1.8 s for the same routes one after another. Warm, it takes 13 ms.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-ui-design`: **Modified** "Fast first load of live data" (batched per agency instead of per route).
- `mobile-prototype-navigation`: **Added** "Last data shows at once when reopening".

## Impact

- **Backend:** `firebase/functions/src/index.ts` (`getRoutesLiveStatus`, shared `routeLiveStatus`, rate limit), with tests in `test/callableSecurity.test.js`. **Requires redeploying functions.**
- **App:**
  - `src/data/transitLive.ts` (`fetchRoutesLiveData`, fallback signal).
  - `src/data/TransitLiveContext.tsx` (per-agency batches, device cache).
  - New `src/data/deviceCache.ts`.
  - `src/components/HomeScreen.tsx` (nearby cache).
  - `jest.setup.js` (the batch mock answers through the per-route mock).
- **Archive order:** this change modifies a requirement added by `refine-route-detail-and-nearby`, so archive that one first.

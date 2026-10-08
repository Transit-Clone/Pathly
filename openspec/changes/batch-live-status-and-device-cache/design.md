# Design

## Context

`getRouteLiveStatus` runs with `concurrency: 1` and `maxInstances: 1`: one instance answering one request at a time. That pools feed requests under Swiftly's quota and means a request never mixes two static snapshots. The app sent one request per visible card, so a screen of 5 cards meant 5 trips through that queue, behind any cold start.

## Decisions

1. **Batch callable.** `getRoutesLiveStatus({ routes, lat?, lon? })` takes at most 12 routes.
   - It validates and rate-limits once.
   - It prepares each distinct agency's static snapshot one at a time first, because preparing can switch the active snapshot and must not overlap reads.
   - It then answers routes in parallel through the same `routeLiveStatus` body as `getRouteLiveStatus`.
   - A route that fails becomes `{ ok: false, code }`, and unexpected errors are logged.
2. **One batch per agency, not one for everything.** A single batch is only as fast as its slowest route. Grouping by agency means one feed's outage (for example Swiftly) can't freeze other agencies' cards. The cost is usually 2–3 requests instead of 1.
3. **Fallback.**
   - A `functions/not-found` error from the batch call means the backend predates it. The provider remembers that and uses per-route requests from then on.
   - A batch result without `nearestStop` (an older response shape) sends that route down the existing per-route path.
4. **Device cache** (`AsyncStorage`, best effort, failures ignored):
   - **Nearby list:** saved after each successful search at the rider's own location (not while exploring). On mount, a list up to 24 h old is shown as `loaded` with `refreshing`, and only while the fresh search is still loading.
   - **Live statuses:** the 40 most recently fetched are saved 2 s after changes settle. On mount, entries up to 10 minutes old seed routes that are still loading. Vehicles are dropped because old positions would mislead, and `applyRouteLive` ages countdowns from `fetchedAt`.

## Risks / Trade-offs

- **A slow route delays its agency's batch.** → Grouping per agency bounds this, and the backend's feed fetches have their own timeouts.
- **Cached times could look live.** → They're capped at 10 minutes, aged from fetch time, shown without vehicles, and replaced by the first fresh response.
- **Test isolation:** the AsyncStorage mock persists within a test file. → App tests clear it before each test.

## Not in this change

Two follow-ups touch Ellie's snapshot design, so they need her input:
- prepared indexes inside her daily snapshots, so cold starts stay fast once snapshots are published;
- revisiting `concurrency: 1` for live status.

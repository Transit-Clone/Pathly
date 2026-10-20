# Pathly backend

How the Cloud Functions in `firebase/functions/` get their transit data, and how to deploy and operate them. For setting up and running the app locally, see the [README](../README.md).

## Transit timetable indexes

The Functions read each agency's static GTFS feed from `firebase/functions/static_data/<agency>/`. Scanning the full `stop_times.txt` files on every cold start made the first nearby search take about 18 seconds. A build step therefore prepares small per-route stop-times and route-geometry files, plus a stop-to-routes index, under `static_data/<agency>/derived/`. These files are generated and not committed.

```sh
npm --prefix firebase/functions run build:gtfs
```

- Deploys run this step automatically (`firebase.json` predeploy). The deploy stops if any agency's index is missing or out of date. The raw `stop_times.txt` files are not uploaded.
- Re-run it after replacing any agency's static feed. It skips unchanged agencies.
- Without the index, as on a fresh checkout, the Functions still work locally by scanning the CSVs, just more slowly. `npm run functions:test` builds the index and checks that it matches the CSVs.
- The daily static GTFS refresh (below) builds the same files for each snapshot it publishes. Deployed instances keep using prepared indexes after a newer feed replaces the bundled one.

## Walking-graph tiles

Nearby picks the stop that is closest on foot using a pedestrian street graph under `firebase/functions/static_data/walking/`. The graph is built from OpenStreetMap data and is gitignored, so a fresh checkout has none. Without it, Nearby falls back to straight-line distance. **Deploys fail until the tiles exist** (`build-walking-tiles.js --check` runs on predeploy).

1. Download `https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf` (~500 MB) to a folder outside the repo.
2. Build the tiles. This needs about 6 GB of memory:

   ```sh
   npm --prefix firebase/functions run build:walking -- <path-to>/new-york-latest.osm.pbf
   ```

Streets change slowly, so rebuilding every month or two is enough.

## Trip planning (Google Routes API)

Route Results gets real transit itineraries from the `planTrip` Cloud Function. The function calls the Google Routes API (`computeRoutes` in transit mode, with alternatives). It uses the same `GOOGLE_MAPS_API_KEY` secret as the other backend proxies, so the key never ships in the app.

- **Enable the API:** in the Google Cloud console for `pathly-b7f0f`, open **APIs & Services → Library**, find **Routes API**, and select **Enable**. If the server key has API restrictions (**APIs & Services → Credentials** → the key → **API restrictions**), add **Routes API** to the allowed list.
- **Cost:** transit requests bill as **Routes: Compute Routes Essentials**. The first 10,000 requests per month are free, then $5 per 1,000. Each plan is one request. The app caches plans for 2 minutes and limits each rider to 20 plans per minute.
- **Cap it:** to keep a bug from running past the free tier, lower the Routes API's per-day request quota. In **Google Maps Platform → Quotas**, select **Routes API**, choose **Edit** on the per-day quota, and enter a value such as 300 (about 9,000 a month).
- **Fares:** Google returns fares for NYC subway and bus trips only. For trips that involve the LIRR, NICE, or Suffolk County Transit, `firebase/functions/src/tripFares.ts` estimates the fare from the agencies' published 2026 fares (the LIRR zone chart, flat bus fares, and transfer rules). The app labels these as estimates ("~$18.25"). Update those tables when fares change.
- If planning fails, the function logs `trip_planning_unavailable` with Google's status, for example `PERMISSION_DENIED` when the API isn't enabled or the key isn't allowed to call it.

## Live data sources

- **Real-time vehicles and departures:** each agency's GTFS-RT feed. Agencies without one, such as the Staten Island Ferry, show timetable departures only.
- **Service alerts:** MTA's public GTFS-RT alerts feed (subway, city buses, LIRR). Route detail lists these alerts under the departure times. If the alerts feed fails, the route shows no alerts instead of failing.

## Secrets

In production, the Functions read backend credentials from Firebase Secret Manager:

```sh
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
firebase functions:secrets:set SWIFTLY_API_KEY        # NICE Bus and Suffolk County Transit real-time feeds
firebase functions:secrets:set MTA_BUS_TIME_API_KEY   # MTA Bus Time real-time feed for NYC city buses
```

When a live-feed key isn't set, its routes show timetable departures only.

For the local Functions emulator only, copy `firebase/functions/.secret.local.example` to `firebase/functions/.secret.local` and fill in the values.

Keep provider quotas and billing alerts enabled. The deployed per-user rate limiter uses an atomic Firestore transaction, so cold starts and horizontal scaling can't multiply a user's limit. A bounded in-process bucket rejects obvious bursts before that shared check.

Don't create or share Firebase Admin service-account JSON keys for routine development. Cloud Functions uses dedicated managed runtime identities. Developers should use `firebase login` for the CLI, and user Application Default Credentials where ADC is actually required.

## Static GTFS refresh

Every day at 04:00 `America/New_York`, the deployed backend refreshes the official static GTFS feeds for every agency: LIRR, subway, NICE Bus, Suffolk County Transit, MTA city buses (five boroughs and MTA Bus Company), NYC Ferry, and the Staten Island Ferry. A successful run works like this:

1. It validates the full feed.
2. It uploads an immutable ZIP to `gtfs/v1/<agency>/versions/<archive-sha256>.zip`.
3. It switches `gtfs/v1/<agency>/current.json` using a Cloud Storage generation precondition.

Feeds that are invalid, expired, rolled back, or incompatible leave the last published snapshot untouched. If a repacked ZIP's runtime CSVs are unchanged, only the trusted source watermark advances, so instances don't rehydrate.

Each snapshot also gets a prepared-index archive at `gtfs/v1/<agency>/derived/<version>-v<format>.zip`, holding the timetable indexes above built from that snapshot. A snapshot that lacks a current prepared-index archive gets one on the next run, without a new version. If the archive can't be built or verified, the snapshot is still published and instances scan its raw files (`gtfs_snapshot_derived_failed` / `gtfs_snapshot_derived_unavailable`).

The city bus and ferry agencies are too large to copy into every instance, so their prepared timetable is split. A small core archive holds the indexes and `route-files.json`, and each route gets its own object under `gtfs/v1/<agency>/derived/<version>/<format>/`. Instances fetch and verify a route's object the first time they need it. These agencies have no bundled copy, so each one is skipped until its first snapshot is published.

The Staten Island Ferry's feed leaves `direction_id` blank, so the refresh fills in each trip's direction from its first and last stops before publishing.

**Retention.** Once the version a publication replaced has been current for a day, the publication deletes the version from two publications back: its ZIP, prepared archive, and route files. The two live versions are never touched. Deletion is by name from the manifests, so the writer needs no list permission. Logs show `gtfs_snapshot_retired`, or `gtfs_snapshot_retire_failed` with the reason.

**Hydration.** Callables check the manifest at most once every five minutes. They hydrate a verified version into ephemeral `/tmp` and keep the last good version for that warm instance. If Storage is unavailable, a cold instance falls back to the GTFS files bundled with the deployment.

### Production setup for `pathly-b7f0f`

1. Keep the project on the Blaze plan. Initialize Firestore and the default Firebase Storage bucket, and keep Storage Public Access Prevention enabled. Client rules deny access to GTFS objects and to the `_pathlyCallableRateLimits` collection; only Admin SDK identities use them.
2. Create `pathly-callable-runtime@pathly-b7f0f.iam.gserviceaccount.com` and `pathly-gtfs-writer@pathly-b7f0f.iam.gserviceaccount.com`. Don't create JSON keys for either.
3. Grant these roles:
   - On the Storage bucket, grant the callable identity **Storage Object Viewer** and the writer identity **Storage Object User**. Add IAM Conditions that restrict both grants to object names under `gtfs/v1/`.
   - At the project level, grant the callable identity **Cloud Datastore User** (for the shared limiter) and Secret Manager access to the declared secrets.
   - Give the deployer `iam.serviceAccounts.actAs` on both identities.

   Don't give the default compute identity broad write access to the bucket. Remove any temporary grant only after this deployment is verified.
4. Enable Firestore TTL for collection group `_pathlyCallableRateLimits`, field `expiresAt`. Rate-limit documents contain only hashes and expire 24 hours after their last successful use.
5. Enable the Cloud Scheduler API. The Functions deployment manages the `firebase-schedule-refreshGtfsStaticData-us-central1` job; don't edit or delete it by hand.
6. Build the walking-graph tiles (see above).
7. Run `npx --yes firebase-tools@15.32.1 login`, then `npm run deploy:backend`. The repository scripts pin a Firebase CLI version that supports the Node 24 Functions runtime.

### Verifying the refresh after a deploy

1. Force-run the managed Scheduler job once (Cloud Scheduler console → the job → **Force run**).
2. Confirm that each agency has a `current.json` and that the ZIP it references exists.
3. Check the logs:

   ```sh
   npx --yes firebase-tools@15.32.1 functions:log --only refreshGtfsStaticData
   ```

   Each agency should log one `gtfs_snapshot_published` (or `gtfs_snapshot_unchanged`) event, with no `gtfs_refresh_failed`. If the deploy changed the prepared-index format, each agency should also log `gtfs_snapshot_derived_backfilled`.
4. Run the job a second time and confirm that every agency logs unchanged.
5. Wait up to five minutes, use the signed-in nearby-transit flow, and confirm a `gtfs_snapshot_hydrated` event (with `prepared: true`) for each agency.

Set up alerts on `gtfs_refresh_failed`, `gtfs_snapshot_fallback`, `gtfs_snapshot_derived_failed`, and `gtfs_service_expiring`. Also alert if no complete refresh (`gtfs_refresh_completed`) succeeds within 26 hours.

The refresh keeps immutable ZIP history instead of deleting archives during publication. That keeps content rollback and A-to-B-to-A reuse safe. Don't apply a blanket lifecycle rule that could remove an archive a live manifest references. If you ever need to clean up by hand, pause the scheduler first, and keep every current and previous archive that a manifest references.

## App Check rollout

**Web.** Create a score-based reCAPTCHA Enterprise key restricted to the production domains. Register it against the Firebase web app under App Check, and set its public site key as `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. Register the generated localhost debug token privately in the Firebase console.

**Native.** iOS and Android need a custom native provider before App Check can be enforced:

1. Register both native Firebase apps.
2. Configure App Attest/DeviceCheck and Play Integrity.
3. Use private debug tokens in development builds.

Native currently calls Functions through the Firebase JavaScript SDK. The native token must therefore be bridged through a JS SDK `CustomProvider`, or native Functions calls must migrate to RNFirebase. Registering providers in the Firebase console isn't enough on its own.

**Enforcement.** Every callable Function already requires Firebase Authentication and has App Check enforcement ready to turn on:

- `geocodeAddress` enforces App Check now, because it is billable and has no current client caller.
- The active transit callables keep `enforceTransitAppCheck=false` in `firebase/functions/src/index.ts` while rollout metrics are monitored. Once released web and native builds show valid App Check traffic, change that value to `true` and redeploy.

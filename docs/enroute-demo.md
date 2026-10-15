# Enroute navigation demo

This runbook exercises Pathly's foreground navigation MVP on one native target and on web. It uses the admin checkpoint controls, but those controls feed the same persisted mock-location source and progress engine as a real location fix. No source-code or device-storage editing is required.

Run the full checklist separately on each target. Active trips and Recents are stored per signed-in user **on that device/browser**, so a native run does not appear on web and vice versa.

## Before the demo

1. Install dependencies and configure `mobile/.env` as described in the repository `README.md`. The Firebase client, Google Places search, deployed trip-planning backend, and Google Routes API must be available.
2. Use an existing Firebase Authentication account whose email is in `EXPO_PUBLIC_ADMIN_EMAILS`. When that variable is absent, the development default is `admin@gmail.com`. You need the account's real password; the email setting only reveals admin UI and does not create an account.
3. Start one target:

   | Target | Start command | Relaunch during the test |
   | --- | --- | --- |
   | Web | `npm run dev:web` | Reload the page |
   | iOS Simulator | Start a simulator, then `npm run dev:ios` | Terminate and reopen Pathly, or reload the app |
   | Android emulator/device | Start/connect it, then `npm run dev:android` | Force-stop and reopen Pathly, or reload the app |

4. Sign in with the admin account. Open **Profile → Admin tools** and confirm the Admin tools page is present. If it is absent, stop here and fix the admin account configuration.
5. Establish a repeatable planning context in Admin tools:
   - Under **MOCK LOCATION**, choose **Stony Brook University**.
   - Under **MOCK TIME**, choose **Weekday 7:30 AM (peak)**.
   - Return to Home. The mock location and time persist on this target until explicitly turned off.
6. If Home already shows an **ACTIVE TRIP** card, open it, tap **END**, and confirm **End trip**. Starting clean this way preserves an accurate ended-early Recent. Do not clear app storage.

The suggested route for a transfer-rich demonstration is **Current location / Stony Brook University → Wall St/Pier 11**. Provider results can change, so if that search has no usable option, choose another reachable destination and select an itinerary that visibly contains transit, known stops, and preferably a transfer. The checkpoint panel is generated from whichever exact itinerary is selected.

## Happy-path demo

### 1. Plan and start one exact itinerary

1. From Home, search for **Wall St/Pier 11** (or the fallback destination chosen above).
2. Keep the origin as **Current location** so it resolves to the admin mock location. Keep the trip at **Leave now**; the admin mock clock makes this deterministic.
3. On Route Results, open one itinerary with a transit leg and, when available, a transfer. Note its departure time, arrival time, line sequence, and destination. This is the exact selection the restore check will compare.
4. Tap **GO**.
5. Confirm that a separate active-navigation screen appears and shows all of the following:
   - a map and rider marker;
   - the current instruction;
   - the next action or stop;
   - remaining stops when the provider supplied them;
   - an arrival estimate;
   - a persistent **END** action; and
   - the **ADMIN DEMO — Trip checkpoints** panel.

If another trip was already active, Pathly asks whether to replace it. Choose **Cancel** to prove the old trip remains active, then end that trip deliberately before restarting this section. Replacement must never happen silently.

### 2. Exercise real progress through admin checkpoints

The controls move the shared mock location; they do not directly set navigation progress.

1. Tap **Next** once. Confirm that the marker moves and the current/next guidance updates when the next checkpoint is credible.
2. Continue with **Next** through walking, boarding, known intermediate stops, alighting, and transfers available in this itinerary. Watch the line/headsign and remaining-stop count change at the relevant checkpoints.
3. Tap a named checkpoint chip directly and confirm the same production progress behavior occurs.
4. After advancing at least two checkpoints, tap **Previous**. The marker should move backward, but confirmed guidance must **not** regress.
5. Tap **Next** again to return to or pass the last confirmed point.
6. Tap **Reset**. Confirm both the marker and guidance return to the first checkpoint. Reset is the only demo action intended to rewind confirmed progress.
7. Advance several checkpoints again, stopping before the destination.

### 3. Verify map follow and foreground refresh

1. Drag or zoom the active map. Follow mode should turn off and the camera should stay where it was panned.
2. Tap the round location/follow control. It should become selected and recenter on the rider marker.
3. Put the app in the background, wait several seconds, and return:
   - native: use the Home gesture/button or app switcher, then reopen Pathly;
   - web: switch tabs or minimize the browser, then return.
4. Confirm the app requests/accepts the current location again and keeps the last confirmed guidance. This MVP does not advance while suspended.

### 4. Verify Back, Resume, and exact relaunch restore

1. Tap the navigation **Back** control. Navigation must remain active.
2. On Home, confirm the prominent **ACTIVE TRIP** card names the destination and offers **Resume**. Nearby, Recents, Favorites, search, Profile, and Admin tools should remain usable.
3. Tap **Resume** and confirm the same itinerary and confirmed progress return.
4. With the app online, fully relaunch this target using the method in the table above.
5. Sign in again only if prompted. After **Restoring your trips…**, confirm Pathly returns to the same active trip (or exposes the Home Resume card), with the same selected line sequence, departure/arrival reference, and last confirmed progress. It must not substitute a merely similar itinerary.
6. Resume navigation and continue.

### 5. Verify END cancellation

1. Tap **END**.
2. In **End this trip?**, tap **Cancel**.
3. Confirm navigation and its progress are unchanged.

### 6. Arrive and open the Recent

1. Use **Next** or a direct checkpoint selection to move through every remaining checkpoint and finally the destination.
2. Confirm **You’ve arrived** appears once and the active session closes.
3. Choose **View Recents**. There should be exactly one new **Arrived** card for this session; repeated location evidence must not create duplicates.
4. Open that Recent. Confirm Pathly opens a fresh Route Results search for the saved origin and destination. It may show different current departures; it must not replay stored provider geometry or silently restart navigation.
5. Return Home and quickly confirm the existing **Nearby**, **Recents**, and **Favorites** tabs and Profile remain available.

## Relaunch recovery: Retry and End

Recovery is the safe result when Pathly cannot reproduce the exact selected itinerary. It retains the lightweight active-trip reference and never swaps in a different route.

### Reach recovery without editing state

1. Start another itinerary with **GO** and advance at least one checkpoint.
2. Close/reload Pathly.
3. Make the route provider unreachable before relaunching:
   - web: in browser developer tools, set Network throttling to **Offline**, then reload;
   - native: after the JavaScript bundle has loaded, disable the target's Internet connection and reopen Pathly. If Expo Go also loses its LAN connection to Metro, use an installed development build or block Internet while retaining local-network access.
4. After local sign-in state loads, confirm **TRIP RECOVERY — We can’t restore the exact route yet** appears, either immediately or after using the Home **ACTIVE TRIP** Resume card.

### Retry the exact route

1. While still offline, tap **Retry exact route**. Confirm the app stays in recovery and does not show a substitute.
2. Restore the Internet connection.
3. Tap **Retry exact route** again.
4. If the provider still offers the exact fingerprinted itinerary, active navigation resumes at the last confirmed progress. If it no longer offers that exact itinerary, remaining in recovery is the correct behavior; use **End this trip** rather than accepting a different route.

### End from recovery

To demonstrate both successful Retry and End, create recovery again after the retry succeeds: close the app while the trip is still active, take the provider offline, and relaunch.

1. Tap **End this trip** on the recovery screen.
2. Cancel once and confirm the recovery reference remains.
3. Tap **End this trip** again and confirm **End trip**.
4. Confirm Home opens to Recents with one new **Ended early** card for that session.

## Reset between demonstrations

- **Restart the same active demo:** on active navigation, tap **Reset**. This rewinds the session and mock location to checkpoint one.
- **Start a different itinerary:** tap **END** and confirm first, then plan the new trip. The ended trip remains in Recents as **Ended early**.
- **Reset location/time assumptions:** use **Profile → Admin tools → Turn off mock location** and **Turn off mock time**, or choose the standard presets again.
- **Refresh a plan request:** Admin tools' **Clear trip-plan cache** forgets only short-lived plan results. It does not delete an active trip or Recents.
- **Refresh nearby/live cards:** **Clear device cache** only clears the allowlisted Nearby/live caches. It must not remove active navigation or Recents.
- **Get a clean Recents list:** use a fresh test account or a fresh simulator/browser profile. There is intentionally no destructive “clear trip history” control.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Admin tools or checkpoint controls are missing | The signed-in email must match `EXPO_PUBLIC_ADMIN_EMAILS` (case-insensitive). Restart Expo after changing environment variables. Checkpoint controls appear only during an active trip. |
| Typed destination search is unavailable | Configure `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (or the documented Maps fallback key), enable Places API (New), then restart Expo. |
| Route Results fails or is empty | Confirm the user is signed in, the deployed `planTrip` Function is reachable, Routes API is enabled for the backend key, and the selected mock date has service. Try the peak-weekday preset again. |
| Restore opens recovery while online | The provider did not return the exact saved itinerary, or the request failed. Retry online. Do not start a similar result as though it were the same trip; either keep the reference for later or end it. |
| Guidance does not advance | Confirm the mock marker reached a later checkpoint. Poor/stale/unmatched real fixes intentionally keep the last confirmed progress. Use **Reset** before replaying the checkpoint sequence from the beginning. |
| **Previous** moves the marker but not the instruction | This is expected. Progress is monotonic unless the admin explicitly taps **Reset**. |
| Native app cannot reopen while offline | Expo Go may need Metro over the local network. Use an installed development build, emulator network controls that preserve LAN access, or test the forced-offline recovery on web. |
| Recent opens different times or lines | This is expected. Recents store only a lightweight summary and endpoints; opening one requests current route options. |
| A native and web run do not share state | This is expected for the MVP. Active trips and Recents are local per user and per device/browser profile. |

## MVP boundaries to state during the demo

- Navigation is **foreground-only**. Pathly refreshes location on foreground return, but it does not provide background tracking or notifications and does not claim progress made while suspended.
- There is **no dynamic rerouting or automatic off-route recovery**. Unavailable, stale, inaccurate, or unmatched location evidence leaves the last confirmed instruction visible with a status message.
- Guidance is derived only from provider-known paths, stops, endpoints, and times. Pathly does not invent intermediate stops, street turns, or maneuvers.
- Relaunch restore is exact-or-recovery: Pathly will not silently replace the selected itinerary with a similar departure.
- Recents and the active-trip reference are local to the signed-in user on the current target. Cross-device history is follow-up work.
- Admin checkpoints are demo-only controls. They are hidden from non-admin accounts, but exercise the same location and progress pipeline used by the working product.

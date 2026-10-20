# Pathly

Pathly is a mobile transportation app for riders in New York City and Long Island, inspired by Transit, Citymapper, and Google Maps. Riders can search for transit routes, view nearby stops, compare routes, and navigate to their destinations using real-time and scheduled transit data.

The app is a React Native / Expo client (`mobile/`) backed by Firebase Cloud Functions (`firebase/functions/`). It covers the LIRR, the subway, MTA city buses (all five boroughs and MTA Bus Company), NICE Bus, Suffolk County Transit, NYC Ferry, and the Staten Island Ferry.

Project documents are in `docs/`:

- `Design(M3).ipynb`: the current (M3) design document
- `Design.ipynb`: the original M2 design
- `Proposal.ipynb`: the project proposal
- `Testing-Plan.md`: the testing plan

## Requirements

- Node.js 24.9.0 (see `.nvmrc`)
- npm 11.6.0
- One viewing option:
  - a web browser,
  - Xcode 27 with an iOS 27 simulator,
  - Android Studio with an Android Virtual Device, or
  - a physical iOS or Android phone with Expo Go

## Installation

```sh
git clone https://github.com/Transit-Clone/Pathly.git
cd Pathly
nvm use
npm ci
```

If you don't use `nvm`, install the Node version listed in `.nvmrc` some other way. Use `npm ci` for a reproducible install from the committed lockfile. Use `npm install` only when you are intentionally changing dependencies.

## Local configuration

The app needs Firebase and Google Maps client settings before it can load live data:

1. Copy `mobile/.env.example` to `mobile/.env`.
2. Fill in the Firebase web app config (`EXPO_PUBLIC_FIREBASE_*`) and the platform-restricted Maps keys (`GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_WEB_MAP_ID`).
3. Optionally set `EXPO_PUBLIC_ADMIN_EMAILS` (comma-separated). These accounts see the admin tools in the app. The default is `admin@gmail.com`. The backend has its own list, `ADMIN_EMAILS`, in `firebase/functions/.env.<project-id>`.
4. Restart the Expo dev server after editing `.env`.

`EXPO_PUBLIC_` values are bundled into the app, so treat them as public and rely on each key's API and app restrictions. Never put backend credentials (the server Maps key, Swiftly, MTA Bus Time) in `mobile/.env`. Git ignores both `.env` and `.secret.local`.

### Destination search (Google Places)

Destination search uses Google Places Autocomplete (Places API (New)). Without a key, search still opens and shows recent places, but typed queries show "Place search is unavailable."

1. In the Google Cloud project that holds the Maps keys, enable **Places API (New)** under **APIs & Services → Library**.
2. Create an API key, or reuse the web Maps key. Under **API restrictions**, restrict it to Places API (New). For web, also add an **HTTP referrers** restriction for your dev and production origins.
3. Add the key to `mobile/.env`:

   ```sh
   EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-key
   ```

   If this variable isn't set, the app falls back to `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`.

## Running the app

Run every command from the repository root. Stop the dev server with `Ctrl+C`.

### Web

```sh
npm run dev:web
```

Open the local URL shown in the terminal.

### iOS Simulator

1. In Xcode 27, open **Xcode → Open Developer Tool → Device Hub**.
2. Start an iPhone simulator with the installed iOS runtime.
3. Run:

   ```sh
   npm run dev:ios
   ```

Expo opens Pathly in the running simulator.

### Android emulator

Install Android Studio, create and start an Android Virtual Device, then run:

```sh
npm run dev:android
```

### Physical iPhone or Android phone

1. Install Expo Go on the phone.
2. On iPhone, create a free Expo account and sign in to it in both Expo Go and the Expo CLI (`npx expo login`).
3. Connect the phone and the computer to the same Wi-Fi network.
4. Run `npm run dev`.
5. When the QR code appears, scan it with the iPhone Camera app, or with **Scan QR code** in Expo Go on Android.

If the phone can't load the project, check that both devices are on the same network and that the computer's firewall allows incoming Node connections. You can also switch to Expo's tunnel option from the interactive terminal.

## Commands

| Command                    | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `npm start` / `npm run dev` | Start the Expo development server (QR code for Expo Go)      |
| `npm run dev:web`          | Start the web app                                             |
| `npm run dev:ios`          | Start Expo and open the iOS Simulator                         |
| `npm run dev:android`      | Start Expo and open the Android emulator                      |
| `npm run lint`             | Lint the mobile workspace                                     |
| `npm run typecheck`        | Type-check the mobile workspace                               |
| `npm test`                 | Run the mobile tests, then the Functions tests                |
| `npm run build`            | Export the Android, iOS, and web bundles to `mobile/dist`     |
| `npm run functions:build`  | Compile the Cloud Functions                                   |
| `npm run functions:test`   | Build the timetable indexes and run the Functions tests       |
| `npm run functions:shell`  | Open the Firebase Functions shell                             |
| `npm run deploy:functions` | Deploy Cloud Functions only                                   |
| `npm run deploy:backend`   | Deploy Storage rules and Cloud Functions                      |

These commands run in `firebase/functions` (`npm --prefix firebase/functions run <script>` from the root):

| Command                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `build:gtfs`            | Build the per-route timetable indexes (add `-- --force` to rebuild all) |
| `build:walking`         | Build the walking-graph tiles from an OpenStreetMap extract             |
| `serve`                 | Build the indexes and start the local Functions emulator                |
| `logs`                  | Show deployed Functions logs                                            |

## Backend

The Cloud Functions in `firebase/functions/` serve live departures, trip plans, and nearby stops. Two generated data sets aren't committed:

- **Timetable indexes.** Build them with `npm --prefix firebase/functions run build:gtfs`. Tests and deploys build them automatically. Without them, the Functions still work locally, just more slowly.
- **Walking-graph tiles.** Build them from an OpenStreetMap extract with `build:walking`. Nearby uses them to find the closest stop on foot, and deploys fail without them.

Backend credentials live in Firebase Secret Manager, never in `mobile/.env`. For the local emulator, copy `firebase/functions/.secret.local.example` to `firebase/functions/.secret.local`.

For deploying or operating the backend, see [docs/backend.md](docs/backend.md). It covers secrets, the walking-tile build, the Routes API, the daily GTFS refresh, production setup, and App Check.

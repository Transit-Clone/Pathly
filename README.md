# Pathly

Pathly is a mobile transportation app built for riders in the New York City and Long Island area and inspired by existing apps like Transit, Citymapper, and Google Maps. Like other transit apps, Pathly will allow users to search for transit routes, view nearby stops, compare routes, and navigate to their destinations using real-time and scheduled transportation data.

Currently, this repository contains a very minimal prototype. The **design document** for M2 is located in `docs/Design.ipynb`.

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

If you do not use `nvm`, install the Node version listed in `.nvmrc` by your preferred method. Use `npm install` when intentionally changing dependencies; use `npm ci` for a reproducible install from the committed lockfile.

## Run in a browser

```sh
npm run dev:web
```

This starts Expo's web development server. Open the local URL shown in the terminal.

## Run in the iOS Simulator

Xcode 27 manages simulators through **Device Hub**:

1. Open **Xcode → Open Developer Tool → Device Hub**.
2. Start an iPhone simulator with the installed iOS runtime.
3. From the repository root, run `npm run dev:ios`.

Expo will open Pathly in the running simulator.

## Run on Android

### Physical Android phone

Install Expo Go from Google Play, put the phone and development computer on the same Wi-Fi network, then follow the physical-device instructions below.

### Android emulator

Install Android Studio, create and start an Android Virtual Device, then run:

```sh
npm run dev:android
```

The live-transit branch requires Firebase client configuration. See **Security and local configuration** below.

## Run on a physical iPhone or Android phone

1. Install Expo Go on the phone.
2. On iPhone, create a free Expo account and sign into the same account in Expo Go and the Expo CLI (`npx expo login`).
3. Connect the phone and development computer to the same Wi-Fi network.
4. Run `npm run dev` from the repository root.
5. When the QR code appears, scan it with the iPhone Camera app or with **Scan QR code** in Expo Go on Android.

Keep Expo running while using the app. If the device cannot load the project, confirm both devices are on the same network, allow incoming Node connections through the computer's firewall, or use Expo's tunnel option from the interactive terminal.

## Destination search (Google Places)

Destination search uses Google Places Autocomplete (Places API (New)). Without a key, search still opens and shows recent places, but typed queries show "Place search is unavailable."

1. In the Google Cloud project that holds the Maps keys, enable **Places API (New)** under **APIs & Services → Library**.
2. Create an API key (or reuse the web Maps key) and restrict it under **API restrictions** to Places API (New). For web, also add an **HTTP referrers** restriction for your dev and production origins.
3. Add the key to `mobile/.env`:

   ```sh
   EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-key
   ```

   If this variable is not set, the app falls back to `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`. Restart the Expo dev server after editing `.env`.

`EXPO_PUBLIC_` values are bundled into the app, so treat this key as public and rely on its restrictions.

## Commands

| Command               | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `npm start`           | Alias for `npm run dev`                   |
| `npm run dev`         | Start the Expo development server         |
| `npm run dev:web`     | Start the web app                         |
| `npm run dev:ios`     | Open the iOS Simulator app                |
| `npm run dev:android` | Open the Android app                      |
| `npm run lint`        | Lint the mobile workspace                 |
| `npm test`            | Run mobile tests                          |
| `npm run typecheck`   | Type-check the mobile workspace           |
| `npm run build`       | Create Android, iOS, and web Expo exports |

Stop development processes with `Ctrl+C`.

## Security and local configuration

Copy `mobile/.env.example` to `mobile/.env` and fill in the Firebase and platform-restricted
Maps client settings. Both `.env` and `.secret.local` are ignored by Git. Do not put the
backend Google Maps or Swiftly credentials in the mobile bundle.

Production Functions read backend credentials from Firebase Secret Manager:

```sh
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
firebase functions:secrets:set SWIFTLY_API_KEY
```

For the local Functions emulator only, copy `firebase/functions/.secret.local.example` to
`firebase/functions/.secret.local`. Keep provider quotas and billing alerts enabled; the
in-process per-user limiter is paired with a low Functions `maxInstances` ceiling and is not
a replacement for a shared production rate limiter when the service scales out.

Do not create or share Firebase Admin service-account JSON keys for routine development.
Cloud Functions uses its managed runtime identity; developers should use `firebase login` for
the CLI and user Application Default Credentials where ADC is actually required.

### App Check rollout

For web, create a score-based reCAPTCHA Enterprise key restricted to the production domains,
register it against the Firebase web app under App Check, and set its public site key as
`EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. Register the generated localhost
debug token privately in Firebase Console. Native iOS/Android currently need a custom
native provider before enforcement: register both native Firebase apps, configure
App Attest/DeviceCheck and Play Integrity, and use private debug tokens in development builds.
Because native currently calls Functions through the Firebase JavaScript SDK, the native token
must then be bridged through a JS SDK `CustomProvider`, or native Functions calls must migrate to
RNFirebase. Merely registering providers in Firebase Console is not enough.

All callable Functions already require Firebase Authentication and contain deploy-ready App
Check enforcement. `geocodeAddress` enforces it immediately because it is billable and has no
current client caller. The active transit callables keep `enforceTransitAppCheck=false` in
`firebase/functions/src/index.ts` while rollout metrics are monitored. After released web and
native builds show valid App Check traffic, flip that version-controlled value to `true` and
redeploy.

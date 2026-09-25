# Pathly

Pathly is a map-first transit planning concept for New York City and Long Island. This repository currently contains a **heartbeat prototype**: a proposal-inspired React Native screen, a minimal Express health endpoint, and enough automated checks to prove that a fresh clone can install, run, test, and build.

This is intentionally not the Pathly product yet. Transit feeds, routing, maps, accounts, and persistence come later.

## What runs

- `mobile` — Expo + React Native + TypeScript, targeting iOS, Android, and web
- `server` — Express + TypeScript with a `GET /health` endpoint
- `.github/workflows/ci.yml` — installs, lints, tests, type-checks, and builds on pushes and pull requests

The mobile heartbeat presents the visual direction from the proposal: a map-style surface, a prominent destination search control, and nearby transit. It checks the API connection in the background without exposing developer status in the interface.

The two interactive flows are also hardcoded for the heartbeat. Tap **Where to?** to open the mock recent-place search and type `123 Terry Rd` to see three numbered matches. Tap **Ronkonkoma Branch** to open its proposal-style route map, departure selector, and stop timeline.

## Requirements

- Node.js 24.9.0 (see `.nvmrc`)
- npm 11.6.0
- One viewing option:
  - a web browser,
  - Xcode 27 with an iOS 27 simulator,
  - Android Studio with an Android Virtual Device, or
  - a physical iOS or Android phone with Expo Go

No MongoDB instance, mapping key, transit API key, paid Apple Developer membership, CocoaPods installation, or global Expo CLI installation is required for the heartbeat.

## Clone and install

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

This starts both the API and Expo web development server. Open the local URL shown in the terminal. The health endpoint is also available directly at [http://localhost:3000/health](http://localhost:3000/health).

## Run in the iOS Simulator

Xcode 27 manages simulators through **Device Hub**:

1. Open **Xcode → Open Developer Tool → Device Hub**.
2. Start an iPhone simulator with the installed iOS runtime.
3. From the repository root, run:

```sh
npm run dev:ios
```

Expo will open Pathly in the running simulator. `http://localhost:3000` reaches the API on the Mac from the iOS Simulator, so the default configuration works.

## Run on Android

### Physical Android phone

Install Expo Go from Google Play, put the phone and development computer on the same Wi-Fi network, then follow the physical-device instructions below.

### Android emulator

Install Android Studio, create and start an Android Virtual Device, then run:

```sh
npm run dev:android
```

The app automatically uses `http://10.0.2.2:3000` on Android so the emulator can reach the development computer's `localhost`. No environment file is required.

## Run on a physical iPhone or Android phone

The phone cannot use `localhost` to reach the API running on the development computer. It needs the computer's private LAN address.

1. Install Expo Go on the phone.
2. On iPhone, create a free Expo account and sign into the same account in Expo Go and the Expo CLI (`npx expo login`).
3. Connect the phone and development computer to the same Wi-Fi network.
4. Find the computer's private IPv4 address. On Windows, run `ipconfig`; on macOS, run:

```sh
ipconfig getifaddr en0
```

5. Set `EXPO_PUBLIC_API_URL` to that address and start Pathly. In Windows PowerShell:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.42:3000"
npm run dev
```

On macOS or Linux:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npm run dev
```

6. When the QR code appears, scan it with the iPhone Camera app or with **Scan QR code** in Expo Go on Android.

The API listens on `0.0.0.0` so another device on the local network can reach it. Keep the command running while using the app. If the app cannot connect, confirm the IP address, allow incoming Node connections through the computer's firewall, and verify that the network does not isolate wireless clients. Restart the command after changing `EXPO_PUBLIC_API_URL`.

The committed `.env.example` files document optional settings and safe example values; they are not loaded automatically.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Alias for `npm run dev` |
| `npm run dev` | Start the API and Expo development server for a physical device |
| `npm run dev:web` | Start the API and open the web app |
| `npm run dev:ios` | Start the API and open the iOS Simulator app |
| `npm run dev:android` | Start the API and open the Android app |
| `npm run lint` | Lint all workspaces |
| `npm test` | Run all workspace tests |
| `npm run typecheck` | Type-check all workspaces |
| `npm run build` | Compile the API and create production Expo exports |

Stop development processes with `Ctrl+C`.

## Continuous integration

GitHub Actions runs on every pull request to `main` and every push to `main`:

```text
npm ci → npm run lint → npm test → npm run typecheck → npm run build
```

The build step validates the API compilation and the Expo application bundles. It does not produce a signed App Store or Play Store binary. The workflow has read-only repository permissions, caches npm downloads, and cancels superseded runs for the same branch.

## Prototype boundaries

The heartbeat does **not** include:

- real maps, geocoding, or turn-by-turn navigation
- live or scheduled transit feeds
- route planning, fares, alerts, or vehicle locations
- MongoDB or any other persistence
- authentication, saved places, or trip history
- native store builds, deployment, or production infrastructure

The map and transit content are visual placeholders used to exercise the cross-platform UI and client-to-server connection. Reference proposals and notebooks describe the broader product direction; they are not runtime dependencies or implementation instructions.

## Repository notes

The preliminary proposal and design artifacts remain in the repository for product context. The independently runnable mobile client and API server live in the top-level `mobile/` and `server/` directories, while root-level scripts coordinate both workspaces so contributors and CI use the same commands.

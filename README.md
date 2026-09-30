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

No backend environment file or local API process is required.

## Run on a physical iPhone or Android phone

1. Install Expo Go on the phone.
2. On iPhone, create a free Expo account and sign into the same account in Expo Go and the Expo CLI (`npx expo login`).
3. Connect the phone and development computer to the same Wi-Fi network.
4. Run `npm run dev` from the repository root.
5. When the QR code appears, scan it with the iPhone Camera app or with **Scan QR code** in Expo Go on Android.

Keep Expo running while using the app. If the device cannot load the project, confirm both devices are on the same network, allow incoming Node connections through the computer's firewall, or use Expo's tunnel option from the interactive terminal.

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

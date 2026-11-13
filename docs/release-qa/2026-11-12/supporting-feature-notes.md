# Supporting-feature source assessment

November 12, 2026; current `codex/mobile-release-polish` worktree. This is a read-only source assessment, not full live coverage. No builds, tests, account deletion, export/share actions, backend writes, or product edits were performed for this follow-up. Root separately observed Favorites, Notifications, Offline Maps, and Location & Privacy loading coherently at a 390px width; that observation does not establish native behavior.

## Prioritized follow-ups

### SF-1 — P1: verify admin email ownership on the server

`firebase/functions/src/admin.ts:16-18` grants the configured admin allowlist based on `auth.token.email` alone; it does not check `email_verified`, although its comment says verified sign-in email. `callableSecurity.ts:129-130` only requires a UID. The actual protected consumer, `index.ts:898-901`, calls both guards before returning backend status. The mobile email-confirmation screen is a client flow (`auth/authService.ts:18-24`), so it does not add a server authorization check.

Source-confirmed guard gap; no exploit, signup attempt, or production permission test was performed. The currently traced protected capability is backend diagnostics, not a destructive admin operation. Before release, require a verified identity (or server-issued admin claim) and cover an allowlisted but unverified token. Client-side screen visibility is separate from this server check; the public admin list is not a secret or an authorization boundary.

### SF-2 — P2: downloaded account data omits whole supported features

`mobile/src/data/accountData.ts:25,59-72` exports the profile and only searches, previous destinations, and saved places. `savedRoutes` and `alertInbox` are real account-owned collections that deletion explicitly handles (`:134`), but export omits them. Per-account travel/notification preferences and active/recent navigation are local persisted features (`data/userPreferences.tsx:9-11,50-51`; `data/navigationStorage.ts:34-64`) and are also omitted.

Source-confirmed incomplete export; no real user export was requested. Include saved lines/alert settings and inbox, and make an explicit documented decision for local preferences/navigation. The current unit test (`__tests__/settings.test.tsx:312`) covers only the three original lists, so that test passing cannot establish completeness.

### SF-3 — P2: failed favorite writes disappear without recovery feedback

`HomeScreen.tsx:598-599,620,635-642` discards errors from star/unstar, named save, and removal. The edit sheet closes immediately after Save/Remove, before the write resolves. A rejected write therefore provides neither a reason nor a retry and loses the editor context. The underlying operation is implemented: this is error handling, not a dead button. `saveLabeledLocation` correctly writes the replacement before removing the old address (`userData.ts:245-247`); do not describe it as delete-first data loss.

Source-confirmed failure-path gap; no failing remote write was induced. Keep the editor open while saving, show inline/toast failure, and close on success. Verify with a rejected-write regression and native keyboard/small-screen interaction.

### SF-4 — P2: interrupted Android map downloads may look saved

`data/officialMaps.ts:57-60` downloads directly to the final `.pdf` file; `isMapSaved` checks only file existence (`:47-52`). The installed Expo File API explicitly documents that Android can leave a partially written destination when a download fails (`node_modules/expo-file-system/src/File.ts:116-118`). The UI catches the save failure (`OfficialMapsSettings.tsx:28-36`), but does not remove that partial file. Reopening settings re-derives saved state from existence, and `openMap` then shares that file (`officialMaps.ts:72-75`).

Source-supported Android failure case; not reproduced on a device. Download into a temporary destination, validate/swap on success, and remove a failed temporary copy. Add a failed-download/partial-file test, then verify airplane-mode reopen on Android and iOS. Also verify native opening ergonomics: the current saved-map path opens a **share sheet**, while its comment promises a PDF preview. No dedicated official-map regression was found in the current mobile tests.

## Traced existing behavior and product clarity

- **Authentication/account:** email/password signup and sign-in, guest entry, password-reset recovery, verification, and native Google token exchange are implemented. Account deletion is present behind a confirmation dialog and reauthentication, with separate password and Google paths (`SettingsPages.tsx:627-709`; `accountData.ts:112-141`). Its tests cover success, wrong password/account, and cancellation (`__tests__/settings.test.tsx:330-433`; `googleReauth.test.ts`). These mocked paths do not verify rebuilt native OAuth redirects, Google reauthentication, or deletion against production. Do not destructively test an existing demo account.
- **Destinations versus lines:** saved destination selection constructs fresh route results (`HomeScreen.tsx:601-605`), consistent with starting from the rider's current place. Transit line favorites are independent `savedRoutes` records, with their own star flag and alert setting (`data/savedRoutes.ts:68-85,157-177`). They are not fixed-origin pinned trips. Settings currently labels destination management “Favorites” while inbox uses “Favorite Lines”; “Favorite places” versus “Favorite lines” would make that distinction clearer (`ProfileView.tsx:103,110`).
- **Offline maps:** the feature saves official static PDF diagrams on native, not offline route planning or offline live arrivals (`officialMaps.ts:9-29,31-32`). The UI states that saved maps do not update automatically (`OfficialMapsSettings.tsx:73`). Retain that scope distinction in release copy and test the actual saved-file flow rather than treating a working web link as proof.
- **Settings/help:** rows have traced handlers: account, appearance, notifications, travel/accessibility preferences, places, maps, privacy, FAQ/about; contact uses an email/issue fallback, feedback opens its configured form, donation opens its configured page (`ProfileView.tsx:223-227`; `SettingsPages.tsx:779-835`). Contact and ordinary links report opening failures; feedback and donation silently swallow them. This is a small consistency/retry improvement, not evidence that their destinations are placeholders. Avoid repeated “prototype” wording in release-facing Terms only after the team makes an accurate product/legal-copy decision (`SettingsPages.tsx:807`).
- **Admin separation:** Profile receives its admin entry callback only for an admin (`HomeScreen.tsx:1094`), DebugProvider ignores stored overrides for non-admin users and clears them on sign-out (`debug/DebugContext.tsx:63-102`), and backend status has a server guard. Test a separate ordinary account before release to confirm mock controls/diagnostic overlays do not leak into its UI. The server identity gap above is distinct from this useful UI separation.

## Remaining live/native coverage

The follow-up did not verify first-install signup, email verification delivery, native Google sign-in/reconfirmation, account export/share content, deletion, saved-place failure recovery, offline PDF download/reopen/removal, settings persistence after relaunch, VoiceOver/TalkBack, or non-admin account switching. These should remain explicitly unverified in the main report, with native OAuth, offline map handling, and destructive account operations assigned safe test accounts/devices.

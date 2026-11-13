# Native platform and release baseline

Audit base: `82d5f0f` on `codex/mobile-release-polish`, November 12, 2026. This is a native-tooling/configuration assessment; source inspection and generated configuration are not represented as observed rider behavior.

## Tooling and build evidence

| Check | Result | Evidence tier |
| --- | --- | --- |
| Android tooling | Android Studio installed; Android SDK/emulator/adb available outside the default shell PATH | Local tooling inventory |
| Android virtual device | `medium_phone`, ARM64 Android 36 Google Play image, 1080 × 2400, 420 dpi, 2 GB configured RAM | AVD configuration |
| Android boot | Successfully booted; adb reported `emulator-5554 device` | Emulator service observation, not app UI |
| Java | Default `/usr/bin/java` resolves an incompatible Intel JDK 14; ARM Homebrew OpenJDK 17.0.20.1 works via a per-command `JAVA_HOME` override | Tool execution |
| Android generation | `expo prebuild --platform android --no-install --skip-dependency-update react,react-native` passed; generated only ignored native files, with no tracked package changes | Config/prebuild execution |
| Android debug APK | Final single-worker ARM64 `:app:assembleDebug` **passed in 6m 1s**, 393 actionable tasks (361 executed, 32 up-to-date). Earlier two-worker attempt was cancelled cleanly to separate host resources. Final APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 73,676,038 bytes, version 0.1.0/code 1; package `com.pathly.app`, compiled SDK37 and target SDK36 | Native compilation/artifact metadata; not release/runtime proof |
| Android emulator installation | Final APK installed successfully on `emulator-5554` after boot completed. An earlier install correctly failed while the device was still booting. No native Pathly screen was launched through an unsupported input path, and no OS permissions/auth/account changes were made | Package installation, not app runtime/UI observation |
| Android native UI control | Initial Android Studio selection timed out during resource contention. After the final build/JVM exited, CUA successfully opened Studio → More Actions → Virtual Device Manager and booted Medium Phone. The standalone emulator still does not appear as a controllable registered macOS app; CUA app inventory lists Studio only. No adb-input/screenshot fallback was used, and no Pathly native screen is marked observed | Tooling limitation; app UI untested |
| iOS tooling | Xcode 27.2 / build 27B52 and iOS 27.0 iPhone/iPad simulator runtimes are installed | Local tooling inventory |
| iOS build prerequisites | No generated iOS project, Xcode DerivedData cache, or `pod` on the default shell PATH | Not yet built/run |
| Cached native apps (initial inventory) | One cached Expo Go 57.0.9 iOS app on simulator `D560CF39-7F20-4FB5-92FC-542479325A77`; Android cache contains only Expo Go 57.0.9 (`host.exp.exponent`). No Pathly APK/AAB/IPA found in direct Downloads/Desktop or inspected Expo/EAS caches | Metadata/package inspection only |
| EAS metadata access | Cached EAS CLI 24.14.0 works, but `eas whoami` reports not logged in; cloud builds/environments/signing state were not inspected | Access unavailable |
| Store-signed builds and physical devices | Not exercised | Not tested |

The host has 8 GB RAM. Running first-time Gradle compilation, Android Studio, an emulator, and full JavaScript tests concurrently produced significant resource pressure. The audit-launched emulator and Android Studio were closed after confirming boot so compilation and the root audit's tests could progress. Native compilation and full test suites should run sequentially on this machine. This is a host limitation, not evidence of app performance on a phone.

Build command (from the generated `mobile/android` directory):

```sh
env JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ANDROID_HOME=/Users/ellie/Library/Android/sdk \
  ./gradlew :app:assembleDebug --max-workers=1 --no-daemon \
  -Dorg.gradle.jvmargs='-Xmx1536m -XX:MaxMetaspaceSize=512m' \
  -Pkotlin.compiler.execution.strategy=in-process \
  -PreactNativeArchitectures=arm64-v8a --console=plain
```

The final build installed previously missing Android Build-Tools37 and CMake3.22.1 using the SDK's existing accepted licenses. It emitted dependency/Gradle deprecation warnings, but no compilation failure. The generated debug APK's SHA-256 is `d099eaa3c664586e8f6c3eaaaf0d2db3c3afed936ed221be459fea0f28005641`. The artifact is ignored and was not uploaded or submitted. Debug compilation does not exercise the release R8/startup path or establish native Google/FCM configuration.

After the install check, the audit-owned emulator was shut down with Device Manager's Stop control and Android Studio was quit through its menu. The APK remains installed on that AVD for a later supported/manual native session. SDK/build caches and ignored generated native files were retained; no tracked app configuration was changed for the build.

Private verbose logs remain outside the repository under `/tmp/pathly-android-*.log`; do not publish raw logs containing configuration values.

The cached Expo Go version is older than this SDK 58 project. Expo Go supports one SDK version at a time; a matching client or app build is needed. Neither cached client was booted or represented as native Pathly UI evidence. [Expo upgrade/Go compatibility documentation](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

## Findings and verification gaps

### N1 — P1: Locked-screen navigation advancement is not established by the current notification implementation

**Evidence:** Current `mobile/app.config.js` configures only when-in-use location. There is no enabled background-location mode/task configuration or `expo-task-manager` dependency. `useCurrentLocation` uses foreground location watching; `useTripGuidanceAlerts` reacts to current guidance and posts a persistent current-step notification.

**Impact:** A visible step notification can remain on the lock screen without demonstrating that location, step progression, or an approaching-exit warning continues to update. This is a code-backed gap against the previously stated product requirement to warn while locked/using another app. It is not a real-device reproduction of a missed warning.

**Next action:** Verify the actual lifecycle on installed native hardware. If locked-screen progression is required for launch, implement and test a deliberate native background-location/notification lifecycle; do not equate persistent notification display, mocked movement, or web behavior with that requirement being met. This is a substantive behavior decision, beyond cosmetic route-screen polish.

### N2 — P1 verification gap: Android release startup must be tested with shrinking enabled

**Evidence:** `android.enableMinifyInReleaseBuilds=true` is generated. App configuration includes WorkManager and Room keep rules with a comment documenting a previous store-build startup crash. Local debug assembly does not exercise R8 shrinking. The generated local release configuration uses debug signing; it is not the Play-distributed build.

**Next action:** Install and cold-launch a release-like build with the same shrinking/native dependencies, and then the Play internal-track artifact. Exercise startup, Maps, location consent, navigation, and background/foreground transitions. Record artifact ID, OS, and logcat crash status. No release build is marked passed by this assessment.

### N3 — P1 local configuration gap: Native Google authentication and Android push cannot be verified from this checkout alone

**Evidence:** The approved local environment contains native Maps keys, but no Android/iOS/web OAuth client-ID variables. `mobile/google-services.json` and local `GOOGLE_SERVICES_JSON` are absent. These checks recorded presence only; no credentials or email values were printed. EAS environments and signing/OAuth restrictions were not inspected or changed.

**Impact:** Native Google sign-in/reauthentication and FCM configuration require a separately configured native test/release build. The native Google button is hidden when its platform client ID is missing. Web Google sign-in working does not verify native OAuth redirects, package/SHA restrictions, or Google-account deletion reauthentication. Missing local files do not establish that EAS production is misconfigured. FCM configuration concerns remote service-alert push; local trip-step notifications do not require an FCM backend and must be tested separately.

**Next action:** Verify the relevant EAS environment, Android signing fingerprints/Maps/OAuth restrictions, iOS client/redirect configuration, and `GOOGLE_SERVICES_JSON` file variable with an authorized maintainer. Use an existing approved test account for native checks; no accounts or roles were created or changed in this audit.

### N4 — P2 source/configuration warning: Android automatic system appearance needs review

**Evidence:** Prebuild warns: `android: userInterfaceStyle: Install expo-system-ui in your project to enable this feature.` The app requests automatic appearance but does not depend on `expo-system-ui`.

**Impact/confidence:** A configuration warning is confirmed; a rendered theme/system-bar mismatch is not yet reproduced. Manual app dark mode and Android system appearance need separate checks before changing dependencies.

**Next action:** Observe Android light/dark appearance and edge-to-edge status/navigation bars on an installed build. If the warning corresponds to a real mismatch, use the supported Expo system-UI integration and verify both app-managed and system-managed themes.

### N5 — P2 release handoff documentation inconsistency — corrected

**Evidence:** At baseline, README local/EAS setup instructed copying or reading `mobile/.env.example`, but that tracked file was deleted. The latest commit correctly removed root Expo/EAS configuration, so release commands should resolve the mobile app configuration rather than an obsolete root project.

**Resolution:** The root audit corrected README references to the deleted example and added `docs/mobile-configuration.md`, listing source-checked key names and native OAuth/push prerequisites without configuration values. It identifies the current mobile Expo/EAS files and the canonical admin-list source. The documentation correction does not verify EAS environment values, signing restrictions, native authentication, or push delivery; those remain N3 validation items.

## Release configuration observations

- Native identity is `com.pathly.app` on both platforms; do not change it for UI cleanup.
- iPad support is enabled, so large-screen layout remains a required coverage item.
- The mobile EAS profiles explicitly select development, preview, and production environments. Android preview produces an APK; production produces an app bundle. Submission is configured as an internal-track draft.
- The latest config derives the app's admin allowlist from the canonical backend admin-list helper when available. Ordinary-user/admin UI separation and backend authorization remain separate behaviors to verify; do not change roles to manufacture test coverage.
- Android's final permissions must be assessed from the merged manifest. For example, `POST_NOTIFICATIONS` comes from the notifications library and is not present in the generated application's base manifest. Absence from the base manifest alone is not a missing-permission finding.

## Exact remaining physical-device script

Use an authorized existing test account and a versioned internal/release-like build. Record OS, device, app/build ID, permissions, and whether the device is physical or emulated.

1. Cold-launch twice. Confirm no crash, native splash transition, correct theme/system bars, and a usable sign-in/Home screen.
2. Sign in with the existing Google/password test account; cancel once before completing, then complete. Verify returning sessions and Google reauthentication without actually deleting an account.
3. Grant foreground location, then repeat with denial and a later Settings grant. Confirm consent does not loop and the rider has a useful recovery action.
4. Plan a trip with a transfer, inspect line/direction/boarding and exit details, and start navigation. Confirm map rendering, camera follow/manual pan, safe areas, and readable guidance with the keyboard closed/open where applicable.
5. Traverse real walking, boarding, riding, transfer, and arrival stages. Compare guidance with actual progress. Run a labelled deterministic Ride Along separately; it cannot replace this observation.
6. Toggle voice, haptics, and notification settings mid-trip. Verify deduplication, mute behavior, interruption/audio output behavior, and cleanup on end/replacement/arrival.
7. Before an exit's warning window, lock the screen and separately switch apps. Observe whether location/progression advances and whether the correct timely warning is delivered, with sound as configured. Record GPS gaps/tunnels. Return and verify progress reconciles without a duplicate or stale warning.
8. End/replace a trip while a warning is pending, and confirm no later stale alert. Background/reopen/relaunch and check active-trip resume and cleanup.
9. On Android, repeat with system Back, gesture navigation, large fonts, dark mode, battery saver, and the Play-installed signed build. On iOS, repeat Dynamic Type, VoiceOver, interruption/background behavior, and a supported iPad layout if enabled.
10. Record battery/thermal behavior during a representative ride. A simulator's resource use is not a battery benchmark. List any unrun combinations as unverified.

No store submissions, production deployments, signing changes, backend role changes, account creation/deletion, feedback messages, or push campaigns were performed.

## Current official store checklist

Checked November 12, 2026. These are release verification items, not a statement that the stores will approve the app. Console fields, EAS cloud configuration, account type, and signed artifacts remain unverified without the appropriate access.

| Release check | Current official requirement / recommended verification | Pathly status |
| --- | --- | --- |
| Apple privacy disclosures | App Store Connect privacy answers must cover the app and integrated third-party SDKs, remain accurate, and reflect actual collection/use. Review the final binary's relevant SDK privacy/signature/manifests alongside the labels. [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) | Public policy source describes Firebase, Maps, location, ride sharing, and retention. Console answers/final archive not inspected. |
| Google privacy policy and Data safety | Publish an accessible policy in-app and in Play Console; accurately disclose developer/SDK collection, sharing, retention, and deletion. The policy URL must be publicly accessible, non-geofenced, and not a PDF. [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en) | In-app policy links and a static HTML policy exist in source. Live public reachability and console declarations still need confirmation; the web-research tool could not retrieve the deployed URL, which is not proof it is broken. |
| Apple account deletion | Account-creating apps must let the user initiate deletion within the app, including associated data not legitimately retained. Verify both password and federated-user recovery/reauthentication. [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) | Delete-account UI/code exists; no real account was deleted. Native Google reauthentication is not configured in the local environment. |
| Google account deletion outside the app | Provide an in-app deletion path and a functional external request resource, linked in Play Console, usable without reinstalling the app. A clearly presented support-email request can qualify. [Google account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) | Policy source includes an external email-request path and explains in-app deletion. Live request handling, response process, and Play Console URL field not verified; no email was sent. |
| Permission explanations and scope | Explain the concrete use of protected resources in iOS purpose strings; exercise denial/recovery and request only what the feature needs. [Apple purpose-string guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings) | When-in-use location purpose is configured. Native permission UI and final merged permissions remain to be checked on installed builds. |
| If background location is added | Background location requires justified core functionality, clear consent/disclosure before the runtime request, accurate policy disclosure, and the relevant Play review/declaration process. [Google background-location guidance](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en) | Current app does not enable a background task. Treat this as a requirement for any future locked-screen-navigation implementation, not permission to silently add tracking. |
| Apple third-party login | If native Google sign-in is used for the primary account and no listed exception applies, offer an equivalent login option meeting Apple's privacy criteria. Guest or ordinary email/password availability is not automatically an exemption. [Apple Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services) | Google-native sign-in exists conditionally; no Sign in with Apple implementation surfaced. Maintainer must resolve the intended iOS auth offering before submission. This is a conditional review risk, not an automatic rejection finding. |
| Reviewer access and complete metadata | Provide working reviewer access/demo instructions and an available backend; remove placeholders and verify store screenshots/URLs. [Apple review guidance](https://developer.apple.com/app-store/review/guidelines/), [Google review sign-in requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en) | A signed-in browser session proves neither native reviewer credentials nor access from a different region. Console review notes/accounts are unverified. Use authorized dedicated review access; do not publish personal credentials in this report. |
| Google target SDK | New app/update submissions must target Android 16 / API 36 from August 31, 2026; the cited extension date was November 1, 2026. This is a submission target, not the oldest supported Android runtime. [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) | Installed React Native version catalog targets 36 and compiles 37. Verify the final AAB's actual manifest, rather than treating source defaults as the submitted artifact. |
| Apple build SDK | Since April 28, 2026, iOS/iPadOS submissions must use the iOS/iPadOS 26 SDK or later. This is a build SDK floor, not a requirement to drop older runtime support. [Apple SDK submission requirements](https://developer.apple.com/news/?id=ueeok6yw) | Local Xcode 27.2 is newer than that floor. Actual EAS/archive Xcode/SDK selection remains unverified. |
| Conditional Google closed testing | Personal developer accounts created after November 13, 2023 must complete a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access. It is not a blanket requirement for every organization/existing account. [Google personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) | Play account creation date/type and production-access state are unknown. The README's numeric rule is current, but its applicability must be checked. |

Do not change live store metadata, authentication offerings, signing, or cloud environment values as part of a UI polish patch. Turn these checks into an owner-assigned submission checklist with artifact/console evidence.

# Mobile configuration

Use the current approved values from a project maintainer. Keep local values in ignored `mobile/.env`; do not copy private configuration into issues, QA reports, screenshots, or Git. This reference lists names consumed by the current source, not credentials or a production-configuration attestation.

The app configuration is `mobile/app.config.js`, with EAS profiles in `mobile/eas.json`. Run native/EAS commands from `mobile/`. Restart Metro after local environment edits; changes to native configuration require a new native build.

| Purpose | Names / source | When needed |
| --- | --- | --- |
| Firebase client | `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID` | Authentication and Firebase-backed features; use the matching Firebase app's client configuration. |
| Browser Maps | `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` | Web maps; apply the project's API/origin restrictions. |
| Native Maps | `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY` | Native Maps plugin/build configuration, with matching platform restrictions. |
| Place search | `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` | Dedicated Places key; current search falls back to the web Maps key when absent. |
| Native Google login and reauthentication | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | The native button/reauthentication use platform OAuth IDs. Verify redirects and package/signing restrictions in a rebuilt installed app; browser Google login is a separate path. |
| Browser App Check | `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` | When the project's web App Check setup requires it; absence skips web initialization. Native App Check requires separate platform setup. |
| Admin identity list | `ADMIN_EMAILS` | Canonical backend list in ignored `firebase/functions/.env.<project-id>` for local/deploy work, or the selected EAS environment for cloud builds. `app.config.js` derives `EXPO_PUBLIC_ADMIN_EMAILS` for UI visibility; server authorization must still guard each protected call. Avoid maintaining divergent client/server lists. |
| Android Firebase/FCM | `GOOGLE_SERVICES_JSON` file variable, or ignored `mobile/google-services.json` locally | Firebase Android configuration used by native remote-push setup. FCM service-account credentials belong in the authorized native-build/push infrastructure, never an `EXPO_PUBLIC_` value. |
| Optional support links | `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_DONATION_URL` | Override issue/Ko-fi fallbacks; verify the intended public destinations before release. |

EAS profiles select `development`, `preview`, and `production` environments explicitly. A local file does not prove those environments have the same values. Verify presence and restrictions with an authorized maintainer rather than printing values. Existing signing, upload, and submission instructions are in the root README; no signing or store changes are required for ordinary UI work.

`EXPO_PUBLIC_` configuration is bundled into the client. Keep backend Maps/provider credentials and service-account private keys out of it. Maps/Firebase client settings still need appropriate service-side restrictions and authorization.

For release verification, distinguish local trip notifications from remote service-alert push, and distinguish notification display from background location progression. Use a configured installed artifact to test first-launch permissions, native Google login/reauthentication, Maps, notification delivery and account isolation. A JavaScript export cannot establish those behaviors.

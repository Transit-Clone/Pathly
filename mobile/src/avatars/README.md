# Bean avatar kit

Prepared separately while other app work is in progress. No existing screens, account data, branding, or dependencies have been changed. These are hand-authored SVGs based on the approved minimal bean direction, not cropped images from the concept sheet.

## Included

- 12 body colors, 12 eye styles, 12 mouths (including none), 10 hair options (including bald): 17,280 combinations.
- One transparent 128 x 128 coordinate system, shared by all parts. Eyes, mouth, and hair occupy fixed regions so any combination fits.
- 12 named starter presets, complete SVG exports, individual transparent part SVGs, and a body SVG in `mobile/assets/bean-avatars/`.
- `BeanAvatar.tsx`: reusable React Native/web renderer using the existing `react-native-svg` dependency.
- `beanAvatar.ts`: typed configuration, artwork, defaults, presets, normalization, randomizer, and SVG exporter. This is the artwork source of truth.
- `mobile/assets/bean-avatars/preview.html`: standalone interactive builder with color/eyes/mouth/hair controls, randomize, SVG download, configuration copying, and actual-size light/dark previews. Open directly in a browser. This preview does not save to an account.

Regenerate exports after editing artwork:

```sh
node scripts/export-bean-avatars.mjs
```

## Later app integration

Render the same configuration in the profile header and every other profile-picture location:

```tsx
import { BeanAvatar } from '../avatars/BeanAvatar';
import { normalizeBeanAvatar } from '../avatars/beanAvatar';

<BeanAvatar config={normalizeBeanAvatar(profile.avatar)} size={48} />
```

Store the compact versioned choices in the signed-in user's existing Firestore document (`users/{uid}`), rather than uploading a separate image:

```json
{
  "avatar": {
    "version": 1,
    "color": "sage",
    "eyes": "wide",
    "mouth": "flat",
    "hair": "none"
  }
}
```

Suggested flow: tap profile picture → Customize bean → edit local draft → Save. Show presets plus four controls: Color, Eyes, Mouth, Hair, and a Surprise me action. Cancel discards the draft. Save merges only `avatar` into the user document, updates the shared profile state, and keeps the editor open with retry on write failure. Account switching must clear previous user's state. Signed-out users can preview; decide whether to save a guest choice locally or ask them to sign in before persisting.

Existing `userProfile.ts` only creates/ensures a document. Add a profile subscription and an update function when integrating; do not overload the create function or overwrite the document. Existing owner-only `/users/{uid}` Firestore rules currently permit this field; consider explicit avatar field validation when tightening the profile rules. Treat unknown or malformed configs as untrusted and pass them through `normalizeBeanAvatar`. Missing avatars can show this kit's default or the existing account fallback, depending on product preference. Keep Firebase Auth provider photos intact so users can return to them later if that choice is offered.

The native renderer accepts an accessibility label (for example, the user's name); omit it if nearby text identifies the same user. Editor options need labels and selected states. Colors have human-readable names; identification does not depend only on color. The preview includes 24/32/48/64px examples: at 24px the largest eyes/shades/mustache read best; fine hair and mouth details are secondary. No animation is required.

## Scope remaining

Assets and renderer are ready for integration. The live in-app customizer, persistence/subscription, profile-picture replacement, and account/device verification are deliberately deferred until the concurrent app work is finished. The preview is an asset review tool, not a shipped settings screen.

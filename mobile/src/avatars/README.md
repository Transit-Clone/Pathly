# Bean avatar kit

Hand-authored SVGs based on the approved minimal bean direction, not cropped images from the concept sheet. Integrated into the profile card and home screen profile button using the existing SVG dependency.

## Included

- 12 body colors, 12 eye styles, 12 mouths (including none), 10 hair options (including bald): 17,280 combinations.
- One transparent 128 x 128 coordinate system, shared by all parts. Eyes, mouth, and hair occupy fixed regions so any combination fits.
- 12 named starter presets, complete SVG exports, individual transparent part SVGs, and a body SVG in `mobile/assets/bean-avatars/`.
- `BeanAvatarImage.tsx`: reusable React Native/web renderer using the existing `react-native-svg` dependency.
- `BeanAvatarEditor.tsx`: animated live preview, tabbed Color/Eyes/Mouth/Hair option grids, round icon-only randomizer, Save, Cancel, and loading/error handling. No preset starting points or tagline. The opt-in idle animation gently bobs and sways; it stops on unmount and respects reduced motion. Small profile icons and option thumbnails remain still.
- `beanAvatar.ts`: typed configuration, artwork, defaults, presets, normalization, randomizer, and SVG exporter. This is the artwork source of truth.
- `mobile/assets/bean-avatars/preview.html`: standalone interactive builder with color/eyes/mouth/hair controls, randomize, SVG download, configuration copying, and actual-size light/dark previews. Open directly in a browser. This preview does not save to an account.

Regenerate exports after editing artwork:

```sh
node scripts/export-bean-avatars.mjs
```

## App integration

Render the same configuration in the profile header and every other profile-picture location:

```tsx
import { BeanAvatar } from '../avatars/BeanAvatarImage';
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

New profile documents receive one saved random bean. Signup and profile backfill share an idempotent transaction so overlapping creation cannot replace a bean. Existing profiles stay unchanged.

Flow: tap profile picture (or Customize your bean in settings) → edit local draft → Save. Cancel discards the draft. Save merges only `avatar` into the user document, updates the shared profile state, and keeps the editor open with retry on write failure. Account switching clears the previous user's picture. Signed-out users must sign in before editing or saving.

`userProfile.ts` subscribes to the user document and merges avatar writes after ensuring the document exists. `AuthContext` shares the picture across screens, guards state by account ID, and exposes loading/error/retry/save. Existing owner-only `/users/{uid}` Firestore rules permit this field. Unknown or malformed configs pass through `normalizeBeanAvatar`; missing avatars show the default bean. Firebase Auth provider photos remain intact.

The native renderer accepts an accessibility label (for example, the user's name); omit it if nearby text identifies the same user. Editor options need labels and selected states. Colors have human-readable names; identification does not depend only on color. The preview includes 24/32/48/64px examples: at 24px the largest eyes/shades/mustache read best; fine hair and mouth details are secondary. No animation is required.

The standalone HTML preview remains an asset review tool; it never writes to a Pathly account. Cross-device sync uses the signed-in user's Firestore document. Automated tests cover saved choices, both profile-picture locations, remount restoration, canceled drafts, write failures/retry, load failures/retry, and account switching/sign-out. Live multi-device verification still requires signed-in devices.

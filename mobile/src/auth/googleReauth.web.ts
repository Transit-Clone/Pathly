import { GoogleAuthProvider, reauthenticateWithPopup, type User } from 'firebase/auth';

import type { GoogleReauth } from './googleReauthTypes';

export type { GoogleReauth } from './googleReauthTypes';

/** Web: Firebase's Google popup, like the web sign-in button (googleReauth.ts explains why). */
export function useGoogleReauth(): GoogleReauth {
  return {
    available: true,
    reauthenticate: async (user: User) => {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    },
  };
}

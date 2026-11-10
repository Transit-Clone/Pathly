import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Platform } from 'react-native';

import type { GoogleReauth } from './googleReauthTypes';

/**
 * Re-confirms a Google sign-in before a sensitive action (deleting the account): Firebase asks
 * for a recent sign-in, and a rider who joined with Google has no password to type. Native: the
 * same Google sign-in page as AuthScreen, whose ID token re-authenticates the current user.
 */
export type { GoogleReauth } from './googleReauthTypes';

const clientIds = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const platformClientId = Platform.OS === 'ios' ? clientIds.iosClientId : clientIds.androidClientId;

const cancelled = () => Object.assign(new Error('Google sign-in was cancelled.'), { code: 'auth/user-cancelled' });

function useConfiguredGoogleReauth(): GoogleReauth {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest(clientIds);
  return {
    available: Boolean(request),
    reauthenticate: async (user) => {
      const result = await promptAsync();
      if (result.type !== 'success') {
        if (result.type === 'error') throw result.error ?? cancelled();
        throw cancelled();
      }
      const idToken = result.params.id_token;
      if (!idToken) throw new Error('Google returned no ID token.');
      await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken));
    },
  };
}

function useUnavailableGoogleReauth(): GoogleReauth {
  return { available: false, reauthenticate: async () => { throw cancelled(); } };
}

// The request hook throws without this platform's client ID, so it's only used with one (the
// choice is fixed for the app's lifetime, so hook order never changes).
export const useGoogleReauth: () => GoogleReauth = platformClientId ? useConfiguredGoogleReauth : useUnavailableGoogleReauth;

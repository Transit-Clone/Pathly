import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { signInWithGoogleIdToken } from '../auth/authService';
import { GoogleButton, type GoogleSignInButtonProps } from './GoogleButton';

// Closes the browser tab Google's sign-in page redirects back from.
WebBrowser.maybeCompleteAuthSession();

const clientIds = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const platformClientId = Platform.OS === 'ios' ? clientIds.iosClientId : clientIds.androidClientId;

/** Native: Google's sign-in page via expo-auth-session, then its ID token signs in to Firebase. Hidden until this platform's client ID is set. */
export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  return platformClientId ? <ConfiguredGoogleSignInButton {...props} /> : null;
}

// The request hook throws without this platform's client ID, so it's only mounted with one.
function ConfiguredGoogleSignInButton({ disabled, onError, onStart }: GoogleSignInButtonProps) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(clientIds);

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token;
      if (idToken) signInWithGoogleIdToken(idToken).catch(onError);
      else onError(new Error('Google returned no ID token.'));
    } else if (response?.type === 'error') {
      onError(response.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to each new response only
  }, [response]);

  return (
    <GoogleButton
      disabled={disabled || !request}
      onPress={() => {
        onStart();
        promptAsync().catch(onError);
      }}
    />
  );
}

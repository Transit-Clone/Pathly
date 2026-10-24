import { signInWithGooglePopup } from '../auth/authService';
import { GoogleButton, type GoogleSignInButtonProps } from './GoogleButton';

/** Web: Firebase's popup needs no client ID of its own, only Google enabled in the Firebase console. */
export function GoogleSignInButton({ disabled, onError, onStart }: GoogleSignInButtonProps) {
  const signIn = async () => {
    onStart();
    try {
      await signInWithGooglePopup();
    } catch (error) {
      onError(error);
    }
  };
  return <GoogleButton disabled={disabled} onPress={signIn} />;
}

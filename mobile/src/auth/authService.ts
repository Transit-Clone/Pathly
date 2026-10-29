import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type UserCredential } from 'firebase/auth';

import { auth } from '../lib/firebase';
import { createUserProfile } from './userProfile';

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(credential.user, { displayName });
  await createUserProfile(credential.user);
  return credential;
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Web: Firebase's own Google popup. A new account's profile doc is backfilled by AuthContext. */
export function signInWithGooglePopup(): Promise<UserCredential> {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

/** Native: the ID token from Google's sign-in page (expo-auth-session), exchanged for a Firebase session. */
export function signInWithGoogleIdToken(idToken: string): Promise<UserCredential> {
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

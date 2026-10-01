import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, type UserCredential } from 'firebase/auth';

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

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

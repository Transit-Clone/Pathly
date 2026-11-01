import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, signInAnonymously, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User, type UserCredential } from 'firebase/auth';

import { auth } from '../lib/firebase';
import { createUserProfile } from './userProfile';

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(credential.user, { displayName });
  await createUserProfile(credential.user);
  // A failed send isn't a failed sign-up: the confirmation screen can send it again.
  await sendEmailVerification(credential.user).catch(() => undefined);
  return credential;
}

/** Accounts made before confirmation was required stay as they are. */
const EMAIL_CONFIRMATION_REQUIRED_FROM = Date.UTC(2026, 10, 1);

/** Password accounts confirm their address before using the app; Google has already, and guests have none. */
export function needsEmailConfirmation(user: User): boolean {
  if (user.isAnonymous || user.emailVerified) return false;
  if (!user.providerData?.some((provider) => provider.providerId === 'password')) return false;
  const created = Date.parse(user.metadata?.creationTime ?? '');
  return Number.isFinite(created) && created >= EMAIL_CONFIRMATION_REQUIRED_FROM;
}

/** What "Wrong email?" carries back to the sign-up form. Never the password. */
export type SignUpDraft = { displayName: string; email: string; mode: 'signIn' | 'signUp'; notice?: string };
let signUpDraft: SignUpDraft | null = null;
export function setSignUpDraft(draft: SignUpDraft): void {
  signUpDraft = draft;
}
export function takeSignUpDraft(): SignUpDraft | null {
  const draft = signUpDraft;
  signUpDraft = null;
  return draft;
}

/** A guest: a real but anonymous Firebase session, so the backend's callables still work. */
export function signInAsGuest(): Promise<UserCredential> {
  return signInAnonymously(auth);
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

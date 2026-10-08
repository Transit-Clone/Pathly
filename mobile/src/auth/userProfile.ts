import type { User } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';

function profileFor(user: User) {
  return {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    createdAt: serverTimestamp(),
  };
}

/** Creates the Firestore profile doc the first time a user signs up. */
export async function createUserProfile(user: User): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), profileFor(user));
}

/**
 * Creates the profile doc for an account that doesn't have one yet (e.g. made before profiles
 * existed). A transaction, so it can't overwrite one that sign-up writes at the same moment.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  const profileRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(profileRef)).exists()) return;
    transaction.set(profileRef, profileFor(user));
  });
}

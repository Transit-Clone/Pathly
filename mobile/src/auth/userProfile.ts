import type { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';

/** Creates the Firestore profile doc the first time a user signs up. */
export async function createUserProfile(user: User): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    createdAt: serverTimestamp(),
  });
}

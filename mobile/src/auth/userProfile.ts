import type { User } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import { normalizeBeanAvatar, randomBeanAvatar, type BeanAvatarConfig } from '../avatars/beanAvatar';

import { db } from '../lib/firebase';

function profileFor(user: User) {
  return {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    createdAt: serverTimestamp(),
    avatar: randomBeanAvatar(),
  };
}

/** Creates the Firestore profile doc the first time a user signs up. */
export async function createUserProfile(user: User): Promise<void> {
  await ensureUserProfile(user);
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

/** Subscribe to the same profile picture on every device and every screen. */
export function subscribeUserAvatar(uid: string, onChange: (avatar: BeanAvatarConfig) => void, onError: () => void) {
  return onSnapshot(doc(db, 'users', uid), (snapshot) => {
    onChange(normalizeBeanAvatar(snapshot.data()?.avatar));
  }, onError);
}

export async function saveUserAvatar(user: User, avatar: BeanAvatarConfig): Promise<void> {
  await ensureUserProfile(user);
  await setDoc(doc(db, 'users', user.uid), { avatar: normalizeBeanAvatar(avatar) }, { merge: true });
}

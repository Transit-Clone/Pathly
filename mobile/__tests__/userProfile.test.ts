import type { User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

import { createUserProfile, ensureUserProfile } from '../src/auth/userProfile';
import { normalizeBeanAvatar } from '../src/avatars/beanAvatar';
import { db } from '../src/lib/firebase';

type Profile = { displayName: string | null; email: string | null };

function readProfiles() {
  const profiles: Record<string, Profile> = {};
  const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
    snapshot.docs.forEach((entry) => {
      profiles[entry.id] = entry.data() as Profile;
    });
  });
  unsubscribe();
  return profiles;
}

describe('ensureUserProfile', () => {
  it('assigns and saves a random bean once, including overlapping signup/backfill calls', async () => {
    const user = { uid: 'new-rider', email: 'new@example.com' } as User;
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.4);
    try {
      await ensureUserProfile(user);
      const initial = (await getDoc(doc(db, 'users', user.uid))).data()?.avatar;
      expect(initial).toEqual(normalizeBeanAvatar(initial));
      expect(initial.color).toBe('sky');
      random.mockReturnValue(0.9);
      await createUserProfile(user);
      await ensureUserProfile(user);
      expect((await getDoc(doc(db, 'users', user.uid))).data()?.avatar).toEqual(initial);
    } finally { random.mockRestore(); }
  });
  it('creates a profile doc for an account that has none', async () => {
    await ensureUserProfile({ uid: 'uid-1', email: 'rider@example.com', displayName: 'Pathly Rider' } as User);
    expect(readProfiles()['uid-1']).toMatchObject({ displayName: 'Pathly Rider', email: 'rider@example.com' });
  });

  it('leaves an existing profile untouched', async () => {
    await setDoc(doc(db, 'users', 'uid-2'), { displayName: 'Existing', email: 'x@example.com', createdAt: null });
    await ensureUserProfile({ uid: 'uid-2', email: 'x@example.com', displayName: null } as User);
    expect(readProfiles()['uid-2']).toMatchObject({ displayName: 'Existing' });
  });
});

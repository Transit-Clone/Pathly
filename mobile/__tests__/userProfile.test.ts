import type { User } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { ensureUserProfile } from '../src/auth/userProfile';
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

import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '../lib/firebase';
import { ensureUserProfile } from './userProfile';

type AuthValue = {
  /** True until the first auth state callback fires (session restore from storage). */
  initializing: boolean;
  user: User | null;
};

const AuthContext = createContext<AuthValue>({ initializing: true, user: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        // Backfills a missing profile doc; best effort, since nothing in the app reads it yet.
        if (nextUser) ensureUserProfile(nextUser).catch(() => undefined);
        setUser(nextUser);
        setInitializing(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(() => ({ initializing, user }), [initializing, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

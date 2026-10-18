import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { warmBackend } from '../data/backendWarmup';
import { auth } from '../lib/firebase';
import { ensureUserProfile } from './userProfile';

type AuthValue = {
  /** True until the first auth state callback fires (session restore from storage). */
  initializing: boolean;
  user: User | null;
  /** Re-renders readers after the signed-in User changes in place (e.g. updateProfile). */
  refreshUser: () => void;
};

const AuthContext = createContext<AuthValue>({ initializing: true, user: null, refreshUser: () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Firebase updates the User object in place, so a version tells consumers it changed.
  const [userVersion, setUserVersion] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        // Backfills a missing profile doc; best effort, since nothing in the app reads it yet.
        if (nextUser) {
          ensureUserProfile(nextUser).catch(() => undefined);
          warmBackend(nextUser.uid);
        }
        setUser(nextUser);
        setInitializing(false);
      }),
    [],
  );

  const refreshUser = useCallback(() => setUserVersion((version) => version + 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- userVersion marks an in-place change to user.
  const value = useMemo<AuthValue>(() => ({ initializing, user, refreshUser }), [initializing, user, refreshUser, userVersion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

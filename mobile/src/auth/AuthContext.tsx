import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '../lib/firebase';

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

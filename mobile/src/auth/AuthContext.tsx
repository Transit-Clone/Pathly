import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { warmBackend } from '../data/backendWarmup';
import { auth } from '../lib/firebase';
import { DEFAULT_BEAN_AVATAR, normalizeBeanAvatar, type BeanAvatarConfig } from '../avatars/beanAvatar';
import { ensureUserProfile, saveUserAvatar, subscribeUserAvatar } from './userProfile';

type AuthValue = {
  /** True until the first auth state callback fires (session restore from storage). */
  initializing: boolean;
  user: User | null;
  /** Re-renders readers after the signed-in User changes in place (e.g. updateProfile). */
  refreshUser: () => void;
  avatar: BeanAvatarConfig;
  avatarLoading: boolean;
  avatarError: boolean;
  retryAvatar: () => void;
  saveAvatar: (avatar: BeanAvatarConfig) => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  initializing: true, user: null, refreshUser: () => undefined,
  avatar: { ...DEFAULT_BEAN_AVATAR }, avatarLoading: false, avatarError: false,
  retryAvatar: () => undefined,
  saveAvatar: async () => { throw new Error('Sign in to save your bean.'); },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Firebase updates the User object in place, so a version tells consumers it changed.
  const [userVersion, setUserVersion] = useState(0);
  const [avatarState, setAvatarState] = useState<{ uid: string; avatar: BeanAvatarConfig; loading: boolean; error: boolean } | null>(null);
  const [avatarRetry, setAvatarRetry] = useState(0);
  const currentUser = useRef(user);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        if (currentUser.current?.uid !== nextUser?.uid) {
          setAvatarState(nextUser ? { uid: nextUser.uid, avatar: { ...DEFAULT_BEAN_AVATAR }, loading: true, error: false } : null);
        }
        currentUser.current = nextUser;
        // Backfills accounts created before profile documents existed.
        if (nextUser) {
          ensureUserProfile(nextUser).catch(() => undefined);
          warmBackend(nextUser.uid);
        }
        setUser(nextUser);
        setInitializing(false);
      }),
    [],
  );

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsubscribe = subscribeUserAvatar(uid, (avatar) => {
      if (active) setAvatarState({ uid, avatar, loading: false, error: false });
    }, () => {
      if (active) setAvatarState((previous) => ({ uid, avatar: previous?.uid === uid ? previous.avatar : { ...DEFAULT_BEAN_AVATAR }, loading: false, error: true }));
    });
    return () => { active = false; unsubscribe(); };
  }, [uid, avatarRetry]);

  const retryAvatar = useCallback(() => {
    const owner = currentUser.current;
    if (owner) setAvatarState({ uid: owner.uid, avatar: { ...DEFAULT_BEAN_AVATAR }, loading: true, error: false });
    setAvatarRetry((version) => version + 1);
  }, []);
  const saveAvatar = useCallback(async (config: BeanAvatarConfig) => {
    const owner = currentUser.current;
    if (!owner) throw new Error('Sign in to save your bean.');
    const avatar = normalizeBeanAvatar(config);
    await saveUserAvatar(owner, avatar);
    if (currentUser.current?.uid === owner.uid) setAvatarState({ uid: owner.uid, avatar, loading: false, error: false });
  }, []);

  // Key state by owner so switching accounts never flashes another rider's picture.
  const avatar = avatarState && avatarState.uid === uid ? avatarState.avatar : { ...DEFAULT_BEAN_AVATAR };
  const avatarLoading = Boolean(uid && (avatarState?.uid !== uid || avatarState.loading));
  const avatarError = Boolean(uid && avatarState?.uid === uid && avatarState.error);

  const refreshUser = useCallback(() => setUserVersion((version) => version + 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- userVersion marks an in-place change to user.
  const value = useMemo<AuthValue>(() => ({ initializing, user, refreshUser, avatar, avatarLoading, avatarError, retryAvatar, saveAvatar }), [initializing, user, refreshUser, userVersion, avatar, avatarLoading, avatarError, retryAvatar, saveAvatar]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

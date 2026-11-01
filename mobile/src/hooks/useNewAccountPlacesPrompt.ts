import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';

/** Long enough to outlast confirming an email; older accounts never see the prompt. */
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewAccount(user: User | null, now = Date.now()): boolean {
  if (!user || user.isAnonymous) return false;
  const created = Date.parse(user.metadata?.creationTime ?? '');
  return Number.isFinite(created) && now - created < NEW_ACCOUNT_MS;
}

/** Whether to ask a just-created account for its home and work or school, until it's answered once. */
export function useNewAccountPlacesPrompt(user: User | null): { show: boolean; dismiss: () => void } {
  const uid = user?.uid;
  const eligible = isNewAccount(user);
  const key = `pathly:placesPromptDone:${uid}`;
  const [pendingFor, setPendingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!eligible || !uid) return undefined;
    let active = true;
    void AsyncStorage.getItem(key).then(
      (done) => { if (active && !done) setPendingFor(uid); },
      () => undefined,
    );
    return () => { active = false; };
  }, [eligible, key, uid]);

  const dismiss = useCallback(() => {
    setPendingFor(null);
    void AsyncStorage.setItem(key, '1').catch(() => undefined);
  }, [key]);

  return { show: eligible && pendingFor === uid, dismiss };
}

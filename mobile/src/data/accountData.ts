import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Platform, Share } from 'react-native';

import { auth, db } from '../lib/firebase';
import { navigationStorageKey } from './navigationStorage';
import { preferencesKey } from './userPreferences';

/**
 * Account actions behind Settings -> Account details and Privacy: renaming, password reset,
 * exporting everything Pathly keeps for the rider, and deleting the account.
 */

/** The per-user collections under users/{uid} (see userData.ts). */
const USER_COLLECTIONS = ['searches', 'prevDests', 'savedLocations'] as const;

export const MAX_DISPLAY_NAME = 60;

export async function updateDisplayName(user: User, name: string): Promise<string> {
  const displayName = name.trim().slice(0, MAX_DISPLAY_NAME);
  if (!displayName) throw new Error('empty-name');
  await updateProfile(user, { displayName });
  // The profile doc mirrors the name; a failed mirror doesn't undo the rename.
  await setDoc(doc(db, 'users', user.uid), { displayName }, { merge: true }).catch(() => undefined);
  return displayName;
}

export function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/** Firestore Timestamps become ISO strings so the export is plain JSON. */
function plain(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plain(entry)]));
}

export type UserDataExport = {
  exportedAt: string;
  account: { uid: string; email: string | null; displayName: string | null };
  profile: unknown;
  searches: unknown[];
  prevDests: unknown[];
  savedLocations: unknown[];
};

export async function exportUserData(user: User, now = new Date()): Promise<UserDataExport> {
  const [profile, ...lists] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    ...USER_COLLECTIONS.map((name) => getDocs(collection(db, 'users', user.uid, name))),
  ]);
  const [searches, prevDests, savedLocations] = lists.map((snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...(plain(entry.data()) as object) })));
  return {
    exportedAt: now.toISOString(),
    account: { uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null },
    profile: profile.exists() ? plain(profile.data()) : null,
    searches: searches ?? [],
    prevDests: prevDests ?? [],
    savedLocations: savedLocations ?? [],
  };
}

export const EXPORT_FILE_NAME = 'pathly-data.json';

/** Downloads the export as a file on web; on a phone, opens the share sheet with the JSON. */
export async function shareUserData(data: UserDataExport): Promise<'downloaded' | 'shared'> {
  const json = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = EXPORT_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return 'downloaded';
  }
  await Share.share({ title: EXPORT_FILE_NAME, message: json });
  return 'shared';
}

export type DeleteAccountProblem = 'wrong-password' | 'too-many-attempts' | 'failed';

export function deleteAccountProblem(error: unknown): DeleteAccountProblem {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') return 'wrong-password';
  if (code === 'auth/too-many-requests') return 'too-many-attempts';
  return 'failed';
}

/**
 * Confirms the password (Firebase requires a recent sign-in), deletes every Firestore doc under
 * users/{uid} and this device's saved state for the rider, then deletes the Auth user, which
 * signs them out.
 */
export async function deleteAccount(user: User, password: string): Promise<void> {
  if (!user.email) throw Object.assign(new Error('no-email'), { code: 'auth/no-email' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  for (const name of USER_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, 'users', user.uid, name));
    await Promise.all(snapshot.docs.map((entry) => deleteDoc(doc(db, 'users', user.uid, name, entry.id))));
  }
  await deleteDoc(doc(db, 'users', user.uid));
  await AsyncStorage.multiRemove([preferencesKey(user.uid), navigationStorageKey(user.uid)]).catch(() => undefined);
  await deleteUser(user);
}

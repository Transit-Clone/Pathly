import { collection, limit, onSnapshot, orderBy, query, type Timestamp, type Unsubscribe } from 'firebase/firestore';

import { db } from '../lib/firebase';

const MAX_INBOX_ENTRIES = 50;

/** One alert on a saved line, written by the backend (firebase/functions/src/routeAlerts.ts). */
export type AlertInboxEntry = { id: string; title: string; body: string; sentAt: Date | null };

/** Newest-first listener; `sentAt` is null briefly while a just-written server timestamp is pending. */
export function subscribeToAlertInbox(uid: string, onChange: (entries: AlertInboxEntry[]) => void, onError: () => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, 'alertInbox'), orderBy('sentAt', 'desc'), limit(MAX_INBOX_ENTRIES)),
    (snapshot) => onChange(snapshot.docs.map((entry) => {
      const data = entry.data() as { title?: string; body?: string; sentAt?: Timestamp | null };
      return { id: entry.id, title: data.title ?? 'Service alert', body: data.body ?? '', sentAt: data.sentAt?.toDate() ?? null };
    })),
    onError,
  );
}

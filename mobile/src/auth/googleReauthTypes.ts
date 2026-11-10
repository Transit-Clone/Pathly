import type { User } from 'firebase/auth';

/** What Settings needs to re-confirm a Google sign-in (googleReauth.ts explains why). */
export type GoogleReauth = {
  /** False until Google's sign-in page is ready, or always when this platform has no client ID. */
  available: boolean;
  /** Throws `auth/user-cancelled` when the rider backs out, `auth/user-mismatch` for another account. */
  reauthenticate: (user: User) => Promise<void>;
};

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

const DEFAULT_ADMIN_EMAILS = 'admin@gmail.com';

/**
 * Comma-separated admin emails: ADMIN_EMAILS from firebase/functions/.env when set, else the
 * default. A plain environment variable rather than a deploy parameter, so deploys never stop to
 * ask for it.
 */
function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS;
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

/** True when the caller's verified sign-in email is a configured admin email. */
export function isAdmin(auth: CallableRequest['auth']): boolean {
  const email = auth?.token?.email;
  return typeof email === 'string' && adminEmails().has(email.toLowerCase());
}

/** Rejects anyone but an admin; call after enforceCallableSecurity so the caller is signed in. */
export function requireAdmin(request: Pick<CallableRequest, 'auth'>): void {
  if (!isAdmin(request.auth)) throw new HttpsError('permission-denied', 'Admin access is required.');
}

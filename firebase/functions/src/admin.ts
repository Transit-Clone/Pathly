import { defineString } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

const DEFAULT_ADMIN_EMAILS = 'admin@gmail.com';

/**
 * Comma-separated admin emails. Declared as a deploy parameter so it can be changed in
 * functions/.env without a code change; firebase-functions also exposes it as process.env.
 */
export const adminEmailsParam = defineString('ADMIN_EMAILS', { default: DEFAULT_ADMIN_EMAILS });

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

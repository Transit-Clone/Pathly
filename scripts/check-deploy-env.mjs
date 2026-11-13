#!/usr/bin/env node
// Pre-flight for deploys: the admin list comes from this machine's local, uncommitted
// firebase/functions/.env.<project-id>, so a deploy from a machine without it silently left only
// the default admin (admin@gmail.com). Stops the deploy instead. The website (through
// mobile/app.config.js) and the backend both use that one list.
//
// Usage: node scripts/check-deploy-env.mjs web|backend
import { createRequire } from 'node:module';

const { readAdminEmails, where } = createRequire(import.meta.url)('./adminEmails.cjs');
const DEFAULT_ADMIN = 'admin@gmail.com';

const what = {
  web: 'who sees Admin tools on the site',
  backend: 'who may call the admin-only backend functions',
};

const target = process.argv[2];
if (!what[target]) {
  console.error('Usage: node scripts/check-deploy-env.mjs web|backend');
  process.exit(2);
}

const found = readAdminEmails();
const configured = new Set(
  (found?.value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
);
if (configured.size === 0 || (configured.size === 1 && configured.has(DEFAULT_ADMIN))) {
  console.error(`\n✖ ADMIN_EMAILS isn't set on this machine, so the deploy would leave only ${DEFAULT_ADMIN} as an admin.`);
  console.error(`  It decides ${what[target]}. Add the team's emails (comma-separated) to ${where}:`);
  console.error('    ADMIN_EMAILS=one@example.com,two@example.com\n');
  process.exit(1);
}
console.log(`✓ ADMIN_EMAILS: ${configured.size} admin${configured.size === 1 ? '' : 's'} (from ${found.source})`);

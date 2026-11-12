#!/usr/bin/env node
// Pre-flight for deploys: both admin lists come from this machine's local, uncommitted env files,
// so a deploy from a machine without them silently left only the default admin (admin@gmail.com).
// Stops the deploy instead, and warns when the website's list and the backend's differ.
//
// Usage: node scripts/check-deploy-env.mjs web|backend
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ADMIN = 'admin@gmail.com';

/** KEY=value pairs from the first of `files` that sets `key` (dotenv syntax, no expansion). */
function readKey(key, files) {
  if (process.env[key]) return { value: process.env[key], source: 'environment' };
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match?.[1] !== key) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      return { value, source: file.slice(root.length + 1) };
    }
  }
  return null;
}

const emails = (value) => new Set(value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

function projectId() {
  try {
    return JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects?.default ?? null;
  } catch {
    return null;
  }
}

// Expo's production export reads these, most specific first.
const mobileFiles = ['.env.production.local', '.env.local', '.env.production', '.env'].map((name) => join(root, 'mobile', name));
const project = projectId();
const functionsFiles = [project ? `.env.${project}` : null, '.env'].filter(Boolean).map((name) => join(root, 'firebase', 'functions', name));

const lists = {
  web: { key: 'EXPO_PUBLIC_ADMIN_EMAILS', files: mobileFiles, where: 'mobile/.env', what: 'who sees Admin tools on the site' },
  backend: { key: 'ADMIN_EMAILS', files: functionsFiles, where: `firebase/functions/.env.${project ?? '<project-id>'}`, what: 'who may call the admin-only backend functions' },
};

const target = process.argv[2];
if (!lists[target]) {
  console.error('Usage: node scripts/check-deploy-env.mjs web|backend');
  process.exit(2);
}

const { key, files, where, what } = lists[target];
const found = readKey(key, files);
const configured = found ? emails(found.value) : new Set();
if (configured.size === 0 || (configured.size === 1 && configured.has(DEFAULT_ADMIN))) {
  console.error(`\n✖ ${key} isn't set on this machine, so the deploy would leave only ${DEFAULT_ADMIN} as an admin.`);
  console.error(`  It decides ${what}. Add the team's emails (comma-separated) to ${where}:`);
  console.error(`    ${key}=one@example.com,two@example.com\n`);
  process.exit(1);
}
console.log(`✓ ${key}: ${configured.size} admin${configured.size === 1 ? '' : 's'} (from ${found.source})`);

// The two lists are kept separately; a mismatch is allowed but almost always a mistake.
const otherTarget = target === 'web' ? 'backend' : 'web';
const other = readKey(lists[otherTarget].key, lists[otherTarget].files);
if (other) {
  const otherEmails = emails(other.value);
  const differs = otherEmails.size !== configured.size || [...configured].some((email) => !otherEmails.has(email));
  if (differs) console.warn(`⚠ ${key} and ${lists[otherTarget].key} (${other.source}) list different admins.`);
}

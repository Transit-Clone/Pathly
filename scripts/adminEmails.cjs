// The one admin list: ADMIN_EMAILS in firebase/functions/.env.<project-id> (local, uncommitted).
// The backend reads that file itself when Firebase deploys it; mobile/app.config.js passes the
// same value to the app, and scripts/check-deploy-env.mjs checks it before deploys.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function projectId() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8')).projects?.default ?? null;
  } catch {
    return null;
  }
}

const project = projectId();
const files = [project ? `.env.${project}` : null, '.env']
  .filter(Boolean)
  .map((name) => path.join(root, 'firebase', 'functions', name));

/** Where the list lives, for messages. */
const where = `firebase/functions/.env.${project ?? '<project-id>'}`;

/** { value, source } from the ADMIN_EMAILS environment variable or the first file that sets it, else null. */
function readAdminEmails() {
  if (process.env.ADMIN_EMAILS) return { value: process.env.ADMIN_EMAILS, source: 'environment' };
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match?.[1] !== 'ADMIN_EMAILS') continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      return { value, source: path.relative(root, file).split(path.sep).join('/') };
    }
  }
  return null;
}

module.exports = { readAdminEmails, where };

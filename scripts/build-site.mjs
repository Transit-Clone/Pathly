// Puts pathly.web.app together in dist/site: the landing page and privacy policy (website/) at the
// root, and the web app's export (mobile/dist, built with baseUrl /app) under /app.
// Run `npm run build:web` first, or use `npm run build:site`, which does both.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'site');
const app = join(root, 'mobile', 'dist');

if (!existsSync(join(app, 'index.html'))) {
  console.error('mobile/dist has no web build. Run `npm run build:web` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'website'), out, { recursive: true });
cpSync(app, join(out, 'app'), { recursive: true });
console.log('Site ready in dist/site (landing at /, app at /app, privacy at /privacy).');

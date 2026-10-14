const assert = require('node:assert/strict');
const test = require('node:test');

const { isAdmin, requireAdmin } = require('../lib/admin');

const auth = (email) => ({ uid: 'u1', token: email === undefined ? {} : { email } });

test.afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

test('recognizes the default admin email in any case', () => {
  assert.equal(isAdmin(auth('admin@gmail.com')), true);
  assert.equal(isAdmin(auth('Admin@Gmail.COM')), true);
});

test('rejects other emails, a missing email, and signed-out callers', () => {
  assert.equal(isAdmin(auth('rider@gmail.com')), false);
  assert.equal(isAdmin(auth(undefined)), false);
  assert.equal(isAdmin(null), false);
  assert.throws(() => requireAdmin({ auth: auth('rider@gmail.com') }), { code: 'permission-denied' });
  assert.throws(() => requireAdmin({ auth: null }), { code: 'permission-denied' });
  assert.doesNotThrow(() => requireAdmin({ auth: auth('admin@gmail.com') }));
});

test('reads the configured admin list', () => {
  process.env.ADMIN_EMAILS = 'ops@example.com, qa@example.com';
  assert.equal(isAdmin(auth('qa@example.com')), true);
  assert.equal(isAdmin(auth('admin@gmail.com')), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagFlow, isDestructive } from '../flags.js';

test('auth header and cookie', () => {
  const t = flagFlow({ reqHeaders: [{ name: 'Authorization', value: 'Bearer x' }, { name: 'Cookie', value: 's=1' }], url: 'https://x/api' });
  assert.ok(t.includes('auth-header'));
  assert.ok(t.includes('cookie'));
});

test('jwt in body and token in url', () => {
  const jwt = 'eyJhbGciOi.eyJzdWIiOi.sig_sig_sig';
  assert.ok(flagFlow({ url: 'https://x/a', reqBody: jwt }).includes('jwt'));
  assert.ok(flagFlow({ url: 'https://x/a?access_token=1' }).includes('token'));
});

test('admin path and id param', () => {
  assert.ok(flagFlow({ url: 'https://x/admin/users' }).includes('admin-path'));
  assert.ok(flagFlow({ url: 'https://x/api?user_id=7' }).includes('id-param'));
});

test('destructive by method or path', () => {
  assert.ok(isDestructive({ method: 'DELETE', url: 'https://x/a' }));
  assert.ok(isDestructive({ method: 'POST', url: 'https://x/account/refund' }));
  assert.ok(!isDestructive({ method: 'GET', url: 'https://x/a' }));
});

test('clean flow has no tags', () => {
  assert.deepEqual(flagFlow({ method: 'GET', url: 'https://x/home', reqHeaders: [] }), []);
});

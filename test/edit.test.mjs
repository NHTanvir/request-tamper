import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit } from '../edit.js';

const base = () => ({
  url: 'https://x/api/a',
  method: 'POST',
  headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'X-Role', value: 'user' }],
  body: '{"a":1}',
  bodyB64: false,
});

test('no edit returns an equivalent copy, inputs untouched', () => {
  const req = base();
  const out = applyEdit(req, {});
  assert.deepEqual(out, req);
  out.headers[0].value = 'changed';
  assert.equal(req.headers[0].value, 'application/json');
});

test('change url and method', () => {
  const out = applyEdit(base(), { url: 'https://x/api/b', method: 'PUT' });
  assert.equal(out.url, 'https://x/api/b');
  assert.equal(out.method, 'PUT');
});

test('setHeaders upserts case-insensitively', () => {
  const out = applyEdit(base(), { setHeaders: [{ name: 'x-role', value: 'admin' }, { name: 'X-New', value: '1' }] });
  assert.deepEqual(out.headers, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'x-role', value: 'admin' },
    { name: 'X-New', value: '1' },
  ]);
});

test('removeHeaders deletes case-insensitively', () => {
  const out = applyEdit(base(), { removeHeaders: ['content-type'] });
  assert.deepEqual(out.headers, [{ name: 'X-Role', value: 'user' }]);
});

test('headers array fully replaces the set', () => {
  const out = applyEdit(base(), { headers: [{ name: 'Only', value: 'one' }] });
  assert.deepEqual(out.headers, [{ name: 'Only', value: 'one' }]);
});

test('body replace (including empty string) sets bodyB64 flag', () => {
  const out = applyEdit(base(), { body: '{"a":2}' });
  assert.equal(out.body, '{"a":2}');
  assert.equal(out.bodyB64, false);
  const cleared = applyEdit(base(), { body: '' });
  assert.equal(cleared.body, '');
});

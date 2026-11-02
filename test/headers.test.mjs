import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headersToText, textToHeaders, utf8ToBase64, base64ToUtf8 } from '../headers.js';

test('headersToText joins name: value lines', () => {
  assert.equal(
    headersToText([{ name: 'A', value: '1' }, { name: 'B', value: '2' }]),
    'A: 1\nB: 2',
  );
});

test('textToHeaders parses lines and ignores blanks / malformed', () => {
  const out = textToHeaders('Content-Type: application/json\n\nbroken\nX-Y:  z ');
  assert.deepEqual(out, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Y', value: 'z' },
  ]);
});

test('text <-> headers round-trips', () => {
  const h = [{ name: 'Authorization', value: 'Bearer x' }, { name: 'Accept', value: '*/*' }];
  assert.deepEqual(textToHeaders(headersToText(h)), h);
});

test('base64 round-trips ASCII and UTF-8', () => {
  for (const s of ['', 'hello', '{"a":1}', 'café ☕ 日本語']) {
    assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
  }
});

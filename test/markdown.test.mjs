import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowToMarkdown, flowsToMarkdown } from '../markdown.js';

const flow = {
  method: 'POST', url: 'https://x/api/login', status: 200,
  flags: ['auth-header'], edited: true,
  reqHeaders: [{ name: 'Content-Type', value: 'application/json' }],
  reqBody: '{"u":"a"}',
  resHeaders: [{ name: 'Set-Cookie', value: 's=1' }],
  resBody: '{"ok":true}',
};

test('flowToMarkdown includes method, url, status, flags, bodies', () => {
  const md = flowToMarkdown(flow);
  assert.match(md, /### POST https:\/\/x\/api\/login/);
  assert.match(md, /Status: 200/);
  assert.match(md, /Flags: auth-header/);
  assert.match(md, /Edited before sending/);
  assert.match(md, /\{"u":"a"\}/);
  assert.match(md, /\{"ok":true\}/);
});

test('flowsToMarkdown counts flows and handles empty', () => {
  assert.match(flowsToMarkdown([flow]), /1 flow\(s\)/);
  assert.match(flowsToMarkdown([]), /No flows captured/);
});

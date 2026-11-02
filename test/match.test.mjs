import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, inScope, isStatic, ruleMatches, shouldPause } from '../match.js';

test('hostOf extracts lowercase hostname', () => {
  assert.equal(hostOf('https://API.Example.com/a?b=1'), 'api.example.com');
  assert.equal(hostOf('not a url'), '');
});

test('inScope respects host + subdomain', () => {
  assert.ok(inScope('https://app.example.com/x', ['example.com']));
  assert.ok(!inScope('https://evil.com/x', ['example.com']));
});

test('isStatic detects by resourceType and extension', () => {
  assert.ok(isStatic({ resourceType: 'Image', url: 'https://x/y' }));
  assert.ok(isStatic({ url: 'https://x/app.css?v=2' }));
  assert.ok(!isStatic({ resourceType: 'XHR', url: 'https://x/api/data' }));
});

test('ruleMatches: empty rule matches nothing; conditions are ANDed', () => {
  const flow = { method: 'POST', resourceType: 'XHR', url: 'https://x/api/login' };
  assert.ok(!ruleMatches(flow, {}));
  assert.ok(ruleMatches(flow, { urlIncludes: '/api/' }));
  assert.ok(ruleMatches(flow, { method: 'post', urlIncludes: 'login' }));
  assert.ok(!ruleMatches(flow, { method: 'GET', urlIncludes: 'login' }));
  assert.ok(!ruleMatches(flow, { urlIncludes: '/api/', enabled: false }));
});

test('shouldPause honours the intercept toggle', () => {
  const flow = { method: 'POST', resourceType: 'XHR', url: 'https://x/api/a' };
  assert.ok(!shouldPause(flow, { intercept: false }));
  assert.ok(shouldPause(flow, { intercept: true }));
});

test('shouldPause skips static assets by default', () => {
  const css = { resourceType: 'Stylesheet', url: 'https://x/a.css' };
  assert.ok(!shouldPause(css, { intercept: true }));
  assert.ok(shouldPause(css, { intercept: true, skipStatic: false }));
});

test('shouldPause with rules pauses only matches; no rules pauses all non-static', () => {
  const api = { method: 'POST', resourceType: 'XHR', url: 'https://x/api/a' };
  const other = { method: 'GET', resourceType: 'XHR', url: 'https://x/health' };
  assert.ok(shouldPause(api, { intercept: true, rules: [{ urlIncludes: '/api/' }] }));
  assert.ok(!shouldPause(other, { intercept: true, rules: [{ urlIncludes: '/api/' }] }));
  assert.ok(shouldPause(other, { intercept: true, rules: [] }));
});

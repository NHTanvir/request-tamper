// Integration test: drives the REAL background.js handlers through a mocked
// chrome API, exercising attach, the Fetch.requestPaused handler, forward/
// fulfill/fail, response capture and replay — the actual runtime code paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToUtf8 } from '../headers.js';

// background.js is an ES module: its top-level addListener calls run ONCE on
// first import. So build ONE shared mock, import once, and reset state per test.
const local = new Map(), session = new Map();
const L = {};                 // captured listeners (stable across tests)
const sent = [];              // {method, params} per debugger.sendCommand
const state = { tabUrl: 'https://localhost:8000/app', responseBody: '{"server":"ok"}' };

const area = (map) => ({
  async get(k) {
    if (k == null) return Object.fromEntries(map);
    if (typeof k === 'string') return map.has(k) ? { [k]: map.get(k) } : {};
    const out = {}; for (const key of [].concat(k)) if (map.has(key)) out[key] = map.get(key); return out;
  },
  async set(obj) { for (const [k, v] of Object.entries(obj)) map.set(k, v); },
  async remove(keys) { for (const k of [].concat(keys)) map.delete(k); },
});

globalThis.chrome = {
  storage: { local: area(local), session: area(session) },
  debugger: {
    async attach() {}, async detach() {},
    async sendCommand(_t, method, params) {
      sent.push({ method, params });
      if (method === 'Fetch.getResponseBody') return { body: state.responseBody, base64Encoded: false };
      return {};
    },
    onEvent: { addListener: (f) => (L.onEvent = f) },
    onDetach: { addListener: (f) => (L.onDetach = f) },
  },
  tabs: {
    async get(id) { return { id, url: state.tabUrl, windowId: 1 }; },
    async query() { return [{ id: 1, url: state.tabUrl, windowId: 1 }]; },
    onRemoved: { addListener: (f) => (L.onRemoved = f) },
  },
  alarms: { async create() {}, async clear() {}, onAlarm: { addListener: (f) => (L.onAlarm = f) } },
  action: { onClicked: { addListener: () => {} } },
  scripting: { async executeScript() { return [{ result: { status: 200, headers: [], body: 'replayed' } }]; } },
  runtime: { onMessage: { addListener: (f) => (L.onMessage = f) }, async sendMessage() {} },
};

await import('../background.js'); // registers listeners once against the mock

const h = {
  sent,
  reset() { local.clear(); session.clear(); sent.length = 0; state.tabUrl = 'https://localhost:8000/app'; },
  msg: (m) => new Promise((res) => L.onMessage(m, {}, res)),
  paused: (p) => L.onEvent({ tabId: 1 }, 'Fetch.requestPaused', p),
  last: (method) => [...sent].reverse().find((c) => c.method === method),
};
function setup() { h.reset(); return h; }

const reqStage = (over = {}) => ({
  requestId: 'i1', networkId: 'n1', resourceType: 'XHR',
  request: { url: 'https://localhost:8000/api/echo', method: 'POST',
    headers: { 'Content-Type': 'application/json' }, postData: '{"price":10}' },
  ...over,
});

test('attach refuses off-scope, accepts in-scope', async () => {
  const h = setup();
  await import('../background.js'); // registers listeners once
  // no scope yet -> refuse
  let r = await h.msg({ type: 'rt-attach', tabId: 1 });
  assert.equal(r.ok, false);
  // add scope -> accept, Fetch.enable issued
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  r = await h.msg({ type: 'rt-attach', tabId: 1 });
  assert.equal(r.ok, true);
  assert.ok(h.last('Fetch.enable'), 'Fetch.enable was sent');
});

test('intercept OFF: request is logged and passed through', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  await h.msg({ type: 'rt-attach', tabId: 1 });
  await h.paused(reqStage());
  const cont = h.last('Fetch.continueRequest');
  assert.ok(cont && cont.params.requestId === 'i1', 'passed through');
  const st = await h.msg({ type: 'rt-state', tabId: 1 });
  assert.equal(st.flows.length, 1);
  assert.equal(st.flows[0].method, 'POST');
});

test('off-scope request is continued immediately, never logged', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  await h.msg({ type: 'rt-attach', tabId: 1 });
  await h.paused(reqStage({ requestId: 'x1', networkId: 'nx', request: { url: 'https://evil.com/a', method: 'GET', headers: {} } }));
  assert.ok(h.last('Fetch.continueRequest').params.requestId === 'x1');
  const st = await h.msg({ type: 'rt-state', tabId: 1 });
  assert.ok(!st.flows.some((f) => f.url.includes('evil.com')));
});

test('intercept ON: matching request is HELD, then forwarded with edits', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  await h.msg({ type: 'rt-attach', tabId: 1 });
  await h.msg({ type: 'rt-settings', settings: { intercept: true, skipStatic: true, rules: [] } });

  const before = h.sent.length;
  await h.paused(reqStage({ requestId: 'i2', networkId: 'n2' }));
  // held: no continue/fulfill/fail emitted for i2
  assert.equal(h.sent.slice(before).length, 0, 'request is held, not resolved');
  let st = await h.msg({ type: 'rt-state', tabId: 1 });
  assert.equal(st.pending.length, 1);

  // forward with edits: method PUT, new body, extra header
  await h.msg({ type: 'rt-resolve', tabId: 1, requestId: 'i2', action: 'forward',
    edit: { method: 'PUT', url: 'https://localhost:8000/api/echo',
      headers: [{ name: 'X-Admin', value: '1' }], body: '{"price":1}' } });
  const cont = h.last('Fetch.continueRequest');
  assert.equal(cont.params.method, 'PUT');
  assert.deepEqual(cont.params.headers, [{ name: 'X-Admin', value: '1' }]);
  assert.equal(base64ToUtf8(cont.params.postData), '{"price":1}', 'body tampered + base64');
  st = await h.msg({ type: 'rt-state', tabId: 1 });
  assert.equal(st.pending.length, 0, 'no longer pending');
});

test('response stage: body captured onto the flow, then continued', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  await h.msg({ type: 'rt-attach', tabId: 1 });
  await h.paused(reqStage({ requestId: 'r1', networkId: 'nr' })); // request logged
  await h.paused({ requestId: 'r1b', networkId: 'nr', resourceType: 'XHR',
    request: { url: 'https://localhost:8000/api/echo', method: 'POST', headers: {} },
    responseStatusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }] });
  assert.ok(h.last('Fetch.getResponseBody'), 'getResponseBody called');
  assert.ok(h.last('Fetch.continueResponse'), 'continueResponse called');
  const st = await h.msg({ type: 'rt-state', tabId: 1 });
  const flow = st.flows.find((f) => f.id === 'nr');
  assert.equal(flow.status, 200);
  assert.equal(flow.resBody, '{"server":"ok"}');
});

test('fulfill returns a custom response; fail aborts', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  await h.msg({ type: 'rt-attach', tabId: 1 });
  await h.msg({ type: 'rt-settings', settings: { intercept: true, skipStatic: true, rules: [] } });

  await h.paused(reqStage({ requestId: 'f1', networkId: 'nf1' }));
  await h.msg({ type: 'rt-resolve', tabId: 1, requestId: 'f1', action: 'fulfill',
    response: { code: 201, headers: [{ name: 'X', value: 'y' }], body: 'HI' } });
  const ful = h.last('Fetch.fulfillRequest');
  assert.equal(ful.params.responseCode, 201);
  assert.equal(base64ToUtf8(ful.params.body), 'HI');

  await h.paused(reqStage({ requestId: 'f2', networkId: 'nf2' }));
  await h.msg({ type: 'rt-resolve', tabId: 1, requestId: 'f2', action: 'fail' });
  assert.ok(h.last('Fetch.failRequest'), 'failRequest called');
});

test('replay runs executeScript and returns the page response', async () => {
  const h = setup();
  await import('../background.js');
  await chrome.storage.local.set({ scopeHosts: ['localhost'] });
  const r = await h.msg({ type: 'rt-replay', tabId: 1,
    request: { method: 'GET', url: 'https://localhost:8000/api/x', headers: [], body: null } });
  assert.equal(r.ok, true);
  assert.equal(r.result.body, 'replayed');
});

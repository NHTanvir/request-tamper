// Service worker: scope-gated chrome.debugger + CDP Fetch engine.
//
// INVARIANT: every Fetch.requestPaused MUST be resolved (continue/fulfill/fail)
// or the tab hangs. Off-scope and non-matching requests are resolved instantly;
// only in-scope matching requests are held for the panel.
import { getScope } from './scope.js';
import { inScope, shouldPause } from './match.js';
import { applyEdit } from './edit.js';
import { utf8ToBase64, base64ToUtf8 } from './headers.js';
import { flagFlow } from './flags.js';

const PROTO = '1.3';
const CAP = 300; // flows kept per tab
const SETTINGS_KEY = 'rtSettings'; // { intercept, rules[], skipStatic }

const dbg = (tabId) => ({ tabId });
const send = (tabId, method, params) => chrome.debugger.sendCommand(dbg(tabId), method, params || {});

// ---- small storage.session helpers (survive SW restarts) -------------------
const sget = async (k, d) => (await chrome.storage.session.get(k))[k] ?? d;
const sset = (k, v) => chrome.storage.session.set({ [k]: v });
const flowsKey = (t) => `flows_${t}`;
const pendKey = (t) => `pend_${t}`;
const attKey = 'attachedTabs';

async function getSettings() {
  const { [SETTINGS_KEY]: s = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  return { intercept: false, rules: [], skipStatic: true, ...s };
}

async function isAttached(tabId) {
  return (await sget(attKey, [])).includes(tabId);
}
async function markAttached(tabId, on) {
  const set = new Set(await sget(attKey, []));
  on ? set.add(tabId) : set.delete(tabId);
  await sset(attKey, [...set]);
}

function notify(tabId) {
  chrome.runtime.sendMessage({ type: 'rt-changed', tabId }).catch(() => {});
}

// ---- attach / detach -------------------------------------------------------
async function attach(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const hosts = await getScope();
  if (!tab || !inScope(tab.url || '', hosts)) {
    return { ok: false, error: 'Tab is not on an in-scope host.' };
  }
  try {
    await chrome.debugger.attach(dbg(tabId), PROTO);
    // Pause at both stages; wildcard + per-request host re-check (see handlePaused).
    await send(tabId, 'Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', requestStage: 'Response' }],
    });
    await markAttached(tabId, true);
    await chrome.alarms.create('rt-keepalive', { periodInMinutes: 0.4 });
    notify(tabId);
    return { ok: true };
  } catch (e) {
    await safeDetach(tabId);
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function safeDetach(tabId) {
  try { await chrome.debugger.detach(dbg(tabId)); } catch {}
  await markAttached(tabId, false);
  await chrome.storage.session.remove(pendKey(tabId));
  notify(tabId);
}

// ---- the paused-request handler (the hot path) -----------------------------
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (method !== 'Fetch.requestPaused') return;
  const tabId = source.tabId;
  if (tabId == null) return;
  const requestId = params.requestId;
  const isResponse = params.responseStatusCode != null || params.responseErrorReason != null;
  const hosts = await getScope();

  // Off-scope: never inspect or hold — resolve immediately and move on.
  if (!inScope(params.request.url || '', hosts)) {
    try { await send(tabId, isResponse ? 'Fetch.continueResponse' : 'Fetch.continueRequest', { requestId }); } catch {}
    return;
  }

  try {
    if (isResponse) {
      await handleResponse(tabId, params);
    } else {
      await handleRequest(tabId, params);
    }
  } catch (e) {
    // Last resort: never leave a request hanging.
    try { await send(tabId, isResponse ? 'Fetch.continueResponse' : 'Fetch.continueRequest', { requestId }); } catch {}
    console.warn('[rt] handler error', e);
  }
});

async function handleRequest(tabId, params) {
  const r = params.request;
  const flow = {
    id: params.networkId || params.requestId,
    reqId: params.requestId,
    tabId, time: Date.now(),
    method: r.method, url: r.url, resourceType: params.resourceType,
    reqHeaders: toEntries(r.headers), reqBody: r.postData || '',
    status: null, resHeaders: [], resBody: '', edited: false,
  };
  flow.flags = flagFlow(flow);

  const settings = await getSettings();
  if (shouldPause(flow, settings)) {
    const pend = await sget(pendKey(tabId), {});
    pend[params.requestId] = flow;
    await sset(pendKey(tabId), pend);
    await addFlow(tabId, { ...flow, paused: true });
    notify(tabId);
    return; // held — panel will resolve it
  }
  await addFlow(tabId, flow);
  await send(tabId, 'Fetch.continueRequest', { requestId: params.requestId });
}

async function handleResponse(tabId, params) {
  let body = '', b64 = false;
  const isRedirect = [301, 302, 303, 307, 308].includes(params.responseStatusCode);
  if (!isRedirect) {
    try {
      const got = await send(tabId, 'Fetch.getResponseBody', { requestId: params.requestId });
      body = got.base64Encoded ? safeB64ToUtf8(got.body) : got.body;
      b64 = !!got.base64Encoded;
    } catch {}
  }
  await mergeResponse(tabId, params, body, b64);
  await send(tabId, 'Fetch.continueResponse', { requestId: params.requestId });
}

// ---- flow store ------------------------------------------------------------
async function addFlow(tabId, flow) {
  const list = await sget(flowsKey(tabId), []);
  list.push(flow);
  if (list.length > CAP) list.shift();
  await sset(flowsKey(tabId), list);
}

async function mergeResponse(tabId, params, body, b64) {
  const list = await sget(flowsKey(tabId), []);
  const id = params.networkId;
  // match the newest request flow with this networkId that has no response yet
  for (let i = list.length - 1; i >= 0; i--) {
    if ((list[i].id === id || list[i].reqId === params.requestId) && list[i].status == null) {
      list[i].status = params.responseStatusCode;
      list[i].resHeaders = params.responseHeaders || [];
      list[i].resBody = body; list[i].resBodyB64 = b64;
      await sset(flowsKey(tabId), list);
      notify(tabId);
      return;
    }
  }
}

// ---- resolve a paused request from the panel -------------------------------
async function resolvePaused(tabId, requestId, action, edit, response) {
  const pend = await sget(pendKey(tabId), {});
  const flow = pend[requestId];
  if (!flow) return { ok: false, error: 'Request is no longer paused.' };
  try {
    if (action === 'fail') {
      await send(tabId, 'Fetch.failRequest', { requestId, errorReason: 'Aborted' });
    } else if (action === 'fulfill') {
      await send(tabId, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: response?.code || 200,
        responseHeaders: response?.headers || [],
        body: utf8ToBase64(response?.body || ''),
      });
    } else { // forward (optionally edited)
      const edited = applyEdit(flow, edit || {});
      const changed = edit && Object.keys(edit).length > 0;
      await send(tabId, 'Fetch.continueRequest', {
        requestId,
        url: edited.url, method: edited.method,
        headers: edited.headers,
        ...(changed && 'body' in (edit || {}) ? { postData: utf8ToBase64(edited.body || '') } : {}),
      });
      if (changed) markFlowEdited(tabId, flow.id);
    }
    delete pend[requestId];
    await sset(pendKey(tabId), pend);
    notify(tabId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function markFlowEdited(tabId, id) {
  const list = await sget(flowsKey(tabId), []);
  const f = list.find((x) => x.id === id);
  if (f) { f.edited = true; await sset(flowsKey(tabId), list); }
}

// ---- replay: re-send from the tab's own origin (real cookies/session) ------
async function replay(tabId, request) {
  const hosts = await getScope();
  if (!inScope(request.url || '', hosts)) return { ok: false, error: 'Target not in scope.' };
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', args: [request], func: doReplay,
    });
    return { ok: true, result: res.result };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) + ' (grant host access for this origin?)' };
  }
}

// Runs in the page's MAIN world. Browser blocks forbidden headers automatically.
function doReplay(req) {
  const headers = {};
  for (const h of req.headers || []) headers[h.name] = h.value;
  const init = { method: req.method || 'GET', headers, credentials: 'include' };
  if (!['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase()) && req.body != null) init.body = req.body;
  return fetch(req.url, init)
    .then((r) => r.text().then((t) => ({
      status: r.status,
      headers: [...r.headers].map(([name, value]) => ({ name, value })),
      body: t.slice(0, 20000),
    })))
    .catch((e) => ({ error: String(e) }));
}

// ---- helpers ---------------------------------------------------------------
function toEntries(obj) { return Object.entries(obj || {}).map(([name, value]) => ({ name, value: String(value) })); }
function safeB64ToUtf8(b) { try { return base64ToUtf8(b); } catch { return '[binary]'; } }

// ---- lifecycle wiring ------------------------------------------------------
chrome.debugger.onDetach.addListener((source) => { if (source.tabId != null) safeDetach(source.tabId); });
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([flowsKey(tabId), pendKey(tabId)]);
  markAttached(tabId, false);
});
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'rt-keepalive' && !(await sget(attKey, [])).length) chrome.alarms.clear('rt-keepalive');
});
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'rt-attach': sendResponse(await attach(msg.tabId)); break;
      case 'rt-detach': await safeDetach(msg.tabId); sendResponse({ ok: true }); break;
      case 'rt-state': sendResponse({
        attached: await isAttached(msg.tabId),
        flows: await sget(flowsKey(msg.tabId), []),
        pending: Object.values(await sget(pendKey(msg.tabId), {})),
        settings: await getSettings(),
      }); break;
      case 'rt-settings': await chrome.storage.local.set({ [SETTINGS_KEY]: msg.settings }); sendResponse({ ok: true }); break;
      case 'rt-resolve': sendResponse(await resolvePaused(msg.tabId, msg.requestId, msg.action, msg.edit, msg.response)); break;
      case 'rt-replay': sendResponse(await replay(msg.tabId, msg.request)); break;
      case 'rt-clear': await chrome.storage.session.remove(flowsKey(msg.tabId)); sendResponse({ ok: true }); break;
      default: sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async
});

import { headersToText, textToHeaders } from './headers.js';
import { flowsToMarkdown } from './markdown.js';
import { isDestructive } from './flags.js';

let tabId = null;
const $ = (id) => document.getElementById(id);
const bg = (msg) => chrome.runtime.sendMessage(msg);

async function currentTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function refresh() {
  const tab = await currentTab();
  if (!tab) return;
  tabId = tab.id;
  $('target').textContent = tab.url ? new URL(tab.url).host : '';
  const st = await bg({ type: 'rt-state', tabId });
  $('attach').hidden = st.attached;
  $('detach').hidden = !st.attached;
  $('intercept').checked = st.settings.intercept;
  $('skipStatic').checked = st.settings.skipStatic;
  if (document.activeElement !== $('rules')) {
    $('rules').value = (st.settings.rules || []).map((r) => r.urlIncludes).filter(Boolean).join('\n');
  }
  renderPending(st.pending || []);
  renderFlows(st.flows || []);
}

function renderPending(pending) {
  const box = $('pending');
  box.innerHTML = '';
  if (!pending.length) return;
  const h = document.createElement('div'); h.className = 'sec'; h.textContent = `Paused (${pending.length})`;
  box.appendChild(h);
  for (const f of pending) box.appendChild(editor(f));
}

function editor(f) {
  const el = document.createElement('div');
  el.className = 'panel';
  const warn = isDestructive(f) ? '<span class="tag destructive">destructive</span>' : '';
  el.innerHTML = `
    <div><span class="m">${f.method}</span> ${esc(f.url)} ${warn}</div>
    <div class="sec">Method / URL</div>
    <div class="row"><input type="text" class="em" style="width:70px" value="${esc(f.method)}" />
    <input type="text" class="eu" style="flex:1" value="${esc(f.url)}" /></div>
    <div class="sec">Headers</div>
    <textarea class="eh">${esc(headersToText(f.reqHeaders))}</textarea>
    <div class="sec">Body</div>
    <textarea class="eb">${esc(f.reqBody || '')}</textarea>
    <div class="row">
      <button class="primary fwd">Forward edited</button>
      <button class="ful">Fulfill…</button>
      <button class="danger fail">Fail/Drop</button>
    </div>`;
  el.querySelector('.fwd').onclick = async () => {
    const edit = {
      method: el.querySelector('.em').value, url: el.querySelector('.eu').value,
      headers: textToHeaders(el.querySelector('.eh').value), body: el.querySelector('.eb').value,
    };
    await bg({ type: 'rt-resolve', tabId, requestId: f.reqId, action: 'forward', edit });
    refresh();
  };
  el.querySelector('.fail').onclick = async () => {
    await bg({ type: 'rt-resolve', tabId, requestId: f.reqId, action: 'fail' });
    refresh();
  };
  el.querySelector('.ful').onclick = async () => {
    const body = prompt('Response body to return to the page:', '{"ok":true}');
    if (body == null) return;
    await bg({ type: 'rt-resolve', tabId, requestId: f.reqId, action: 'fulfill',
      response: { code: 200, headers: [{ name: 'Content-Type', value: 'application/json' }], body } });
    refresh();
  };
  return el;
}

function renderFlows(flows) {
  $('count').textContent = `${flows.length}`;
  const box = $('flows');
  box.innerHTML = '';
  for (const f of [...flows].reverse()) {
    const el = document.createElement('div');
    el.className = 'flow' + (f.paused ? ' paused' : '');
    const tags = (f.flags || []).map((t) => `<span class="tag ${t === 'destructive' ? 'destructive' : ''}">${t}</span>`).join('');
    el.innerHTML = `<div><span class="m">${f.method}</span> ${f.status ?? '…'} ·
      ${esc(short(f.url))} ${f.edited ? '✏️' : ''}${tags}</div>`;
    el.onclick = () => el.classList.contains('open') ? close(el) : open(el, f);
    box.appendChild(el);
  }
}

function open(el, f) {
  el.classList.add('open');
  const d = document.createElement('div');
  d.innerHTML = `
    <div class="sec">Request headers</div><pre>${esc(headersToText(f.reqHeaders))}</pre>
    ${f.reqBody ? `<div class="sec">Request body</div><pre>${esc(f.reqBody)}</pre>` : ''}
    <div class="sec">Response ${f.status ?? ''}</div><pre>${esc(headersToText(f.resHeaders))}</pre>
    ${f.resBody ? `<pre>${esc(f.resBody)}</pre>` : ''}
    <div class="row"><button class="rp">Replay</button></div>
    <div class="rpout"></div>`;
  d.querySelector('.rp').onclick = async (e) => {
    e.stopPropagation();
    const res = await bg({ type: 'rt-replay', tabId,
      request: { method: f.method, url: f.url, headers: f.reqHeaders, body: f.reqBody } });
    d.querySelector('.rpout').innerHTML = res.ok
      ? `<pre>${esc(JSON.stringify(res.result, null, 2))}</pre>`
      : `<pre>${esc(res.error)}</pre>`;
  };
  d.onclick = (e) => e.stopPropagation();
  el.appendChild(d);
}
function close(el) { el.classList.remove('open'); if (el.lastChild.tagName === 'DIV') el.lastChild.remove(); }

async function saveSettings() {
  const rules = $('rules').value.split('\n').map((s) => s.trim()).filter(Boolean)
    .map((urlIncludes) => ({ urlIncludes, enabled: true }));
  await bg({ type: 'rt-settings', settings: {
    intercept: $('intercept').checked, skipStatic: $('skipStatic').checked, rules } });
  refresh();
}

// ---- wiring ----
$('attach').onclick = async () => {
  const r = await bg({ type: 'rt-attach', tabId });
  if (!r.ok) alert('Attach failed: ' + r.error);
  refresh();
};
$('detach').onclick = async () => { await bg({ type: 'rt-detach', tabId }); refresh(); };
$('intercept').onchange = saveSettings;
$('skipStatic').onchange = saveSettings;
$('saveRules').onclick = saveSettings;
$('clear').onclick = async () => { await bg({ type: 'rt-clear', tabId }); refresh(); };
$('copy').onclick = async () => {
  const st = await bg({ type: 'rt-state', tabId });
  await navigator.clipboard.writeText(flowsToMarkdown(st.flows || []));
  $('copy').textContent = 'Copied!'; setTimeout(() => ($('copy').textContent = 'Copy MD'), 1200);
};

chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'rt-changed' && m.tabId === tabId) refresh(); });
chrome.tabs.onActivated.addListener(refresh);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
refresh();

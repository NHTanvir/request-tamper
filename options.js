import { getScope, setScope } from './scope.js';

const $ = (id) => document.getElementById(id);

async function load() {
  $('hosts').value = (await getScope()).join('\n');
}

function originsFor(hosts) {
  return hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);
}

$('save').onclick = async () => {
  const hosts = $('hosts').value.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const clean = await setScope(hosts);
  // Replay injects into the page, which needs host access. Ask for it now.
  if (clean.length) {
    try { await chrome.permissions.request({ origins: originsFor(clean) }); } catch {}
  }
  $('status').textContent = `Saved ${clean.length} host(s).`;
  setTimeout(() => ($('status').textContent = ''), 2000);
  load();
};

load();

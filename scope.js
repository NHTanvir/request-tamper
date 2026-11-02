// Shared scope helpers. A host is in scope only if the user added it.
// Empty scope list == the extension does nothing anywhere.
export const SCOPE_KEY = 'scopeHosts';

export async function getScope() {
  const { [SCOPE_KEY]: hosts = [] } = await chrome.storage.local.get(SCOPE_KEY);
  return hosts;
}

export async function setScope(hosts) {
  const clean = [...new Set(hosts.map((h) => h.trim().toLowerCase()).filter(Boolean))];
  await chrome.storage.local.set({ [SCOPE_KEY]: clean });
  return clean;
}

export function hostInScope(host, hosts) {
  if (!host) return false;
  return hosts.some((h) => host === h || host.endsWith('.' + h));
}

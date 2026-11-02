// PURE header + base64 helpers. No chrome.* — unit-tested in Node.

// CDP HeaderEntry[] (`{name, value}`) <-> editable text ("Name: value" lines).
export function headersToText(headers = []) {
  return headers.map((h) => `${h.name}: ${h.value}`).join('\n');
}

export function textToHeaders(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    if (i === -1) continue;
    out.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
  }
  return out;
}

// CDP `binary` params (postData, body) travel as base64 over chrome.debugger.
// Node 20 and the service worker both expose btoa/atob + TextEncoder/TextDecoder.
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(String(b64));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

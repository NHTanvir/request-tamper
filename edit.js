// PURE request-edit transform. Node-tested. No chrome.*, no base64 here.
// request/edit headers are CDP HeaderEntry[] (`{name, value}`).

function cloneHeaders(headers) {
  return (headers || []).map((h) => ({ name: h.name, value: h.value }));
}

// Case-insensitive set: replace the first header with this name, else append.
function setHeader(headers, name, value) {
  const i = headers.findIndex((h) => h.name.toLowerCase() === name.toLowerCase());
  if (i === -1) headers.push({ name, value });
  else headers[i] = { name, value };
}

// Apply an edit to a request record, returning a NEW record (inputs untouched).
// edit fields (all optional):
//   url, method            -> replace
//   headers                -> full replacement of the header set
//   setHeaders[{name,value}] -> upsert each
//   removeHeaders[name]    -> delete each (case-insensitive)
//   body (+ bodyB64)       -> replace body ('body' key present = replace, even with '')
export function applyEdit(request, edit = {}) {
  const out = {
    url: edit.url != null ? edit.url : request.url,
    method: edit.method != null ? edit.method : request.method,
    headers: Array.isArray(edit.headers) ? cloneHeaders(edit.headers) : cloneHeaders(request.headers),
    body: request.body,
    bodyB64: !!request.bodyB64,
  };
  if (Array.isArray(edit.removeHeaders)) {
    const rm = new Set(edit.removeHeaders.map((n) => String(n).toLowerCase()));
    out.headers = out.headers.filter((h) => !rm.has(h.name.toLowerCase()));
  }
  if (Array.isArray(edit.setHeaders)) {
    for (const h of edit.setHeaders) setHeader(out.headers, h.name, h.value);
  }
  if ('body' in edit) {
    out.body = edit.body;
    out.bodyB64 = !!edit.bodyB64;
  }
  return out;
}

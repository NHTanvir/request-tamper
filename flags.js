// PURE flow flagging — surface interesting requests first. Node-tested.

const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/;
const SECRET = /\b(access_token|id_token|refresh_token|api[_-]?key|client_secret|secret|session)\b/i;
const ADMIN = /\/(admin|administrator|internal|superuser|sudo|debug|private|staff|backoffice)(\/|\?|#|$)/i;
const ID_PARAM = /[?&/](id|user_?id|account_?id|org_?id|tenant_?id|uid|customer_?id)[=/]/i;
const DESTRUCTIVE = /\b(delete|remove|destroy|refund|revoke|disable|deactivate|drop)\b/i;

function headerMap(flow) {
  const h = flow.reqHeaders || flow.headers || [];
  const m = {};
  for (const x of h) m[String(x.name).toLowerCase()] = x.value;
  return m;
}

// Returns an array of tag strings (may be empty).
export function flagFlow(flow = {}) {
  const tags = [];
  const h = headerMap(flow);
  if (h['authorization']) tags.push('auth-header');
  if (h['cookie']) tags.push('cookie');

  const hay = `${flow.url || ''} ${flow.reqBody || ''}`;
  if (JWT.test(hay) || JWT.test(JSON.stringify(h))) tags.push('jwt');
  if (SECRET.test(hay)) tags.push('token');
  if (ADMIN.test(flow.url || '')) tags.push('admin-path');
  if (ID_PARAM.test(flow.url || '')) tags.push('id-param');

  const method = (flow.method || '').toUpperCase();
  if (method === 'DELETE' || method === 'PUT' || method === 'PATCH' ||
      DESTRUCTIVE.test(flow.url || '')) tags.push('destructive');

  return tags;
}

export function isDestructive(flow = {}) {
  return flagFlow(flow).includes('destructive');
}

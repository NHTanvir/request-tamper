// PURE Markdown export for notes/reports. Node-tested.

function headerLines(headers = [], pick) {
  const list = pick
    ? headers.filter((h) => pick.includes(h.name.toLowerCase()))
    : headers;
  return list.map((h) => `${h.name}: ${h.value}`).join('\n');
}

function clip(s, n = 2000) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s;
}

export function flowToMarkdown(flow = {}) {
  const lines = [];
  lines.push(`### ${flow.method || 'GET'} ${flow.url || ''}`);
  if (flow.status != null) lines.push(`Status: ${flow.status}`);
  if (flow.flags && flow.flags.length) lines.push(`Flags: ${flow.flags.join(', ')}`);
  if (flow.edited) lines.push(`_Edited before sending._`);

  const req = headerLines(flow.reqHeaders || []);
  if (req) lines.push('\n**Request headers**\n```\n' + req + '\n```');
  if (flow.reqBody) lines.push('\n**Request body**\n```\n' + clip(flow.reqBody) + '\n```');

  const res = headerLines(flow.resHeaders || []);
  if (res) lines.push('\n**Response headers**\n```\n' + res + '\n```');
  if (flow.resBody) lines.push('\n**Response body**\n```\n' + clip(flow.resBody) + '\n```');

  return lines.join('\n');
}

export function flowsToMarkdown(flows = [], title = 'Request Tamper — findings') {
  const header = `# ${title}\n\n${flows.length} flow(s).\n`;
  if (!flows.length) return header + '\n_No flows captured._';
  return header + '\n' + flows.map(flowToMarkdown).join('\n\n---\n\n');
}

// Tiny no-deps echo server for manual testing. Run: node testpages/server.mjs
// Serves index.html and echoes any /api/* request as JSON so you can SEE a
// tampered method / header / body, a fulfilled response, or a replay.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8000;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'rt_demo=1; Path=/' });
    res.end(JSON.stringify({
      youSent: { method: req.method, path: url.pathname + url.search, headers: req.headers, body },
    }, null, 2));
    return;
  }
  try {
    const html = await readFile(new URL('index.html', `file://${dir}`));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`echo server on http://localhost:${PORT}`));

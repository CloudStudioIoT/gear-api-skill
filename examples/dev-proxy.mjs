// Local server for the browser examples: serves this folder and forwards /api/ and /services/ to Gear.
//
//   GEAR_URL=https://gear.example.com node dev-proxy.mjs      # then open http://localhost:8080/live-dashboard.html
//
// Why it exists: Gear answers the browser's CORS preflight (OPTIONS) with 405 and does not allow the
// Authorization header cross-origin, so a page on another origin cannot call the Service API (POST JSON)
// at all. The Gear web app works because it is served from the same origin. In production, serve your
// frontend behind the same kind of reverse proxy, or call Gear from your backend.
// Node 18+, no dependencies. For local development only.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEAR = (process.env.GEAR_URL || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8080);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css' };

if (!GEAR) {
  console.error('Set GEAR_URL, e.g. GEAR_URL=https://gear.example.com node dev-proxy.mjs');
  process.exit(1);
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/') || req.url.startsWith('/services/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
      if (req.headers.authorization) headers.Authorization = req.headers.authorization;
      const r = await fetch(GEAR + req.url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (path.includes('..')) { res.writeHead(400).end(); return; }
    const file = join(ROOT, path || 'live-dashboard.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 502, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'ENOENT' ? 'Not found' : `Proxy error: ${e.message}`);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Gear examples on http://localhost:${PORT}/live-dashboard.html -> ${GEAR}`);
});

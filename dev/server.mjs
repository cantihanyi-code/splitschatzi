// Lokaler Dev-Server: `npm run dev` -> http://localhost:5050
// Liefert public/ aus und ersetzt Firebase durch eine kleine In-Memory-Datenbank (dev/.devdb.json),
// damit man ohne Firebase-Projekt testen kann. Zwei "Handys" simulieren: http://localhost:5050 und
// http://127.0.0.1:5050 parallel öffnen (verschiedene Origins = getrennter lokaler Speicher).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../public');
const dbFile = path.join(here, '.devdb.json');
const PORT = Number(process.env.PORT) || 5050;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let data = null;
try { data = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
const clients = new Set();
const segs = p => String(p || '').split('/').filter(Boolean);
function clean(v) {
  if (v == null || typeof v !== 'object') return v == null ? null : v;
  const o = {};
  for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c != null) o[k] = c; }
  return Object.keys(o).length ? o : null;
}
function setAt(p, v) {
  const s = segs(p);
  if (!s.length) { data = clean(v); return; }
  if (data == null || typeof data !== 'object') data = {};
  let n = data; const parents = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (n[s[i]] == null || typeof n[s[i]] !== 'object') n[s[i]] = {};
    parents.push([n, s[i]]); n = n[s[i]];
  }
  const c = clean(v), last = s[s.length - 1];
  if (c == null) delete n[last]; else n[last] = c;
  for (let i = parents.length - 1; i >= 0; i--) { const [par, k] = parents[i]; if (!Object.keys(par[k]).length) delete par[k]; }
  if (data && !Object.keys(data).length) data = null;
}
let saveTimer;
function broadcast() {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(dbFile, JSON.stringify(data, null, 2) || 'null', () => {}), 200);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/__dev/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/__dev/write' && req.method === 'POST') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const { op, path: at, value } = JSON.parse(body);
        if (op === 'set') setAt(at, value);
        else if (op === 'update') for (const k in value) setAt(at + '/' + k, value[k]);
        broadcast();
        res.writeHead(204).end();
      } catch (e) { res.writeHead(400).end(String(e)); }
    });
    return;
  }
  if (p.startsWith('/__/firebase/')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(p.endsWith('firebase-app-compat.js') ? fs.readFileSync(path.join(here, 'firebase-shim.js')) : '');
  }

  let file = path.join(root, p);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type + (/text|javascript|json|svg|manifest/.test(type) ? '; charset=utf-8' : ''), 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log(`SplitSchatzi dev server: http://localhost:${PORT}  (2. Gerät: http://127.0.0.1:${PORT})`));

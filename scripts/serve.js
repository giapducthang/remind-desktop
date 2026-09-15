// serve.js - ultra light static server for browser mode (npm run web).
// Serves the src folder at http://localhost:4173, no caching, no external dependency.
// Not for production - only for dev/QA of the frontend without Tauri.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(body);
}

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (_) { return null; }
  if (p === '/' || p === '') p = '/index.html';
  const abs = path.normalize(path.join(ROOT, p));
  // Block path traversal: the file must stay inside ROOT.
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed');
  }
  const abs = resolveFile(req.url || '/');
  if (!abs) return send(res, 403, 'Forbidden');

  fs.stat(abs, (err, st) => {
    let file = abs;
    if (!err && st.isDirectory()) file = path.join(abs, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) return send(res, 404, 'Not Found: ' + req.url);
      const ext = path.extname(file).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': data.length });
        return res.end();
      }
      send(res, 200, data, type);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log('[reminder-desktop] web mode: http://' + HOST + ':' + PORT + '  (root: ' + ROOT + ')');
  console.log('Ctrl+C to stop.');
});

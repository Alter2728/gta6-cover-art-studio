// A tiny static file server for app/ (Node 22, standard library only), so
// the entry can be tried locally with no build step:
//
//   node serve.ts [--port 8080]
//
// serves app/ on http://localhost:8080. It only answers files inside app/,
// with the MIME types an offline web app needs. A development convenience,
// not a server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(fileURLToPath(new URL('./app', import.meta.url)));

function pickPort() {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf('--port');
  const raw = flagAt === -1 ? 8080 : Number(args[flagAt + 1]);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : 8080;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function insideApp(pathname) {
  const target = resolve(join(appDir, normalize(pathname)));
  if (target === appDir) return target;
  return target.startsWith(appDir + sep) ? target : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = insideApp(pathname);
  if (!file) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let bytes;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    bytes = info.size;
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  const headers = {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': bytes,
    'cache-control': 'no-store',
  };
  if (req.method === 'HEAD') {
    res.writeHead(200, headers).end();
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
});

const port = pickPort();
server.listen(port, '127.0.0.1', () => {
  console.log(`app/ is on http://localhost:${port}`);
});

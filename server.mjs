// Local web server. Run `npm start`, open http://localhost:4173.
//
// The browser gets the full dataset once and filters client-side, so changing a
// filter is instant and costs dhamma.org nothing.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collect } from './src/aggregate.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Offline mode: serve a canned dataset instead of fetching. See
// scripts/sample-data.mjs. Handy for working on the interface with no network.
const DATA_FILE = process.env.DATA_FILE ?? null;

/** In-flight de-duplication: parallel page loads share one collection pass. */
let pending = null;
let lastResult = null;

async function getData({ forceRefresh }) {
  if (DATA_FILE) {
    lastResult = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    return lastResult;
  }
  if (pending) return pending;
  pending = collect({ forceRefresh })
    .then((data) => {
      lastResult = data;
      return data;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);
  // Refuse anything that escapes the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/data') {
    const forceRefresh = url.searchParams.get('refresh') === '1';
    try {
      const data = await getData({ forceRefresh });
      sendJson(response, 200, data);
    } catch (error) {
      // If a refresh blows up but we served successfully before, keep serving.
      if (lastResult) sendJson(response, 200, { ...lastResult, warning: String(error?.message ?? error) });
      else sendJson(response, 500, { error: String(error?.message ?? error) });
    }
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, lastCollectedAt: lastResult?.generatedAt ?? null });
    return;
  }

  await serveStatic(request, response, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  Vipassana course finder → http://localhost:${PORT}\n`);
  console.log('  First load fetches dhamma.org and takes ~30-60s; after that it is cached for 6 hours.');
  console.log('  Force a refresh with the button in the UI, or `npm run refresh`.\n');
});

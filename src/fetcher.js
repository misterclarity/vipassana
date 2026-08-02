// Polite, cached HTTP fetching.
//
// This app reads a volunteer-run site, so it fetches gently: a small concurrency
// cap, a pause between requests, and a long-lived disk cache so repeated UI loads
// cost dhamma.org nothing.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 350;
const USER_AGENT =
  'vipassana-course-finder/1.0 (personal course search; https://github.com/misterclarity/vipassana)';

const cacheKey = (url) => createHash('sha256').update(url).digest('hex').slice(0, 32);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCache(cacheDir, url) {
  try {
    const raw = await readFile(path.join(cacheDir, `${cacheKey(url)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(cacheDir, url, entry) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${cacheKey(url)}.json`), JSON.stringify(entry), 'utf8');
}

/**
 * Fetch a URL, using the disk cache when it is still fresh.
 *
 * Never throws: network problems come back as `{ ok: false, error }` so one
 * unreachable centre cannot blank out the whole listing.
 */
export async function fetchPage(url, options = {}) {
  const { cacheDir = '.cache', ttlMs = DEFAULT_TTL_MS, forceRefresh = false } = options;

  if (!forceRefresh) {
    const cached = await readCache(cacheDir, url);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return { ...cached, fromCache: true };
    }
  }

  const entry = { url, fetchedAt: Date.now(), ok: false, status: 0, html: '', error: null };

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    });
    entry.status = response.status;
    entry.finalUrl = response.url || url;
    if (response.ok) {
      entry.html = await response.text();
      entry.ok = true;
    } else {
      entry.error = `HTTP ${response.status}`;
      // Read and discard the body so the socket can be reused.
      await response.text().catch(() => {});
    }
  } catch (error) {
    entry.error = error?.name === 'TimeoutError' ? 'Request timed out' : String(error?.message ?? error);
  }

  // Cache failures too, but briefly — see `isStaleFailure` below.
  await writeCache(cacheDir, url, entry).catch(() => {});
  return { ...entry, fromCache: false };
}

/** Failed responses expire fast so a transient outage is not sticky. */
export function failureTtl(ttlMs) {
  return Math.min(ttlMs, 15 * 60 * 1000);
}

/**
 * Fetch many URLs with bounded concurrency, preserving input order.
 *
 * @param {string[]} urls
 */
export async function fetchAll(urls, options = {}) {
  const results = new Array(urls.length);
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];
      const cached = options.forceRefresh ? null : await readCache(options.cacheDir ?? '.cache', url);
      const ttl = cached && !cached.ok ? failureTtl(options.ttlMs ?? DEFAULT_TTL_MS) : options.ttlMs;
      results[index] = await fetchPage(url, { ...options, ttlMs: ttl ?? DEFAULT_TTL_MS });
      if (!results[index].fromCache) await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, urls.length) }, worker));
  return results;
}

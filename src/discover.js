// Finds the page where a centre describes its accommodation.
//
// The obvious approach — guess `/accommodation/`, `/facilities/` and friends —
// does not work here, for two reasons discovered by running against the live
// site:
//
//  1. These are TYPO3 sites that answer **200 for every URL**, serving the
//     homepage for anything unrecognised. A guessed path never 404s, it just
//     silently returns the wrong page, so "the fetch succeeded" says nothing.
//     `detectSoftNotFound` fingerprints that filler page once per host so the
//     rest of the crawl can discard it.
//  2. There is no shared layout to guess at. Accommodation lives at
//     `/centres/the-site/` in the UK, `/the-centre-in-belgium/` in Belgium, and
//     on the homepage itself for Dhamma Padhāna.
//
// So instead of guessing, this follows each centre's own navigation from a known
// entry page and scores the links by what they say.

import { extractLinks } from './html.js';

/** Words that suggest a page describes where students sleep. */
const STRONG_HINTS =
  /accommodat|unterkunft|zimmer|room|kamer|h(e|é)bergement|alojamiento|alloggi|logement|nocleg|pokoj|zakwaterowan|размещ|прожив|boende|logi|facilit|the[-\s]site|struttur|instalac|anlage|gel(a|ä)nde|premises|what[-\s]to[-\s]expect/i;

/** Weaker "this is the centre's own section" signal. */
const WEAK_HINTS =
  /centre|center|centro|centrum|zentrum|o(s|ś)rodek|le[-\s]centre|il[-\s]centro|het[-\s]centrum|about|our/i;

// Pages reproduced verbatim on every dhamma.org site. Their text is about the
// tradition, not about this centre, so treating them as evidence would give
// every centre the same verdict — including false positives like the Code of
// Discipline's "Retire to your own room".
const BOILERPLATE =
  /\/(reference|code-of-discipline|what-is-vipassana|sn-goenka|art-of-living|questions-answers|faqs?)\b/i;

// Photo galleries string every image caption into one run-on line, which yields
// unreadable "quotes" that assert nothing about student rooms.
const GALLERY = /\/(photo|gallery|galerie|galeria|impressionen|foto|bilder|images)/i;

const SKIP =
  /\/(os|cdn-cgi|fileadmin|privacy|legal|cookies|sitemap|news|donate|anbi|contact|typo3)\b|\.(pdf|jpe?g|png|gif|svg|zip|mp4|docx?)$/i;

// A path segment that names some centre: "dhamma-sampatti-standort",
// "meditationszentrum-vogtland", "suffolk-centre".
const CENTRE_SEGMENT =
  /^(dhamma[-_]|meditationszentrum[-_]|vipassana[-_]?(zentrum|centre|center|centrum)[-_])|[-_](centre|center|zentrum|centrum|centro)s?$/i;

/**
 * True when a path belongs to a *different* centre than the one being read.
 *
 * Country sites host several centres side by side — de.dhamma.org carries both
 * Vogtland and Schwarzwald, uk.dhamma.org both Herefordshire and Suffolk. Left
 * unchecked the crawl drifts into a neighbour's pages and quotes its rooms as
 * this centre's, which is worse than finding nothing at all.
 *
 * Any centre-naming segment in the entry paths is this centre's own; a
 * centre-naming segment that appears nowhere in them belongs to someone else.
 */
export function isForeignCentreSection(pathname, entryPaths) {
  // A centre entered at the site root has the host to itself, so every section
  // on it — including its own `/en/dhamma-pallava-center/` — is fair game.
  if (entryPaths.length === 0 || entryPaths.some((entryPath) => entryPath === '/' || entryPath === '')) return false;

  const own = new Set();
  for (const entryPath of entryPaths) {
    for (const segment of entryPath.split('/')) {
      if (segment) own.add(segment.toLowerCase());
    }
  }

  return pathname
    .split('/')
    .filter(Boolean)
    .some((segment) => CENTRE_SEGMENT.test(segment) && !own.has(segment.toLowerCase()));
}

/** Pages fetched per centre while hunting for accommodation text. */
export const MAX_DISCOVERY_FETCHES = 12;

/**
 * Fingerprint a host's soft-404 filler page.
 *
 * Returns the body length served for a URL that cannot exist, or `null` when the
 * host answers properly with an error status.
 */
export async function detectSoftNotFound(origin, fetchPage, options) {
  const probeUrl = new URL('/vcf-nonexistent-probe-page/', origin).toString();
  const page = await fetchPage(probeUrl, options);
  return page.ok && page.html ? page.html.length : null;
}

/** True when a fetched page is really the host's catch-all filler. */
export function isSoftNotFound(page, softNotFoundLength) {
  return softNotFoundLength !== null && page.html.length === softNotFoundLength;
}

/**
 * Rank the on-site links of a page by how likely they are to describe rooms.
 *
 * @param {string} html
 * @param {string} pageUrl  the URL the html came from, for resolving hrefs
 * @param {string} host     only links on this host are followed
 */
export function rankLinks(html, pageUrl, host, entryPaths = []) {
  const ranked = new Map();

  for (const link of extractLinks(html, pageUrl)) {
    if (!link.href) continue;
    let url;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.hostname !== host) continue;

    url.hash = '';
    url.search = '';
    const path = url.pathname;
    if (SKIP.test(path) || BOILERPLATE.test(path) || GALLERY.test(path)) continue;
    if (isForeignCentreSection(path, entryPaths)) continue;

    // Unpromising links still score 1 rather than being dropped. Small centre
    // sites (Dhamma Neru) name nothing helpfully, and stopping at the entry page
    // would report "no evidence" after reading a single page — indistinguishable
    // from a centre that genuinely says nothing. Ranking keeps them last, and the
    // fetch budget keeps the crawl small.
    const haystack = `${path} ${link.text}`;
    const score = 1 + (STRONG_HINTS.test(haystack) ? 10 : 0) + (WEAK_HINTS.test(haystack) ? 2 : 0);

    const existing = ranked.get(path);
    if (!existing || existing.score < score) ranked.set(path, { url: url.toString(), score, text: link.text });
  }

  return [...ranked.values()].sort((a, b) => b.score - a.score);
}

/**
 * Walk a centre's site from its entry pages, returning the pages worth scanning
 * for accommodation evidence.
 *
 * Breadth-first and deliberately small: entry pages first, then their
 * best-scoring links. Stops as soon as `scan` reports usable evidence, so a
 * centre that states its room type on the homepage costs a single request.
 *
 * @param {{entryUrls: string[]}} center
 * @param {(url: string, options: object) => Promise<{ok: boolean, html: string, finalUrl?: string, status: number, error: ?string}>} fetchPage
 * @param {(html: string, url: string) => boolean} hasEvidence
 */
export async function discoverAccommodationPages(center, fetchPage, hasEvidence, options = {}) {
  const budget = options.maxFetches ?? MAX_DISCOVERY_FETCHES;
  const pages = [];
  const attempts = [];
  const visited = new Set();
  const softNotFoundByHost = new Map();

  const entryPaths = center.entryUrls.map((url) => {
    try {
      return new URL(url).pathname;
    } catch {
      return '/';
    }
  });

  let frontier = center.entryUrls.map((url) => ({ url, score: 100 }));
  let depth = 0;

  while (frontier.length > 0 && attempts.length < budget && depth < 3) {
    const next = [];

    for (const candidate of frontier) {
      if (attempts.length >= budget) break;

      let parsed;
      try {
        parsed = new URL(candidate.url);
      } catch {
        continue;
      }
      const key = `${parsed.hostname}${parsed.pathname}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const page = await fetchPage(candidate.url, options);

      const origin = parsed.origin;
      if (!softNotFoundByHost.has(origin)) {
        softNotFoundByHost.set(origin, await detectSoftNotFound(origin, fetchPage, options));
      }
      const softLength = softNotFoundByHost.get(origin);

      if (!page.ok) {
        attempts.push({ url: candidate.url, ok: false, status: page.status, error: page.error });
        continue;
      }
      if (isSoftNotFound(page, softLength)) {
        // A 200 that is really "page not found" — record it as such rather than
        // letting it look like a page that simply had nothing to say.
        attempts.push({ url: candidate.url, ok: false, status: page.status, error: 'Page not found (site returned its filler page)' });
        continue;
      }

      const finalUrl = page.finalUrl ?? candidate.url;
      attempts.push({ url: candidate.url, ok: true, status: page.status, error: null });
      pages.push({ url: finalUrl, html: page.html });

      if (hasEvidence(page.html, finalUrl)) return { pages, attempts };

      next.push(...rankLinks(page.html, finalUrl, parsed.hostname, entryPaths));
    }

    frontier = next
      .filter((link) => !visited.has(`${new URL(link.url).hostname}${new URL(link.url).pathname}`))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    depth += 1;
  }

  return { pages, attempts };
}

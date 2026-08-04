import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankLinks,
  isSoftNotFound,
  isForeignCentreSection,
  discoverAccommodationPages,
} from '../src/discover.js';

const page = (body) => `<html><body>${body}</body></html>`;

/** Serve a fixed map of url -> html, recording what was requested. */
function fakeSite(pages, { softNotFoundBody = null } = {}) {
  const requested = [];
  const fetchPage = async (url) => {
    requested.push(url);
    const html = pages[url];
    if (html !== undefined) return { ok: true, status: 200, html, finalUrl: url, error: null };
    if (softNotFoundBody !== null) {
      // The behaviour that broke the original design: 200 for everything.
      return { ok: true, status: 200, html: softNotFoundBody, finalUrl: url, error: null };
    }
    return { ok: false, status: 404, html: '', error: 'HTTP 404' };
  };
  return { fetchPage, requested };
}

const findsRooms = (html) => /single room|dormitor/i.test(html);

test('ranks accommodation links above general ones, and ignores other hosts', () => {
  const html = page(`
    <a href="/the-site/">The Site</a>
    <a href="/about-us/">About us</a>
    <a href="/news/">News</a>
    <a href="https://example.com/rooms/">Rooms elsewhere</a>
  `);
  const ranked = rankLinks(html, 'https://centre.dhamma.org/', 'centre.dhamma.org');
  const paths = ranked.map((link) => new URL(link.url).pathname);

  assert.equal(paths[0], '/the-site/');
  assert.ok(paths.includes('/about-us/'));
  assert.ok(!paths.includes('/news/'), 'news is not where rooms are described');
  assert.ok(!ranked.some((link) => link.url.includes('example.com')), 'stays on the centre site');
});

test('skips the boilerplate every dhamma.org site repeats', () => {
  // The Code of Discipline says "Retire to your own room", which would otherwise
  // hand every centre in the world an identical "single rooms" verdict.
  const html = page(`
    <a href="/reference/code-of-discipline/">Code of Discipline</a>
    <a href="/about-vipassana/faqs/">FAQ</a>
    <a href="/accommodation/">Accommodation</a>
  `);
  const paths = rankLinks(html, 'https://centre.dhamma.org/', 'centre.dhamma.org').map(
    (link) => new URL(link.url).pathname
  );

  assert.deepEqual(paths, ['/accommodation/']);
});

test('skips photo galleries, whose captions run together into unquotable text', () => {
  const html = page('<a href="/impressionen-aus-dhamma-dvara/">Impressionen</a><a href="/the-site/">The site</a>');
  const paths = rankLinks(html, 'https://centre.dhamma.org/', 'centre.dhamma.org').map(
    (link) => new URL(link.url).pathname
  );

  assert.deepEqual(paths, ['/the-site/']);
});

test('a neighbouring centre on the same country site is not mistaken for this one', () => {
  // de.dhamma.org carries Vogtland and Schwarzwald; uk.dhamma.org carries
  // Herefordshire and Suffolk. Quoting a neighbour's rooms is worse than
  // reporting nothing, because it reads as though the centre said it.
  const vogtland = ['/de/meditationszentrum-vogtland/'];
  assert.equal(isForeignCentreSection('/de/meditationszentrum-vogtland/anfahrt/', vogtland), false);
  assert.equal(isForeignCentreSection('/de/meditationszentrum-schwarzwald/', vogtland), true);
  assert.equal(isForeignCentreSection('/de/meditationszentrum-schwarzwald/dhamma-sampatti-standort/', vogtland), true);

  const herefordshire = ['/herefordshire-centre/'];
  assert.equal(isForeignCentreSection('/suffolk-centre/the-site/', herefordshire), true);
  // Shared pages that name no centre stay reachable — Dhamma Dīpa describes its
  // rooms at /centres/the-site/, outside its own section.
  assert.equal(isForeignCentreSection('/centres/the-site/', herefordshire), false);

  const mahi = ['/dhamma-mahi-permanent-center/'];
  assert.equal(isForeignCentreSection('/dhamma-suriyarama/', mahi), true);
  assert.equal(isForeignCentreSection('/dhamma-mahi-permanent-center/rooms/', mahi), false);

  // A centre with a site to itself owns every section on it: Dhamma Pallava
  // describes its rooms at /en/dhamma-pallava-center/, which must stay reachable.
  assert.equal(isForeignCentreSection('/en/dhamma-pallava-center/', ['/']), false);
  assert.equal(isForeignCentreSection('/de/dhamma-pallava-meditationszentrum/', ['/']), false);
});

test('links into another centre section are never followed', async () => {
  const site = fakeSite({
    'https://de.dhamma.org/de/meditationszentrum-vogtland/': page(
      '<a href="/de/meditationszentrum-schwarzwald/">Schwarzwald</a>'
    ),
    'https://de.dhamma.org/de/meditationszentrum-schwarzwald/': page('<p>Single rooms for everyone.</p>'),
  });

  const { pages } = await discoverAccommodationPages(
    { entryUrls: ['https://de.dhamma.org/de/meditationszentrum-vogtland/'] },
    site.fetchPage,
    findsRooms
  );

  assert.ok(
    !pages.some((p) => p.url.includes('schwarzwald')),
    'the other centre must not supply this centre with evidence'
  );
});

test('a soft 404 is recognised by its body, not its status', () => {
  const filler = page('Welcome to the centre');
  assert.equal(isSoftNotFound({ html: filler }, filler.length), true);
  assert.equal(isSoftNotFound({ html: page('Something else entirely') }, filler.length), false);
  // A host that answers honestly has no fingerprint to compare against.
  assert.equal(isSoftNotFound({ html: filler }, null), false);
});

test('follows navigation to the page that describes the rooms', async () => {
  const site = fakeSite({
    'https://centre.dhamma.org/': page('<a href="/the-site/">The Site</a><a href="/news/">News</a>'),
    'https://centre.dhamma.org/the-site/': page('<p>Students sleep in single rooms with a shower.</p>'),
  });

  const { pages, attempts } = await discoverAccommodationPages(
    { entryUrls: ['https://centre.dhamma.org/'] },
    site.fetchPage,
    findsRooms
  );

  assert.equal(pages.at(-1).url, 'https://centre.dhamma.org/the-site/');
  assert.ok(attempts.every((attempt) => attempt.ok || attempt.error));
  assert.ok(!site.requested.includes('https://centre.dhamma.org/news/'));
});

test('stops at the entry page when the centre states its rooms there', async () => {
  const site = fakeSite({
    'https://centre.dhamma.org/': page('<p>Each student has single room accommodation.</p><a href="/the-site/">The Site</a>'),
    'https://centre.dhamma.org/the-site/': page('<p>Also single rooms.</p>'),
  });

  const { pages } = await discoverAccommodationPages(
    { entryUrls: ['https://centre.dhamma.org/'] },
    site.fetchPage,
    findsRooms
  );

  assert.equal(pages.length, 1, 'no reason to keep crawling once the answer is found');
  assert.ok(!site.requested.includes('https://centre.dhamma.org/the-site/'));
});

test('a site that answers 200 for everything yields no false evidence', async () => {
  const filler = page('<p>Welcome. Courses are run on a donation basis.</p>');
  const site = fakeSite({ 'https://centre.dhamma.org/': filler }, { softNotFoundBody: filler });

  const { pages, attempts } = await discoverAccommodationPages(
    { entryUrls: ['https://centre.dhamma.org/', 'https://centre.dhamma.org/accommodation/'] },
    site.fetchPage,
    findsRooms
  );

  // The homepage is real content; the guessed path is the same bytes, so it is
  // reported as missing rather than counted as a page that said nothing.
  const guessed = attempts.find((attempt) => attempt.url.endsWith('/accommodation/'));
  assert.equal(guessed.ok, false);
  assert.match(guessed.error, /not found/i);
  assert.ok(!pages.some((p) => p.url.endsWith('/accommodation/')));
});

test('an unreachable entry page is reported, not thrown', async () => {
  const site = fakeSite({});
  const { pages, attempts } = await discoverAccommodationPages(
    { entryUrls: ['https://centre.dhamma.org/'] },
    site.fetchPage,
    findsRooms
  );

  assert.equal(pages.length, 0);
  assert.equal(attempts[0].ok, false);
  assert.equal(attempts[0].status, 404);
});

test('the crawl is bounded even on a site that links in circles', async () => {
  const pages = {};
  for (let i = 0; i < 40; i++) {
    pages[`https://centre.dhamma.org/room-${i}/`] = page(
      `<a href="/room-${i + 1}/">More rooms</a><a href="/room-0/">Back</a>`
    );
  }
  const site = fakeSite(pages);

  const { attempts } = await discoverAccommodationPages(
    { entryUrls: ['https://centre.dhamma.org/room-0/'] },
    site.fetchPage,
    findsRooms,
    { maxFetches: 8 }
  );

  assert.ok(attempts.length <= 8, `stayed within budget, made ${attempts.length}`);
});

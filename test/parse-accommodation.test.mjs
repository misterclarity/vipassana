import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessAccommodation, scanAccommodationPage, VERDICTS } from '../src/parse-accommodation.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function page(name, url) {
  return { url, html: await readFile(path.join(FIXTURES, name), 'utf8') };
}

test('a centre describing only single rooms is reported as single', async () => {
  const assessment = assessAccommodation([await page('accommodation-single.html', 'https://dipa.dhamma.org/accommodations/')]);
  assert.equal(assessment.verdict, VERDICTS.SINGLE);
  assert.equal(assessment.singleRoomsAvailable, true);
  assert.equal(assessment.guaranteed, true);
  assert.match(assessment.evidence[0].quote, /single rooms/i);
});

test('shared bathrooms do not count as shared rooms', async () => {
  const scan = scanAccommodationPage(
    (await page('accommodation-single.html', 'https://dipa.dhamma.org/accommodations/')).html,
    'https://dipa.dhamma.org/accommodations/'
  );
  assert.ok(scan.evidence.every((item) => item.indicates !== 'shared'));
});

test('room-sharing advice about nearby hotels is ignored', async () => {
  const scan = scanAccommodationPage(
    (await page('accommodation-single.html', 'https://dipa.dhamma.org/accommodations/')).html,
    'https://dipa.dhamma.org/accommodations/'
  );
  assert.ok(scan.evidence.every((item) => !/hotel/i.test(item.quote)));
});

test('single plus double rooms is reported as mixed, not single', async () => {
  const assessment = assessAccommodation([await page('accommodation-mixed.html', 'https://atala.dhamma.org/what-to-expect/')]);
  assert.equal(assessment.verdict, VERDICTS.MIXED);
  assert.equal(assessment.singleRoomsAvailable, true);
  assert.equal(assessment.guaranteed, false);
});

test('a centre that says it cannot guarantee a single room surfaces that caveat', async () => {
  const assessment = assessAccommodation([await page('accommodation-mixed.html', 'https://atala.dhamma.org/what-to-expect/')]);
  assert.ok(assessment.caveats.length > 0);
  assert.match(assessment.caveats[0], /cannot guarantee/i);
  assert.equal(assessment.genderDependent, true);
});

test('German shared-room wording is understood', async () => {
  const assessment = assessAccommodation([await page('accommodation-german.html', 'https://example.dhamma.org/unterkunft/')]);
  assert.equal(assessment.verdict, VERDICTS.SHARED);
  assert.equal(assessment.singleRoomsAvailable, false);
});

test('a page with nothing to say leaves the verdict unknown', () => {
  const assessment = assessAccommodation([
    { url: 'https://example.test/', html: '<html><body><p>Courses are run entirely by donation.</p></body></html>' },
  ]);
  assert.equal(assessment.verdict, VERDICTS.UNKNOWN);
  assert.equal(assessment.singleRoomsAvailable, false);
  assert.deepEqual(assessment.evidence, []);
});

test('evidence is always attributed to the page it came from', async () => {
  const url = 'https://atala.dhamma.org/what-to-expect/';
  const assessment = assessAccommodation([await page('accommodation-mixed.html', url)]);
  assert.ok(assessment.evidence.every((item) => item.url === url));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterCourses, DEFAULT_FILTERS } from '../src/aggregate.js';
import { COURSE_TYPES } from '../src/parse-schedule.js';
import { CENTERS } from '../src/centers.js';

function course(overrides = {}) {
  return {
    id: 'x',
    type: COURSE_TYPES.TEN_DAY,
    startDate: '2026-06-01',
    endDate: '2026-06-12',
    nights: 11,
    status: 'open',
    languages: ['English'],
    sittable: true,
    oldStudentEligible: true,
    country: 'Spain',
    accommodationVerdict: 'single',
    singleRoomsAvailable: true,
    ...overrides,
  };
}

const FROM = '2026-01-01';

test('the default is exactly the ask: 10-day, English, sitting, single room', () => {
  const courses = [
    course({ id: 'keep' }),
    course({ id: 'serve', type: COURSE_TYPES.SERVICE, sittable: false }),
    course({ id: 'german', languages: ['German'] }),
    course({ id: 'short', type: COURSE_TYPES.SHORT }),
    course({ id: 'shared', accommodationVerdict: 'shared', singleRoomsAvailable: false }),
  ];

  const matched = filterCourses(courses, { from: FROM });
  assert.deepEqual(matched.map((item) => item.id), ['keep']);
});

test('serving is excluded even when the filters are otherwise wide open', () => {
  const courses = [course({ id: 'serve', type: COURSE_TYPES.SERVICE, sittable: false })];
  const matched = filterCourses(courses, { from: FROM, courseType: 'any', language: 'any', accommodation: 'any' });
  assert.deepEqual(matched, []);
});

test('"single available" keeps mixed centres, "single only" drops them', () => {
  const courses = [
    course({ id: 'single' }),
    course({ id: 'mixed', accommodationVerdict: 'mixed', singleRoomsAvailable: true }),
    course({ id: 'unknown', accommodationVerdict: 'unknown', singleRoomsAvailable: false }),
  ];

  assert.deepEqual(
    filterCourses(courses, { from: FROM, accommodation: 'single-available' }).map((item) => item.id),
    ['single', 'mixed']
  );
  assert.deepEqual(
    filterCourses(courses, { from: FROM, accommodation: 'single-only' }).map((item) => item.id),
    ['single']
  );
  assert.equal(filterCourses(courses, { from: FROM, accommodation: 'any' }).length, 3);
});

test('past courses are hidden', () => {
  const courses = [course({ id: 'past', startDate: '2025-05-01' }), course({ id: 'future' })];
  assert.deepEqual(filterCourses(courses, { from: '2026-01-01' }).map((item) => item.id), ['future']);
});

test('date window and country narrow the list', () => {
  const courses = [
    course({ id: 'spain-june' }),
    course({ id: 'spain-sept', startDate: '2026-09-01' }),
    course({ id: 'italy-june', country: 'Italy' }),
  ];

  assert.deepEqual(
    filterCourses(courses, { from: FROM, to: '2026-07-01' }).map((item) => item.id),
    ['spain-june', 'italy-june']
  );
  assert.deepEqual(
    filterCourses(courses, { from: FROM, countries: ['Italy'] }).map((item) => item.id),
    ['italy-june']
  );
});

test('full courses are shown by default and can be hidden', () => {
  const courses = [course({ id: 'open' }), course({ id: 'full', status: 'full' })];
  assert.equal(filterCourses(courses, { from: FROM }).length, 2);
  assert.deepEqual(
    filterCourses(courses, { from: FROM, includeFull: false }).map((item) => item.id),
    ['open']
  );
});

test('a bilingual course counts as English', () => {
  const courses = [course({ id: 'bilingual', languages: ['German', 'English'], bilingual: true })];
  assert.equal(filterCourses(courses, { from: FROM }).length, 1);
});

test('defaults describe the requested search', () => {
  assert.equal(DEFAULT_FILTERS.courseType, COURSE_TYPES.TEN_DAY);
  assert.equal(DEFAULT_FILTERS.language, 'English');
  assert.equal(DEFAULT_FILTERS.sittingOnly, true);
  assert.equal(DEFAULT_FILTERS.accommodation, 'single-available');
});

test('every registered centre is in Europe and has usable URLs', () => {
  assert.ok(CENTERS.length >= 10);
  for (const center of CENTERS) {
    assert.ok(center.name && center.country, `${center.id} needs a name and country`);
    assert.match(center.site, /^https:\/\/[a-z]+\.dhamma\.org\/$/);
    assert.ok(center.scheduleUrls.length > 0);
    for (const url of center.scheduleUrls) assert.match(url, /^https:\/\/www\.dhamma\.org\//);
  }
  assert.equal(new Set(CENTERS.map((center) => center.id)).size, CENTERS.length);
});

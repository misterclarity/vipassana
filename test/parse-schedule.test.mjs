import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSchedule, classifyCourseType, classifyStatus, extractLanguages, COURSE_TYPES } from '../src/parse-schedule.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TODAY = '2026-01-15';

const loadFixture = (name) => readFile(path.join(FIXTURES, name), 'utf8');

test('classifies the course types that appear on a schedule', () => {
  assert.equal(classifyCourseType('10-Day'), COURSE_TYPES.TEN_DAY);
  assert.equal(classifyCourseType('Ten Day Course'), COURSE_TYPES.TEN_DAY);
  assert.equal(classifyCourseType('Satipaṭṭhāna Sutta Course'), COURSE_TYPES.SATIPATTHANA);
  assert.equal(classifyCourseType('Satipatthana Sutta'), COURSE_TYPES.SATIPATTHANA);
  assert.equal(classifyCourseType('30-Day'), COURSE_TYPES.LONG);
  assert.equal(classifyCourseType('20-Day'), COURSE_TYPES.LONG);
  assert.equal(classifyCourseType('3-Day (Old Students only)'), COURSE_TYPES.SHORT);
  assert.equal(classifyCourseType("Children's Course"), COURSE_TYPES.CHILDREN);
  assert.equal(classifyCourseType('Service Period'), COURSE_TYPES.SERVICE);
});

test('a service period is never mistaken for the 10-day course it supports', () => {
  assert.equal(classifyCourseType('Service Period for 10-Day Course'), COURSE_TYPES.SERVICE);
  assert.equal(classifyCourseType("Children's Course (10-Day servers needed)"), COURSE_TYPES.CHILDREN);
});

test('reads availability wording', () => {
  assert.equal(classifyStatus('Open'), 'open');
  assert.equal(classifyStatus('Course Full'), 'full');
  assert.equal(classifyStatus('Waiting List'), 'waitlist');
  assert.equal(classifyStatus('Cancelled'), 'closed');
});

test('picks language names out of a row', () => {
  assert.deepEqual(extractLanguages('German / English – bilingual'), ['English', 'German']);
  assert.deepEqual(extractLanguages('Open'), []);
});

test('parses a UK-style schedule grouped under year headings', async () => {
  const html = await loadFixture('schedule-uk.html');
  const { courses } = parseSchedule(html, {
    sourceUrl: 'https://www.dhamma.org/en/schedules/schdipa',
    today: TODAY,
  });

  const tenDay = courses.filter((course) => course.type === COURSE_TYPES.TEN_DAY);
  assert.equal(tenDay.length, 3);
  assert.deepEqual(
    tenDay.map((course) => course.startDate),
    ['2026-02-25', '2026-03-11', '2027-01-06']
  );

  // The 2027 heading must carry over to the table beneath it.
  assert.equal(tenDay.at(-1).endDate, '2027-01-17');
  assert.equal(tenDay.at(-1).status, 'waitlist');

  assert.equal(tenDay[0].status, 'open');
  assert.equal(tenDay[1].status, 'full');
  assert.equal(
    tenDay[0].applyUrl,
    'https://www.dhamma.org/en/schedules/apply/dipa/2026-02-25'
  );
});

test('header rows are not parsed as courses', async () => {
  const html = await loadFixture('schedule-uk.html');
  const { courses } = parseSchedule(html, { sourceUrl: 'https://example.test/', today: TODAY });
  assert.ok(courses.every((course) => !/Course Type/i.test(course.rawText)));
});

test('service periods are captured but marked, so they can be excluded', async () => {
  const html = await loadFixture('schedule-uk.html');
  const { courses } = parseSchedule(html, { sourceUrl: 'https://example.test/', today: TODAY });
  const service = courses.filter((course) => course.type === COURSE_TYPES.SERVICE);
  assert.equal(service.length, 1);
  assert.equal(service[0].startDate, '2026-02-25');
});

test('flags rows restricted to old students', async () => {
  const html = await loadFixture('schedule-uk.html');
  const { courses } = parseSchedule(html, { sourceUrl: 'https://example.test/', today: TODAY });
  const short = courses.find((course) => course.type === COURSE_TYPES.SHORT);
  assert.equal(short.oldStudentsOnly, true);
});

test('parses a continental schedule with mixed date formats and a language column', async () => {
  const html = await loadFixture('schedule-continental.html');
  const { courses } = parseSchedule(html, {
    sourceUrl: 'https://www.dhamma.org/en/schedules/schdvara',
    today: TODAY,
  });

  assert.equal(courses.length, 4);
  assert.deepEqual(
    courses.map((course) => course.startDate),
    ['2026-02-25', '2026-03-11', '2026-04-01', '2026-12-28']
  );

  assert.deepEqual(courses[0].languages, ['English', 'German']);
  assert.equal(courses[0].bilingual, true);
  assert.deepEqual(courses[1].languages, ['German']);
  assert.deepEqual(courses[2].languages, ['English']);
  assert.equal(courses[3].endDate, '2027-01-08');
});

test('every parsed course carries the source it came from', async () => {
  const html = await loadFixture('schedule-continental.html');
  const sourceUrl = 'https://www.dhamma.org/en/schedules/schdvara';
  const { courses } = parseSchedule(html, { sourceUrl, today: TODAY });
  assert.ok(courses.every((course) => course.sourceUrl === sourceUrl));
});

test('a dateless page yields nothing rather than throwing', () => {
  const { courses, rowsSeen } = parseSchedule('<html><body><p>No courses scheduled.</p></body></html>', {
    sourceUrl: 'https://example.test/',
    today: TODAY,
  });
  assert.equal(courses.length, 0);
  assert.equal(rowsSeen, 0);
});

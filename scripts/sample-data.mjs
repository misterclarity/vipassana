#!/usr/bin/env node
// Builds a dataset from the test fixtures, with no network access at all.
//
//   node scripts/sample-data.mjs > sample.json
//   DATA_FILE=sample.json npm start
//
// Lets you work on the interface offline, and gives the UI something to show
// when you just want to see what the tool looks like before pointing it at the
// real site. The centre names are real; the courses in it are not.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCenter } from '../src/centers.js';
import { parseSchedule, dedupeCourses } from '../src/parse-schedule.js';
import { assessAccommodation } from '../src/parse-accommodation.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const read = (name) => readFile(path.join(FIXTURES, name), 'utf8');

const SAMPLES = [
  { id: 'dipa', schedule: 'schedule-uk.html', rooms: 'accommodation-single.html' },
  { id: 'dvara', schedule: 'schedule-continental.html', rooms: 'accommodation-german.html' },
  { id: 'atala', schedule: 'schedule-uk.html', rooms: 'accommodation-mixed.html' },
];

const centers = [];
const courses = [];

for (const sample of SAMPLES) {
  const center = getCenter(sample.id);
  const scheduleUrl = center.scheduleUrls[0];
  const roomsUrl = new URL('accommodations/', center.site).toString();

  const parsed = parseSchedule(await read(sample.schedule), { sourceUrl: scheduleUrl });
  const accommodation = assessAccommodation([{ url: roomsUrl, html: await read(sample.rooms) }]);

  const centerCourses = dedupeCourses(
    parsed.courses.map((course) => ({ ...course, centerId: center.id, id: `${center.id}:${course.startDate}:${course.type}` }))
  );

  centers.push({
    ...center,
    accommodation: { ...accommodation, attempts: [{ url: roomsUrl, ok: true, status: 200, error: null }] },
    sources: [{ url: scheduleUrl, ok: true, rowsSeen: parsed.rowsSeen, rowsWithDates: parsed.rowsWithDates, coursesFound: centerCourses.length }],
    coursesFound: centerCourses.length,
  });

  for (const course of centerCourses) {
    const languageInferred = course.languages.length === 0;
    courses.push({
      ...course,
      languages: languageInferred ? center.languages : course.languages,
      languageInferred,
      centerName: center.name,
      country: center.country,
      countryCode: center.countryCode,
      city: center.city,
      locationNote: center.locationNote,
      centerSite: center.site,
      scheduleUrl,
      applyUrl: course.applyUrl ?? scheduleUrl,
      sittable: course.type !== 'service',
      oldStudentEligible: ['10-day', 'satipatthana', 'short', 'long'].includes(course.type),
      accommodationVerdict: accommodation.verdict,
      singleRoomsAvailable: accommodation.singleRoomsAvailable,
      singleRoomsGuaranteed: accommodation.guaranteed,
    });
  }
}

courses.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.centerName.localeCompare(b.centerName));

// The fixtures use fixed dates, which would fall into the past and show an empty
// listing. Slide the whole set forward so the earliest course starts three weeks
// from now, keeping the intervals between courses intact.
if (courses.length > 0) {
  const shiftDays =
    Math.round((Date.now() - Date.parse(`${courses[0].startDate}T00:00:00Z`)) / 86400000) + 21;
  const shift = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + shiftDays * 86400000).toISOString().slice(0, 10);

  for (const course of courses) {
    course.startDate = shift(course.startDate);
    course.endDate = shift(course.endDate);
    course.id = `${course.centerId}:${course.startDate}:${course.type}`;
  }
  courses.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.centerName.localeCompare(b.centerName));
}

process.stdout.write(
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sample: true, centers, courses }, null, 2)}\n`
);

#!/usr/bin/env node
// Re-fetch every centre and print the courses matching the default search.
// Useful as a cron job, or just to warm the cache before opening the UI.

import { collect, filterCourses } from '../src/aggregate.js';
import { describeVerdict } from '../src/parse-accommodation.js';

const data = await collect({ forceRefresh: true });
const matches = filterCourses(data.courses);

console.log(`\nFetched ${data.centers.length} centres · ${data.courses.length} listings · ${new Date(data.generatedAt).toLocaleString()}`);
console.log(`\n10-day sitting courses in English, single room available — ${matches.length} found:\n`);

for (const course of matches) {
  const where = [course.centerName, course.country].filter(Boolean).join(', ');
  const status = course.status === 'unknown' ? '' : ` [${course.status}]`;
  console.log(`  ${course.startDate} → ${course.endDate}  ${where}${status}`);
  console.log(`    ${course.applyUrl}`);
}

const unreachable = data.centers.filter((center) => center.sources.some((source) => !source.ok));
if (unreachable.length > 0) {
  console.log(`\n${unreachable.length} centre(s) could not be read — run \`npm run doctor\` for detail.`);
}

const unknownRooms = data.centers.filter((center) => center.accommodation.verdict === 'unknown');
if (unknownRooms.length > 0) {
  console.log(`\nRoom type unconfirmed at: ${unknownRooms.map((center) => center.name).join(', ')}`);
  console.log('These are excluded from the single-room filter. Ask the centre directly.');
}

console.log('');
for (const center of data.centers) {
  console.log(`  ${center.name.padEnd(20)} ${describeVerdict(center.accommodation)}`);
}
console.log('');

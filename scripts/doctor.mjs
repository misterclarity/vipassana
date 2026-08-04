#!/usr/bin/env node
// Diagnostics: which centre pages loaded, which parsed, and which need attention.
//
// dhamma.org is a volunteer-run site whose markup changes without notice. Run
// this when the listing looks thin — it tells you whether a centre went quiet
// because the page moved, or because the parser stopped recognising its rows.

import { collect } from '../src/aggregate.js';

const forceRefresh = process.argv.includes('--refresh');
const data = await collect({ forceRefresh });

let problems = 0;

console.log(`\nChecked ${data.centers.length} centres${forceRefresh ? ' (fresh fetch)' : ' (cache allowed)'}\n`);

for (const center of data.centers) {
  console.log(`${center.name} — ${center.country}`);

  for (const source of center.sources) {
    if (!source.ok) {
      problems += 1;
      console.log(`  ✗ schedule ${source.url}\n      ${source.error}`);
    } else if (source.coursesFound === 0) {
      problems += 1;
      console.log(`  ! schedule ${source.url}`);
      console.log(`      loaded, but 0 courses parsed from ${source.rowsSeen} rows (${source.rowsWithDates} had dates)`);
      console.log('      the page layout may have changed — open it and compare with src/parse-schedule.js');
    } else {
      console.log(`  ✓ schedule ${source.coursesFound} courses from ${source.rowsSeen} rows`);
    }
  }

  const { accommodation } = center;
  const scanned = accommodation.pagesScanned.filter((page) => page.hits > 0);
  if (accommodation.verdict === 'unknown') {
    problems += 1;
    const reached = accommodation.attempts.filter((attempt) => attempt.ok).length;
    console.log(`  ! rooms   no evidence on ${reached} page(s) read (${accommodation.attempts.length} tried)`);
    console.log(`      the centre may simply not publish its room type — check by hand, then`);
    console.log(`      set entryUrls for "${center.id}" in src/centers.js if the page exists`);
  } else {
    console.log(`  ✓ rooms   ${accommodation.verdict} — ${accommodation.evidence.length} quote(s) from ${scanned.length} page(s)`);
  }
  console.log('');
}

console.log(problems === 0 ? 'No problems found.\n' : `${problems} thing(s) need attention.\n`);
process.exit(problems === 0 ? 0 : 1);

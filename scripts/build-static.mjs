#!/usr/bin/env node
// Builds a self-contained static site into dist/, for hosting on GitHub Pages.
//
// GitHub Pages serves files, not Node, so there is no /api/data and no live
// fetching: dhamma.org sends no `Access-Control-Allow-Origin`, which means a
// browser on github.io cannot read it even if we asked it to. The data is
// therefore read here, at build time, and written next to the UI as data.json.
//
// The result is a snapshot. Re-run the build to update it — see the workflow in
// .github/workflows/pages.yml, which does that on a schedule.

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collect } from '../src/aggregate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');

const forceRefresh = process.argv.includes('--refresh');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(root, 'public'), outDir, { recursive: true });

console.log('Reading dhamma.org…');
const data = await collect({ forceRefresh });

await writeFile(path.join(outDir, 'data.json'), JSON.stringify(data), 'utf8');

// GitHub Pages runs files through Jekyll by default, which ignores paths
// starting with an underscore. Nothing here does, but .nojekyll removes the
// class of problem entirely and costs nothing.
await writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');

const withRooms = data.centers.filter((center) => center.accommodation.verdict !== 'unknown').length;
const failed = data.centers.filter((center) => center.sources.some((source) => !source.ok));

console.log(
  `\ndist/ ready — ${data.courses.length} listings from ${data.centers.length} centres, ` +
    `${withRooms} with a room verdict`
);

if (failed.length > 0) {
  // Worth shouting about: a snapshot silently missing a centre looks identical
  // to a centre with no courses.
  console.error(`\nWARNING: ${failed.length} centre(s) had a schedule that failed to load:`);
  for (const center of failed) console.error(`  - ${center.name}`);
  process.exitCode = 1;
}

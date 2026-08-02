import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDateRange, extractDateTokens } from '../src/dates.js';

const TODAY = '2026-01-15';

test('day-first range with a year heading', () => {
  const range = parseDateRange('10-Day | 25 Feb - 08 Mar | Open', { defaultYear: 2026, today: TODAY });
  assert.deepEqual(range, { start: '2026-02-25', end: '2026-03-08', nights: 11 });
});

test('month-first range does not mistake the range dash for a separator', () => {
  // Without the tight-hyphen rule this reads as the single date "25 March".
  const range = parseDateRange('Feb 25 - Mar 08, 2026', { today: TODAY });
  assert.deepEqual(range, { start: '2026-02-25', end: '2026-03-08', nights: 11 });
});

test('ISO range', () => {
  const range = parseDateRange('2026-04-01 to 2026-04-12', { today: TODAY });
  assert.deepEqual(range, { start: '2026-04-01', end: '2026-04-12', nights: 11 });
});

test('dotted European range', () => {
  const range = parseDateRange('11.03.2026 - 22.03.2026', { today: TODAY });
  assert.deepEqual(range, { start: '2026-03-11', end: '2026-03-22', nights: 11 });
});

test('year stated only at the end is borrowed by the start', () => {
  const range = parseDateRange('25 Feb - 8 Mar 2027', { today: TODAY });
  assert.deepEqual(range, { start: '2027-02-25', end: '2027-03-08', nights: 11 });
});

test('range that wraps the new year keeps the start in the previous year', () => {
  const range = parseDateRange('28 Dec - 08 Jan 2027', { today: TODAY });
  assert.deepEqual(range, { start: '2026-12-28', end: '2027-01-08', nights: 11 });
});

test('bare wrapping range without any year still resolves forwards', () => {
  const range = parseDateRange('28 Dec - 08 Jan', { today: TODAY });
  assert.equal(range.start, '2026-12-28');
  assert.equal(range.end, '2027-01-08');
});

test('long month names and ordinals', () => {
  const range = parseDateRange('25th February 2026 until 8th March 2026', { today: TODAY });
  assert.deepEqual(range, { start: '2026-02-25', end: '2026-03-08', nights: 11 });
});

test('a single date yields a zero-night range', () => {
  const range = parseDateRange("Children's Course | 18 Apr | Open", { defaultYear: 2026, today: TODAY });
  assert.deepEqual(range, { start: '2026-04-18', end: '2026-04-18', nights: 0 });
});

test('text with no dates returns null', () => {
  assert.equal(parseDateRange('Course Type | Dates | Availability', { today: TODAY }), null);
});

test('impossible dates are rejected', () => {
  assert.equal(extractDateTokens('31 Feb 2026').length, 0);
});

test('course type numbers are not read as dates', () => {
  assert.equal(parseDateRange('10-Day', { today: TODAY }), null);
  assert.equal(parseDateRange('30-Day', { today: TODAY }), null);
});

test('absurdly long spans are discarded rather than reported', () => {
  assert.equal(parseDateRange('01 Jan 2026 - 01 Dec 2026', { today: TODAY }), null);
});

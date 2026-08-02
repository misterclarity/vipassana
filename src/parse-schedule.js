// Turns a dhamma.org centre schedule page into structured courses.
//
// Column order, table classes and wording vary between centres, so nothing here
// keys off markup structure. Every <tr> on the page is read as a bag of text plus
// links, and each row is classified by what it says.

import { extractRows, extractYearMarkers } from './html.js';
import { parseDateRange, daysBetween } from './dates.js';

export const COURSE_TYPES = {
  TEN_DAY: '10-day',
  SATIPATTHANA: 'satipatthana',
  SHORT: 'short',
  LONG: 'long',
  CHILDREN: 'children',
  SERVICE: 'service',
  SPECIAL: 'special',
  UNKNOWN: 'unknown',
};

const LANGUAGE_NAMES = [
  'English', 'German', 'French', 'Spanish', 'Italian', 'Dutch', 'Flemish', 'Polish',
  'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Russian', 'Ukrainian', 'Portuguese',
  'Czech', 'Slovak', 'Hungarian', 'Romanian', 'Bulgarian', 'Serbian', 'Croatian',
  'Slovenian', 'Greek', 'Turkish', 'Hebrew', 'Catalan', 'Estonian', 'Latvian',
  'Lithuanian', 'Belarusian', 'Macedonian', 'Albanian', 'Hindi', 'Chinese', 'Japanese',
];

const HEADER_HINTS = /course\s*type|start\s*date|end\s*date|\bdates?\b|language|availability|status|register|apply/i;

/**
 * Classify a row's course type.
 *
 * Order matters: "Children's course" and "Service period" rows often also mention
 * the 10-day course they attach to, so they are matched first.
 */
export function classifyCourseType(text) {
  const value = String(text ?? '');
  if (/\b(children|teenager|teen[' ]?s|youth)\b/i.test(value)) return COURSE_TYPES.CHILDREN;
  if (/\b(service\s*period|dhamma\s*service|server[s']?\s*course|work\s*period|volunteer)\b/i.test(value)) {
    return COURSE_TYPES.SERVICE;
  }
  if (/satipa[tṭ]{1,2}h[aā]na|\bsatipatthana\b/i.test(value)) return COURSE_TYPES.SATIPATTHANA;
  if (/\b(1[5-9]|[2-9]\d)[\s-]*day\b/i.test(value)) return COURSE_TYPES.LONG;
  if (/\b(10|ten)[\s-]*day\b/i.test(value)) return COURSE_TYPES.TEN_DAY;
  if (/\b([1-3]|one|two|three)[\s-]*day\b|\bshort\s*course\b|\bself[\s-]*course\b/i.test(value)) {
    return COURSE_TYPES.SHORT;
  }
  if (/\bexecutive\b|\bspecial\b|\bgroup\s*sitting\b/i.test(value)) return COURSE_TYPES.SPECIAL;
  return COURSE_TYPES.UNKNOWN;
}

export function classifyStatus(text) {
  const value = String(text ?? '');
  if (/\b(cancel+ed|cancelled|closed|not\s*open)\b/i.test(value)) return 'closed';
  if (/\bwait(ing)?[\s-]*list\b/i.test(value)) return 'waitlist';
  if (/\b(full|no\s*vacanc|fully\s*booked)\b/i.test(value)) return 'full';
  if (/\b(open|apply|available|register|vacanc)/i.test(value)) return 'open';
  return 'unknown';
}

/** Languages named in the row, if any. */
export function extractLanguages(text) {
  const value = String(text ?? '');
  const found = LANGUAGE_NAMES.filter((language) => new RegExp(`\\b${language}\\b`, 'i').test(value));
  return [...new Set(found)];
}

function pickApplyLink(row) {
  const links = row.cells.flatMap((cell) => cell.links).filter((link) => link.href);
  if (links.length === 0) return null;
  const preferred =
    links.find((link) => /\bapply\b|application|register|enrol/i.test(`${link.text} ${link.href}`)) ?? links[0];
  return preferred.href;
}

function looksLikeHeaderRow(row) {
  if (row.cells.every((cell) => cell.tag === 'th')) return true;
  const cellCount = row.cells.length;
  const headerish = row.cells.filter((cell) => HEADER_HINTS.test(cell.text) && cell.text.length < 40).length;
  return cellCount > 1 && headerish >= Math.min(2, cellCount);
}

function yearHintFor(rowIndex, markers) {
  let hint = null;
  for (const marker of markers) {
    if (marker.index <= rowIndex) hint = marker.year;
    else break;
  }
  return hint;
}

/**
 * @param {string} html raw schedule page
 * @param {{sourceUrl: string, today?: string|Date}} options
 * @returns {{courses: Array, rowsSeen: number, rowsWithDates: number}}
 */
export function parseSchedule(html, options) {
  const { sourceUrl, today } = options;
  const rows = extractRows(html, sourceUrl);
  const yearMarkers = extractYearMarkers(html);

  const courses = [];
  let rowsWithDates = 0;

  for (const row of rows) {
    if (looksLikeHeaderRow(row)) continue;

    const dates = parseDateRange(row.text, {
      defaultYear: yearHintFor(row.index, yearMarkers),
      today,
    });
    if (!dates) continue;
    rowsWithDates += 1;

    let type = classifyCourseType(row.text);
    // Some centres list only dates and a status, leaving the course type to the
    // surrounding heading. An 11-night span is the unmistakable 10-day shape
    // (day 0 arrival through the morning of day 11).
    if (type === COURSE_TYPES.UNKNOWN && dates.nights >= 10 && dates.nights <= 11) {
      type = COURSE_TYPES.TEN_DAY;
    }

    const languages = extractLanguages(row.text);

    courses.push({
      type,
      startDate: dates.start,
      endDate: dates.end,
      nights: dates.nights,
      durationDays: daysBetween(dates.start, dates.end),
      status: classifyStatus(row.text),
      languages,
      bilingual: /\bbilingual\b/i.test(row.text),
      oldStudentsOnly: /\bold\s*students?\s*(only|course)\b|\bfor\s*old\s*students\b/i.test(row.text),
      newStudentsWelcome: /\bnew\s*students?\b/i.test(row.text),
      applyUrl: pickApplyLink(row),
      sourceUrl,
      rawText: row.text,
    });
  }

  return { courses, rowsSeen: rows.length, rowsWithDates };
}

/** Drop duplicate listings (same centre, type and start date) across sources. */
export function dedupeCourses(courses) {
  const seen = new Map();
  for (const course of courses) {
    const key = `${course.centerId ?? ''}|${course.type}|${course.startDate}`;
    const existing = seen.get(key);
    // Prefer the richer record when the same course appears on two pages.
    if (!existing || (!existing.applyUrl && course.applyUrl) || existing.languages.length < course.languages.length) {
      seen.set(key, existing ? { ...existing, ...course } : course);
    }
  }
  return [...seen.values()];
}

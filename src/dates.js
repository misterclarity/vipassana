// Date parsing for schedule rows.
//
// Centre schedules write date ranges in a lot of shapes: "25 Feb - 8 Mar",
// "Feb 25 - Mar 08, 2026", "2026-02-25 to 2026-03-08", "25.02.2026 - 08.03.2026".
// Rather than matching each layout, we pull every date-ish token out of the cell
// in document order and treat the first two as start and end.

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

// Separator between a day number and its month name. A hyphen is allowed only
// when it is tight ("25-Feb"), never when padded (" - "), because a padded hyphen
// is the range dash: without this, "Feb 25 - Mar 08" reads as the single date
// "25 March" and the course silently lands in the wrong month.
const DAY_MONTH_SEP = String.raw`(?:[ .\u00a0]{0,2}|-)`;

const TOKEN_PATTERNS = [
  // 2026-02-25
  {
    re: /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    read: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
  },
  // 25 February 2026 / 25 Feb / 25-Feb
  {
    re: new RegExp(
      String.raw`\b(\d{1,2})(?!\d)(?:st|nd|rd|th)?${DAY_MONTH_SEP}(${MONTH_PATTERN})\b\.?(?:[\s,]*(20\d{2}))?`,
      'gi'
    ),
    read: (m) => ({
      day: Number(m[1]),
      month: MONTHS[m[2].toLowerCase()],
      year: m[3] ? Number(m[3]) : null,
    }),
  },
  // February 25, 2026 / Feb 25 / Feb-25
  {
    re: new RegExp(
      String.raw`\b(${MONTH_PATTERN})\b\.?${DAY_MONTH_SEP}(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:[\s,]*(20\d{2}))?`,
      'gi'
    ),
    read: (m) => ({
      month: MONTHS[m[1].toLowerCase()],
      day: Number(m[2]),
      year: m[3] ? Number(m[3]) : null,
    }),
  },
  // 25.02.2026 / 25/02/2026 — day-first, which is the European convention these
  // centres use. Requires a 4-digit year so it cannot swallow "10/11" style text.
  {
    re: /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g,
    read: (m) => ({ day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }),
  },
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Reject dates that cannot exist, so "31 Feb" is not silently rolled over into
 * March. When the year is unknown, February is given the benefit of the doubt.
 */
function isValidDayMonth(day, month, year = null) {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const limit = month === 2 && year !== null && !isLeapYear(year) ? 28 : DAYS_IN_MONTH[month - 1];
  return day <= limit;
}

/** Every date-like token in `text`, in the order it appears. */
export function extractDateTokens(text) {
  const input = String(text ?? '');
  const found = [];
  const claimed = [];

  for (const { re, read } of TOKEN_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(input)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // Earlier (more specific) patterns win over later ones on overlap.
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      const token = read(match);
      if (!isValidDayMonth(token.day, token.month, token.year ?? null)) continue;
      claimed.push([start, end]);
      found.push({ ...token, at: start, raw: match[0].trim() });
    }
  }

  return found.sort((a, b) => a.at - b.at);
}

function makeDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects things like 31 February, which Date would silently roll over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(startIso, endIso) {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86400000);
}

/**
 * Choose the year for a token that did not carry one: prefer an explicit page
 * hint, otherwise pick the nearest occurrence that is not already in the past.
 */
function inferYear(token, { defaultYear, today }) {
  if (token.year) return token.year;
  if (defaultYear) return defaultYear;

  const reference = today ? new Date(today) : new Date();
  const referenceYear = reference.getUTCFullYear();
  const candidates = [referenceYear - 1, referenceYear, referenceYear + 1];
  let best = null;
  for (const year of candidates) {
    const date = makeDate(year, token.month, token.day);
    if (!date) continue;
    // A schedule listing is about upcoming courses, so bias forward: a bare
    // "28 Dec" seen in January means the coming December, not the one just gone.
    // The two-week grace keeps a course that is currently running in this year.
    const ageDays = (reference.getTime() - date.getTime()) / 86400000;
    const score = ageDays < -400 ? 3 : ageDays > 14 ? 2 : 1;
    if (!best || score < best.score) best = { year, score };
  }
  return best ? best.year : referenceYear;
}

/**
 * Parse a start/end pair out of free text.
 *
 * @returns {{start: string, end: string, nights: number} | null}
 */
export function parseDateRange(text, options = {}) {
  const tokens = extractDateTokens(text);
  if (tokens.length === 0) return null;

  const startToken = tokens[0];
  const endToken = tokens[1] ?? null;

  // "25 Feb - 8 Mar 2027" states the year once, at the end. Borrow it — stepping
  // back a year when the range wraps, as in "28 Dec - 8 Jan 2027" (starts 2026).
  const borrowedYear =
    !startToken.year && endToken?.year
      ? endToken.month >= startToken.month
        ? endToken.year
        : endToken.year - 1
      : null;

  const startYear = startToken.year ?? borrowedYear ?? inferYear(startToken, options);
  const start = makeDate(startYear, startToken.month, startToken.day);
  if (!start) return null;

  let end = start;
  if (endToken) {
    const endYear = endToken.year ?? inferYear({ ...endToken, year: null }, { ...options, defaultYear: startYear });
    let candidate = makeDate(endYear, endToken.month, endToken.day);
    // A range that ends before it starts means it crossed a year boundary
    // (e.g. "28 Dec - 8 Jan").
    if (candidate && candidate < start && !endToken.year) {
      candidate = makeDate(endYear + 1, endToken.month, endToken.day);
    }
    if (candidate && candidate >= start) end = candidate;
  }

  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (nights > 120) return null;

  return { start: toIsoDate(start), end: toIsoDate(end), nights };
}

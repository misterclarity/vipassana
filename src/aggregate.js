// Pulls the whole picture together: schedules + accommodation, per centre.

import { CENTERS, accommodationCandidates, MAX_ACCOMMODATION_FETCHES } from './centers.js';
import { fetchAll, fetchPage, DEFAULT_TTL_MS } from './fetcher.js';
import { parseSchedule, dedupeCourses, COURSE_TYPES } from './parse-schedule.js';
import { assessAccommodation, VERDICTS } from './parse-accommodation.js';

/**
 * Try a centre's candidate accommodation pages in order, stopping as soon as one
 * yields a usable verdict. Keeps the request count per centre in single digits.
 */
async function loadAccommodation(center, options) {
  const candidates = accommodationCandidates(center).slice(0, MAX_ACCOMMODATION_FETCHES);
  const pages = [];
  const attempts = [];

  for (const url of candidates) {
    const page = await fetchPage(url, options);
    attempts.push({ url, ok: page.ok, status: page.status, error: page.error });
    if (!page.ok) continue;
    pages.push({ url: page.finalUrl ?? url, html: page.html });

    const assessment = assessAccommodation(pages);
    if (assessment.verdict !== VERDICTS.UNKNOWN) {
      return { ...assessment, attempts };
    }
  }

  return { ...assessAccommodation(pages), attempts };
}

async function loadSchedule(center, options) {
  const pages = await fetchAll(center.scheduleUrls, options);
  const courses = [];
  const sources = [];

  for (const page of pages) {
    if (!page.ok) {
      sources.push({ url: page.url, ok: false, error: page.error, coursesFound: 0 });
      continue;
    }
    const parsed = parseSchedule(page.html, { sourceUrl: page.finalUrl ?? page.url, today: options.today });
    sources.push({
      url: page.url,
      ok: true,
      rowsSeen: parsed.rowsSeen,
      rowsWithDates: parsed.rowsWithDates,
      coursesFound: parsed.courses.length,
    });
    courses.push(...parsed.courses);
  }

  return { courses, sources };
}

/**
 * Fetch and parse every centre.
 *
 * @param {{forceRefresh?: boolean, cacheDir?: string, ttlMs?: number, centers?: Array, today?: string}} options
 */
export async function collect(options = {}) {
  const centers = options.centers ?? CENTERS;
  const fetchOptions = {
    cacheDir: options.cacheDir ?? '.cache',
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
    forceRefresh: options.forceRefresh ?? false,
    today: options.today,
  };

  const results = [];
  for (const center of centers) {
    const [schedule, accommodation] = await Promise.all([
      loadSchedule(center, fetchOptions),
      loadAccommodation(center, fetchOptions),
    ]);

    const courses = dedupeCourses(
      schedule.courses.map((course) => ({
        ...course,
        centerId: center.id,
        id: `${center.id}:${course.startDate}:${course.type}`,
      }))
    );

    results.push({ center, accommodation, courses, sources: schedule.sources });
  }

  const allCourses = results.flatMap(({ center, accommodation, courses }) =>
    courses.map((course) => decorate(course, center, accommodation))
  );

  allCourses.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.centerName.localeCompare(b.centerName));

  return {
    generatedAt: new Date().toISOString(),
    centers: results.map(({ center, accommodation, courses, sources }) => ({
      ...center,
      accommodation,
      sources,
      coursesFound: courses.length,
    })),
    courses: allCourses,
  };
}

/** Attach the centre context each course needs to be filtered and displayed. */
function decorate(course, center, accommodation) {
  // Most centres publish a language column only when a course is not in the
  // centre's usual language, so an empty column means "the centre's default".
  const languageInferred = course.languages.length === 0;
  const languages = languageInferred ? center.languages : course.languages;

  return {
    ...course,
    languages,
    languageInferred,
    centerId: center.id,
    centerName: center.name,
    country: center.country,
    countryCode: center.countryCode,
    city: center.city,
    locationNote: center.locationNote,
    centerSite: center.site,
    scheduleUrl: course.sourceUrl,
    applyUrl: course.applyUrl ?? center.scheduleUrls[0],
    // Old students may always sit a 10-day course; it is the standard course they
    // re-sit. Service periods are the thing to exclude when you want to sit.
    sittable: course.type !== COURSE_TYPES.SERVICE,
    oldStudentEligible:
      course.type === COURSE_TYPES.TEN_DAY ||
      course.type === COURSE_TYPES.SATIPATTHANA ||
      course.type === COURSE_TYPES.SHORT ||
      course.type === COURSE_TYPES.LONG,
    accommodationVerdict: accommodation.verdict,
    singleRoomsAvailable: accommodation.singleRoomsAvailable,
    singleRoomsGuaranteed: accommodation.guaranteed,
  };
}

export const DEFAULT_FILTERS = {
  courseType: COURSE_TYPES.TEN_DAY,
  language: 'English',
  sittingOnly: true,
  accommodation: 'single-available', // 'single-only' | 'single-available' | 'any'
  from: null,
  to: null,
  countries: [],
  includeFull: true,
};

export function filterCourses(courses, filters = {}) {
  const settings = { ...DEFAULT_FILTERS, ...filters };
  const from = settings.from ?? new Date().toISOString().slice(0, 10);

  return courses.filter((course) => {
    if (course.startDate < from) return false;
    if (settings.to && course.startDate > settings.to) return false;
    if (settings.courseType !== 'any' && course.type !== settings.courseType) return false;
    if (settings.sittingOnly && !course.sittable) return false;
    if (settings.language !== 'any') {
      const spoken = course.languages.map((language) => language.toLowerCase());
      if (!spoken.includes(settings.language.toLowerCase())) return false;
    }
    if (settings.countries.length > 0 && !settings.countries.includes(course.country)) return false;
    if (!settings.includeFull && (course.status === 'full' || course.status === 'closed')) return false;

    if (settings.accommodation === 'single-only' && course.accommodationVerdict !== VERDICTS.SINGLE) return false;
    if (settings.accommodation === 'single-available' && !course.singleRoomsAvailable) return false;

    return true;
  });
}

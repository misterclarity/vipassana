// Client-side rendering and filtering. The server hands over the whole dataset
// once; every filter change is a local re-render.

const elements = {
  filters: document.getElementById('filters'),
  results: document.getElementById('results'),
  summary: document.getElementById('summary'),
  centres: document.getElementById('centres'),
  freshness: document.getElementById('freshness'),
  refresh: document.getElementById('refresh'),
  country: document.getElementById('f-country'),
  from: document.getElementById('f-from'),
};

let dataset = null;

const VERDICT_LABELS = {
  single: { text: 'Single rooms', tone: 'good' },
  mixed: { text: 'Single or shared', tone: 'warn' },
  shared: { text: 'Shared rooms', tone: 'bad' },
  unknown: { text: 'Rooms unconfirmed', tone: 'neutral' },
};

const STATUS_LABELS = {
  open: { text: 'Open', tone: 'good' },
  waitlist: { text: 'Waiting list', tone: 'warn' },
  full: { text: 'Full', tone: 'bad' },
  closed: { text: 'Closed', tone: 'bad' },
  unknown: { text: null, tone: 'neutral' },
};

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function readFilters() {
  const form = new FormData(elements.filters);
  return {
    accommodation: form.get('accommodation'),
    language: form.get('language'),
    courseType: form.get('courseType'),
    from: form.get('from') || new Date().toISOString().slice(0, 10),
    to: form.get('to') || null,
    country: form.get('country') || null,
    openOnly: form.get('openOnly') === 'on',
  };
}

function applyFilters(courses, filters) {
  return courses.filter((course) => {
    if (course.startDate < filters.from) return false;
    if (filters.to && course.startDate > filters.to) return false;
    if (filters.courseType !== 'any' && course.type !== filters.courseType) return false;
    // "Sitting, not serving" is not a toggle — service periods are never listed.
    if (!course.sittable) return false;
    if (filters.language !== 'any') {
      const spoken = (course.languages ?? []).map((language) => language.toLowerCase());
      if (!spoken.includes(filters.language.toLowerCase())) return false;
    }
    if (filters.country && course.country !== filters.country) return false;
    if (filters.openOnly && (course.status === 'full' || course.status === 'closed')) return false;
    if (filters.accommodation === 'single-only' && course.accommodationVerdict !== 'single') return false;
    if (filters.accommodation === 'single-available' && !course.singleRoomsAvailable) return false;
    return true;
  });
}

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

function badge(text, tone = 'neutral', title = null) {
  return element('span', { class: `badge badge-${tone}`, text, title });
}

function formatRange(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  return startIso === endIso ? dayMonth.format(start) : `${dayMonth.format(start)} – ${dayMonth.format(end)}`;
}

function accommodationEvidence(center) {
  const assessment = center?.accommodation;
  if (!assessment?.evidence?.length) return null;

  const details = element('details', { class: 'evidence' }, [
    element('summary', { text: `Why: ${assessment.evidence.length} quote${assessment.evidence.length > 1 ? 's' : ''} from ${center.name}` }),
  ]);

  for (const item of assessment.evidence) {
    const cite = element('cite', {});
    cite.append(element('a', { href: item.url, target: '_blank', rel: 'noreferrer noopener', text: item.url }));
    details.append(element('blockquote', {}, [document.createTextNode(item.quote), cite]));
  }

  if (assessment.caveats?.length) {
    details.append(
      element('p', {
        class: 'muted small',
        text: 'The centre qualifies this — read the quotes above and confirm when applying.',
      })
    );
  }
  return details;
}

function renderCourse(course, centersById) {
  const center = centersById.get(course.centerId);
  const verdict = VERDICT_LABELS[course.accommodationVerdict] ?? VERDICT_LABELS.unknown;
  const status = STATUS_LABELS[course.status] ?? STATUS_LABELS.unknown;

  const badges = element('div', { class: 'badges' }, [
    badge(verdict.text, verdict.tone),
    status.text ? badge(status.text, status.tone) : null,
    course.languages?.length
      ? badge(
          course.languages.join(' / '),
          course.languageInferred ? 'neutral' : 'good',
          course.languageInferred
            ? "The schedule row named no language; this is the centre's usual teaching language."
            : 'Language stated on the schedule.'
        )
      : null,
    course.singleRoomsGuaranteed ? null : badge('Confirm room type', 'neutral', 'Single rooms are allocated per course — confirm with the centre.'),
    course.oldStudentsOnly ? badge('Old students only', 'neutral') : null,
  ]);

  const where = element('div', { class: 'course-where' }, [
    element('h3', { text: course.centerName }),
    element('p', {
      class: 'place',
      text: [course.city, course.country].filter(Boolean).join(', '),
    }),
    badges,
    accommodationEvidence(center),
  ]);

  const dates = element('div', { class: 'course-dates' }, [
    element('span', { class: 'range', text: formatRange(course.startDate, course.endDate) }),
    element('span', { class: 'duration', text: `${course.nights} nights · ${new Date(`${course.startDate}T00:00:00Z`).getUTCFullYear()}` }),
  ]);

  const action = element('div', { class: 'course-action' }, [
    element('a', {
      class: 'apply-button',
      href: course.applyUrl,
      target: '_blank',
      rel: 'noreferrer noopener',
      text: 'Apply to sit',
    }),
    element('a', {
      class: 'small muted',
      href: course.scheduleUrl,
      target: '_blank',
      rel: 'noreferrer noopener',
      text: 'Schedule',
    }),
  ]);

  return element('article', { class: 'course' }, [dates, where, action]);
}

function groupByMonth(courses) {
  const groups = new Map();
  for (const course of courses) {
    const key = course.startDate.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(course);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderResults(courses, centersById) {
  elements.results.replaceChildren();
  elements.results.setAttribute('aria-busy', 'false');

  if (courses.length === 0) {
    elements.results.append(
      element('div', { class: 'placeholder' }, [
        element('p', { text: 'No courses match these filters.' }),
        element('p', {
          class: 'small',
          text: 'Try "Single or shared" accommodation, widen the dates, or set language to "Any" — many European centres teach in the local language with English translation.',
        }),
      ])
    );
    return;
  }

  for (const [month, monthCourses] of groupByMonth(courses)) {
    const list = element('div', { class: 'course-list' }, monthCourses.map((course) => renderCourse(course, centersById)));
    elements.results.append(
      element('section', { class: 'month-group' }, [
        element('h2', { text: monthYear.format(new Date(`${month}-01T00:00:00Z`)) }),
        list,
      ])
    );
  }
}

function renderSummary(matched, filters) {
  const countries = new Set(matched.map((course) => course.country));
  const bits = [
    `<strong>${matched.length}</strong> course${matched.length === 1 ? '' : 's'}`,
    `across <strong>${countries.size}</strong> countr${countries.size === 1 ? 'y' : 'ies'}`,
  ];
  if (filters.accommodation === 'single-only') bits.push('at centres describing <strong>single rooms only</strong>');
  else if (filters.accommodation === 'single-available') bits.push('where a <strong>single room</strong> is available');
  elements.summary.innerHTML = `${bits.join(' ')}.`;
}

function renderCentres(centers) {
  elements.centres.replaceChildren(element('h2', { text: 'Centres checked' }));

  const cards = centers.map((center) => {
    const verdict = VERDICT_LABELS[center.accommodation?.verdict] ?? VERDICT_LABELS.unknown;
    const failed = center.sources?.filter((source) => !source.ok) ?? [];
    return element('div', { class: 'centre-card' }, [
      element('h3', { text: center.name }),
      element('p', { class: 'place', text: [center.city, center.country].filter(Boolean).join(', ') }),
      element('div', { class: 'badges' }, [
        badge(verdict.text, verdict.tone),
        badge(`${center.coursesFound} listed`, 'neutral'),
        center.accommodation?.genderDependent ? badge('Varies by gender', 'neutral') : null,
      ]),
      failed.length
        ? element('p', { class: 'problem', text: `Schedule unreachable: ${failed[0].error ?? 'unknown error'}` })
        : null,
      center.coursesFound === 0 && failed.length === 0
        ? element('p', { class: 'problem', text: 'Page loaded but no dated courses were recognised — open the schedule directly.' })
        : null,
    ]);
  });

  elements.centres.append(element('div', { class: 'centre-grid' }, cards));
}

function render() {
  if (!dataset) return;
  const filters = readFilters();
  const centersById = new Map(dataset.centers.map((center) => [center.id, center]));
  const matched = applyFilters(dataset.courses, filters);
  renderSummary(matched, filters);
  renderResults(matched, centersById);
  renderCentres(dataset.centers);
}

function populateCountries() {
  const countries = [...new Set(dataset.centers.map((center) => center.country))].sort();
  for (const country of countries) {
    elements.country.append(element('option', { value: country, text: country }));
  }
}

// Served two ways: by server.mjs, which fetches dhamma.org on demand, or as a
// static site (GitHub Pages) with no server at all. In the second case there is
// no /api/data and no live refresh — dhamma.org sends no CORS headers, so a
// browser cannot read it directly — and the page falls back to the snapshot
// built at deploy time.
let staticMode = false;

async function fetchDataset(forceRefresh) {
  if (!staticMode) {
    try {
      const response = await fetch(`./api/data${forceRefresh ? '?refresh=1' : ''}`);
      if (response.ok) return response;
      if (response.status !== 404) throw new Error(`Server responded ${response.status}`);
    } catch {
      // No API here; fall through to the snapshot.
    }
  }

  const snapshot = await fetch('./data.json', { cache: 'no-cache' });
  if (!snapshot.ok) throw new Error(`Server responded ${snapshot.status}`);
  staticMode = true;
  return snapshot;
}

async function load({ forceRefresh = false } = {}) {
  elements.refresh.disabled = true;
  elements.freshness.textContent = forceRefresh ? 'Refreshing from dhamma.org…' : 'Loading…';
  try {
    const response = await fetchDataset(forceRefresh);
    const wasEmpty = dataset === null;
    dataset = await response.json();
    if (wasEmpty) populateCountries();
    const generated = new Date(dataset.generatedAt);
    const read = staticMode ? 'Snapshot taken' : 'Read';
    elements.freshness.textContent = `${read} ${generated.toLocaleString()} · ${dataset.courses.length} listings from ${dataset.centers.length} centres`;
    render();
  } catch (error) {
    elements.results.setAttribute('aria-busy', 'false');
    elements.results.replaceChildren(
      element('div', { class: 'placeholder' }, [
        element('p', { text: 'Could not load course data.' }),
        element('p', { class: 'small', text: String(error.message ?? error) }),
        element('p', { class: 'small', text: 'Check that this machine can reach dhamma.org, then refresh.' }),
      ])
    );
    elements.freshness.textContent = 'Load failed';
  } finally {
    // A static deployment has nothing to refresh against, so the button says so
    // rather than failing silently when pressed.
    if (staticMode) {
      elements.refresh.disabled = true;
      elements.refresh.title = 'This is a published snapshot — run the app locally to re-read dhamma.org';
    } else {
      elements.refresh.disabled = false;
    }
  }
}

elements.from.value = new Date().toISOString().slice(0, 10);
elements.filters.addEventListener('change', render);
elements.refresh.addEventListener('click', () => load({ forceRefresh: true }));
load();

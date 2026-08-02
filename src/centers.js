// Registry of Vipassana centres in Europe in the tradition of S.N. Goenka.
//
// This file holds identity and *where to look* only — names, countries and URLs.
// It deliberately does NOT hard-code whether a centre has single rooms: that
// claim is read live from each centre's own pages at runtime (see
// parse-accommodation.js), so the app can quote its source instead of asking you
// to trust a number someone typed in here.
//
// VRI counts sixteen centres in Europe plus dozens of non-centre course venues.
// The list below covers the established centres; `npm run doctor` reports any
// entry whose URLs no longer resolve, and adding a centre is just another object.

/** Paths tried, in order, when hunting for a centre's accommodation description. */
export const ACCOMMODATION_PATH_CANDIDATES = [
  'accommodations/',
  'accommodation/',
  'what-to-expect/',
  'the-center/',
  'the-centre/',
  'facilities/',
  'course-information/',
  '',
];

/** How many accommodation pages we are willing to fetch per centre. */
export const MAX_ACCOMMODATION_FETCHES = 4;

const scheduleUrl = (slug) => `https://www.dhamma.org/en/schedules/sch${slug}`;
const centreSite = (slug) => `https://${slug}.dhamma.org/`;

function centre(config) {
  const { slug } = config;
  return {
    id: slug,
    site: centreSite(slug),
    scheduleUrls: [scheduleUrl(slug)],
    accommodationUrls: null, // null => derive from site + ACCOMMODATION_PATH_CANDIDATES
    city: null,
    locationNote: null,
    capacity: null,
    languages: [],
    kind: 'centre',
    ...config,
  };
}

export const CENTERS = [
  centre({
    slug: 'dipa',
    name: 'Dhamma Dīpa',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'Herefordshire',
    locationNote: 'Rural Herefordshire, western England.',
    capacity: 128,
    languages: ['English'],
  }),
  centre({
    slug: 'padhana',
    name: 'Dhamma Padhāna',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'Herefordshire',
    locationNote: 'Long-course centre adjoining Dhamma Dīpa. Runs 20/30/45/60-day courses, so it rarely appears in a 10-day search.',
    languages: ['English'],
  }),
  centre({
    slug: 'sukhakari',
    name: 'Dhamma Sukhakari',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'Suffolk',
    languages: ['English'],
  }),
  centre({
    slug: 'mahi',
    name: 'Dhamma Mahī',
    country: 'France',
    countryCode: 'FR',
    locationNote: 'Countryside roughly 165 km south of Paris.',
    capacity: 140,
    languages: ['French', 'English'],
  }),
  centre({
    slug: 'neru',
    name: 'Dhamma Neru',
    country: 'Spain',
    countryCode: 'ES',
    locationNote: 'Hills north of Barcelona.',
    capacity: 130,
    languages: ['Spanish', 'English'],
  }),
  centre({
    slug: 'atala',
    name: 'Dhamma Atala',
    country: 'Italy',
    countryCode: 'IT',
    capacity: 110,
    languages: ['Italian', 'English'],
  }),
  centre({
    slug: 'dvara',
    name: 'Dhamma Dvāra',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Triebel',
    locationNote: 'Hilltop site in Saxony, reachable from Berlin, Dresden and Frankfurt.',
    capacity: 100,
    languages: ['German', 'English'],
  }),
  centre({
    slug: 'pajjota',
    name: 'Dhamma Pajjota',
    country: 'Belgium',
    countryCode: 'BE',
    city: 'Dilsen-Stokkem',
    locationNote: 'Rural Belgian Limburg; the Benelux centre.',
    languages: ['Dutch', 'English', 'French'],
  }),
  centre({
    slug: 'sumeru',
    name: 'Dhamma Sumeru',
    country: 'Switzerland',
    countryCode: 'CH',
    city: 'Mont-Soleil',
    locationNote: 'Swiss Jura, about 1100 m altitude.',
    languages: ['German', 'French', 'English'],
  }),
  centre({
    slug: 'talaka',
    name: 'Dhamma Taḷāka',
    country: 'Netherlands',
    countryCode: 'NL',
    city: 'Almere',
    languages: ['Dutch', 'English'],
  }),
  centre({
    slug: 'pallava',
    name: 'Dhamma Pallava',
    country: 'Poland',
    countryCode: 'PL',
    languages: ['Polish', 'English'],
  }),
  centre({
    slug: 'sobhana',
    name: 'Dhamma Sobhana',
    country: 'Sweden',
    countryCode: 'SE',
    locationNote: 'Central Sweden.',
    capacity: 80,
    languages: ['Swedish', 'English'],
  }),
  centre({
    slug: 'dullabha',
    name: 'Dhamma Dullabha',
    country: 'Russia',
    countryCode: 'RU',
    capacity: 100,
    languages: ['Russian', 'English'],
  }),
];

/** Accommodation pages to try for a centre, most specific first. */
export function accommodationCandidates(center) {
  if (center.accommodationUrls?.length) return center.accommodationUrls;
  return ACCOMMODATION_PATH_CANDIDATES.map((path) => new URL(path, center.site).toString());
}

export function getCenter(id) {
  return CENTERS.find((center) => center.id === id) ?? null;
}

export const COUNTRIES = [...new Set(CENTERS.map((center) => center.country))].sort();

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

// `entry` below is *where to start reading*, not what the centre says.
//
// Only eight of these thirteen centres actually live at `<slug>.dhamma.org`; the
// rest redirect to a shared country site (uk, fr, de, ru) where several centres
// coexist. That matters for accuracy: starting Dhamma Dīpa and Dhamma Sukhakāri
// from `uk.dhamma.org` would let each pick up the other's description, since the
// two centres differ (`/centres/the-site/` vs `/suffolk-centre/the-site/`). Each
// entry therefore points at the centre's *own* section, and src/discover.js
// follows the site's navigation from there.

const scheduleUrl = (slug) => `https://www.dhamma.org/en/schedules/sch${slug}`;
const centreSite = (slug) => `https://${slug}.dhamma.org/`;

function centre(config) {
  const { slug } = config;
  const site = config.site ?? centreSite(slug);
  return {
    id: slug,
    site,
    scheduleUrls: [scheduleUrl(slug)],
    entryUrls: config.entryUrls ?? [site],
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
    site: 'https://uk.dhamma.org/herefordshire-centre/',
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
    site: 'https://uk.dhamma.org/suffolk-centre/',
    name: 'Dhamma Sukhakari',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'Suffolk',
    languages: ['English'],
  }),
  centre({
    slug: 'mahi',
    site: 'https://fr.dhamma.org/dhamma-mahi-permanent-center/',
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
    site: 'https://de.dhamma.org/de/meditationszentrum-vogtland/',
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
    site: 'https://ru.dhamma.org/',
    name: 'Dhamma Dullabha',
    country: 'Russia',
    countryCode: 'RU',
    capacity: 100,
    languages: ['Russian', 'English'],
  }),
];

export function getCenter(id) {
  return CENTERS.find((center) => center.id === id) ?? null;
}

export const COUNTRIES = [...new Set(CENTERS.map((center) => center.country))].sort();

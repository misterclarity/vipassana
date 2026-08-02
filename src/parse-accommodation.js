// Works out whether a centre offers single rooms — and, crucially, shows its work.
//
// No dhamma.org listing exposes room type as data, so this reads each centre's own
// accommodation description and returns the sentences it based the verdict on.
// Centre sites are often in the local language, so the patterns are multilingual.

import { toSentences, extractTitle } from './html.js';

export const VERDICTS = {
  SINGLE: 'single',   // only single rooms are described
  MIXED: 'mixed',     // single rooms exist alongside shared/twin/dormitory
  SHARED: 'shared',   // only shared accommodation is described
  UNKNOWN: 'unknown', // nothing conclusive found
};

const SINGLE_PATTERNS = [
  /\bsingle\s+rooms?\b/i,
  /\bsingle[-\s]occupancy\b/i,
  /\bindividual\s+rooms?\b/i,
  /\bprivate\s+rooms?\b/i,
  /\bown\s+(single\s+)?rooms?\b/i,
  /\bone\s+(person|student|meditator)\s+per\s+room\b/i,
  /\broom\s+to\s+(him|her|them)sel(f|ves)\b/i,
  /\beinzelzimmer/i,                         // de
  /\bchambres?\s+(individuelles?|seules?)\b/i, // fr
  /\bhabitaci(o|ó)n(es)?\s+individual(es)?\b/i, // es
  /\bcamere?\s+singole?\b/i,                 // it
  /\b(e(e|é)npersoonskamers?)\b/i,           // nl
  /\bpokoje?\s+jednoosobow/i,                // pl
];

const SHARED_PATTERNS = [
  /\bshared\s+rooms?\b/i,
  /\bshare\s+(a\s+)?rooms?\b/i,
  /\bsharing\s+(a\s+)?rooms?\b/i,
  /\bdormitor(y|ies)\b/i,
  /\bdorms?\b/i,
  /\b(double|twin|triple)\s+rooms?\b/i,
  /\b(two|three|four)\s+(people|persons|students|meditators)\s+per\s+room\b/i,
  /\bbunk\s*beds?\b/i,
  // German compounds inflect ("Mehrbettzimmern"), so no trailing boundary here.
  /\b(mehrbett|doppel|zweibett|gemeinschafts)zimmer/i, // de
  /\bschlafsaal/i,                           // de
  /\bchambres?\s+(partag(é|e)es?|doubles?|communes?)\b/i, // fr
  /\bdortoir\b/i,                            // fr
  /\bhabitaci(o|ó)n(es)?\s+compartidas?\b/i, // es
  /\bcamere?\s+(doppie?|triple?|condivise?)\b/i, // it
  /\bgedeelde\s+kamers?\b/i,                 // nl
  /\bslaapzaal\b/i,                          // nl
  /\bpokoje?\s+(dwu|wielo)osobow/i,          // pl
];

const CAVEAT_PATTERNS = [
  /\b(cannot|can't|not\s+always\s+possible\s+to)\s+guarantee\b/i,
  /\bno\s+guarantee\b/i,
  /\bnot\s+guaranteed\b/i,
  /\bsubject\s+to\s+availability\b/i,
  /\bdepend(s|ing)?\s+on\s+(the\s+)?(number|availability|demand|course)\b/i,
  /\bwhen(ever)?\s+possible\b/i,
  /\bmay\s+(have\s+to\s+)?share\b/i,
  /\bmight\s+(have\s+to\s+)?share\b/i,
  /\bif\s+(the\s+)?course\s+is\s+full\b/i,
];

const GENDER_PATTERNS =
  /\b(men|male|women|female|ladies|gents|frauen|m(a|ä)nner|femmes|hommes|mujeres|hombres|donne|uomini|vrouwen|mannen)\b/i;

// Sentences about paying guests, staff quarters or hotels nearby are not about
// where a student sleeps during the course.
const IRRELEVANT_PATTERNS =
  /\b(hotels?|guest\s*houses?|b&b|airbnb|booking\.com|staff\s+quarters|teachers?'?s?\s+residence)/i;

// German (and Dutch) build compounds, so "Mehrbettzimmern" has no word boundary
// before "zimmer": those stems are matched anywhere, the rest only at word start.
const ROOM_CONTEXT =
  /\b(rooms?|accommodat|lodging|sleep|beds?|chambres?|habitaci|camere?|kamers?|pokoj|nocleg|h(e|é)bergement|alojamiento|alloggio)|zimmer|unterkunft|schlafsaal|slaapzaal|bett/i;

function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Scan one page for accommodation evidence.
 *
 * @param {string} html
 * @param {string} url
 */
export function scanAccommodationPage(html, url) {
  const sentences = toSentences(html);
  const evidence = [];

  for (const sentence of sentences) {
    if (!ROOM_CONTEXT.test(sentence)) continue;
    if (IRRELEVANT_PATTERNS.test(sentence)) continue;

    const single = matchesAny(SINGLE_PATTERNS, sentence);
    const shared = matchesAny(SHARED_PATTERNS, sentence);
    if (!single && !shared) continue;

    evidence.push({
      quote: sentence,
      url,
      indicates: single && shared ? 'both' : single ? 'single' : 'shared',
      caveat: matchesAny(CAVEAT_PATTERNS, sentence),
      mentionsGender: GENDER_PATTERNS.test(sentence),
    });
  }

  return { url, title: extractTitle(html), evidence };
}

/**
 * Combine evidence from every page fetched for a centre into one verdict.
 *
 * @param {Array<{url: string, html: string}>} pages
 */
export function assessAccommodation(pages) {
  const scans = pages.map((page) => scanAccommodationPage(page.html, page.url));
  const evidence = scans.flatMap((scan) => scan.evidence);

  const hasSingle = evidence.some((item) => item.indicates === 'single' || item.indicates === 'both');
  const hasShared = evidence.some((item) => item.indicates === 'shared' || item.indicates === 'both');

  let verdict = VERDICTS.UNKNOWN;
  if (hasSingle && hasShared) verdict = VERDICTS.MIXED;
  else if (hasSingle) verdict = VERDICTS.SINGLE;
  else if (hasShared) verdict = VERDICTS.SHARED;

  const caveats = evidence.filter((item) => item.caveat);
  const genderDependent = evidence.some((item) => item.mentionsGender);

  return {
    verdict,
    // True only when a centre describes single rooms and nothing contradicts it.
    // "mixed" still counts as a real possibility of a single room, which is why
    // the UI separates "single only" from "single available".
    singleRoomsAvailable: verdict === VERDICTS.SINGLE || verdict === VERDICTS.MIXED,
    guaranteed: verdict === VERDICTS.SINGLE && caveats.length === 0,
    genderDependent,
    evidence: evidence.slice(0, 8),
    caveats: caveats.slice(0, 4).map((item) => item.quote),
    pagesScanned: scans.map((scan) => ({ url: scan.url, title: scan.title, hits: scan.evidence.length })),
  };
}

export function describeVerdict(assessment) {
  switch (assessment?.verdict) {
    case VERDICTS.SINGLE:
      return assessment.guaranteed
        ? 'Describes single rooms only'
        : 'Describes single rooms, with conditions';
    case VERDICTS.MIXED:
      return 'Has single rooms, but also shared rooms';
    case VERDICTS.SHARED:
      return 'Describes shared accommodation only';
    default:
      return 'No room information found — ask the centre';
  }
}

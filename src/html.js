// Minimal HTML utilities. Deliberately dependency-free: the whole app is meant to
// run with a bare `node server.mjs`, with no install step and no network access
// beyond the dhamma.org pages it reads.

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  deg: '°',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  szlig: 'ß',
};

export function decodeEntities(input) {
  return String(input).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Remove script/style/comments, which otherwise pollute extracted text. */
export function stripNoise(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ');
}

// Stands in for a block boundary while the source's own whitespace is flattened.
// Without this two-step, hard-wrapped source lines would read as line breaks and
// a single sentence in the markup would come out chopped into fragments — which
// silently truncates quoted evidence and strips sentences of their context.
const BLOCK_BREAK = '\u0001';

/** HTML fragment -> plain text, one line per block element. */
export function toText(html) {
  const marked = stripNoise(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th|\/section|\/article|\/blockquote)\b[^>]*>/gi, BLOCK_BREAK)
    .replace(/<[^>]*>/g, ' ');

  return decodeEntities(marked)
    .replace(/\s+/g, ' ')
    .split(BLOCK_BREAK)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/** Same as toText but flattened onto a single line. */
export function toInlineText(html) {
  return toText(html).replace(/\s+/g, ' ').trim();
}

export function resolveUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Extract anchors from a fragment, with hrefs resolved against baseUrl. */
export function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const hrefMatch = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(match[1]);
    const rawHref = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4]) : null;
    if (!rawHref || /^(javascript:|#)/i.test(rawHref.trim())) continue;
    links.push({
      href: resolveUrl(decodeEntities(rawHref.trim()), baseUrl),
      text: toInlineText(match[2]),
    });
  }
  return links;
}

/**
 * Extract table rows as `{ index, cells, text, html }`.
 *
 * dhamma.org schedule pages are plain server-rendered tables, but the exact
 * classes and column order differ between centres, so nothing here depends on
 * either — rows are read positionally and classified by their content.
 */
export function extractRows(html, baseUrl) {
  const clean = stripNoise(html);
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let match;
  while ((match = rowRe.exec(clean)) !== null) {
    const rowHtml = match[1];
    const cells = [];
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push({
        tag: cellMatch[1].toLowerCase(),
        text: toInlineText(cellMatch[3]),
        links: extractLinks(cellMatch[3], baseUrl),
      });
    }
    if (cells.length === 0) continue;
    rows.push({
      index: match.index,
      cells,
      text: cells.map((cell) => cell.text).filter(Boolean).join(' | '),
      html: rowHtml,
    });
  }
  return rows;
}

/**
 * Headings that consist of (or contain) a bare year, with their position in the
 * document. Schedule pages routinely group courses under a year heading and then
 * omit the year from each row.
 */
export function extractYearMarkers(html) {
  const clean = stripNoise(html);
  const markers = [];
  const re = /<(h[1-6]|caption|strong|b|legend)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let match;
  while ((match = re.exec(clean)) !== null) {
    const text = toInlineText(match[2]);
    const year = /\b(20\d{2})\b/.exec(text);
    if (year && text.length <= 60) {
      markers.push({ index: match.index, year: Number(year[1]) });
    }
  }
  return markers;
}

/** Split page text into sentence-ish chunks, for evidence extraction. */
export function toSentences(html) {
  return toText(html)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?;])\s+(?=[A-Z(“"'\d])/))
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 400);
}

/** Page <title>, useful for diagnostics. */
export function extractTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match ? toInlineText(match[1]) : null;
}

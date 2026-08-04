# Vipassana course finder

Finds **10-day courses you can sit** (not serve) as an **old student**, taught in
**English**, at **European centres that describe single rooms** — in the tradition of
S.N. Goenka, from [dhamma.org](https://www.dhamma.org/en/index).

Those four things are the default view. Everything else is a filter you can widen.

```bash
npm start          # http://localhost:4173
```

No dependencies, no install step. Node 20+. (There is a `build`, but only for
publishing a static copy — running it locally never needs one.)

## Why it works the way it does

**Room type is not published as data.** dhamma.org lists course type, dates, language and
availability — never whether you sleep alone. That single fact drives the design: the app
reads each centre's own accommodation page and quotes the sentence it based its verdict on,
with a link. You are never asked to trust a hard-coded flag. `src/centers.js` holds names and
URLs only; no accommodation claim is written into this repository.

Three verdicts come out of that:

| Verdict | Meaning |
| --- | --- |
| **Single rooms** | The centre describes single rooms and nothing contradicts it. |
| **Single or shared** | Single rooms exist, but so do doubles/dormitories — you might get either. |
| **Shared rooms** | Only shared accommodation is described. |
| *Rooms unconfirmed* | Nothing conclusive was found. Excluded from the single-room filter; ask the centre. |

The default filter is **Single room available**, which keeps both "single" and "single or
shared". Switch to **Single rooms only** for the strict reading.

**A single room is never fully guaranteed.** Centres allocate rooms per course and often per
gender, and a full course can mean sharing. Where a centre says so itself, that caveat is
surfaced. Treat the app as a shortlist, and confirm when you apply.

## Notes on the search itself

- **A course's entry requirement is not its type.** Almost every old-student row says
  "having completed a 10-day course", which is about the student's past, not the course on
  offer. Those clauses are stripped before a row is classified — otherwise a 1-day sit at
  Dhamma Mahī lands in your 10-day results.
- **10-day courses are open to old students.** They are the standard course old students
  re-sit — there is no separate "old student 10-day". Apply via the old-student application on
  the centre's page. Old-student-only formats (Satipaṭṭhāna, 3-day, long courses) are available
  under the Course filter.
- **Serving is always excluded.** Service periods are parsed, labelled and then filtered out —
  they cannot appear no matter how the filters are set.
- **Language in grey is inferred.** Most centres publish a language column only when a course
  departs from their usual teaching language, so a blank column means "the centre's default".
  Grey means inferred, green means the schedule said so. Outside the UK and Ireland, many
  courses are taught in the local language with English translation — verify before applying.
- **Non-centre courses are not listed.** Europe has dozens of courses at rented venues in
  countries without a centre. They are not published as per-centre schedules and almost always
  use shared accommodation. Use the
  [official course search](https://www.dhamma.org/en/courses/search) for those.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Serves the UI on port 4173. |
| `npm run refresh` | Re-fetches everything and prints the matching courses to the terminal. |
| `npm run doctor` | Reports which centre pages loaded, which parsed, and what needs fixing. |
| `npm run build` | Builds `dist/` — the UI plus a `data.json` snapshot — for static hosting. |
| `npm test` | 54 unit tests over date parsing, row classification, page discovery, evidence extraction and filtering. |

Fetched pages are cached on disk in `.cache/` for 6 hours (failures for 15 minutes), with a
concurrency cap and a pause between requests — dhamma.org is run by volunteers.

## Publishing it as a static site

```bash
npm run build       # -> dist/ (the UI plus a data.json snapshot)
```

GitHub Pages serves files, not Node, so there is no `/api/data` on a published
site — and the browser cannot fill that gap itself, because dhamma.org sends no
`Access-Control-Allow-Origin`. The data is therefore read at build time and
shipped alongside the UI; the page falls back to `data.json` automatically and
disables the refresh button, which would have nothing to talk to.

**What that means in practice: a published site is a snapshot, not a live view.**
`.github/workflows/pages.yml` rebuilds it daily so it does not drift — course
schedules are published months ahead, and dhamma.org is run by volunteers, so
once a day is both sufficient and polite.

Pages is free for **public** repositories. Serving Pages from a private repo
needs a paid plan, so publishing this means making the repository public.

## Working offline

```bash
node scripts/sample-data.mjs > sample.json
DATA_FILE=sample.json npm start
```

Builds a dataset from the test fixtures with no network access, so you can work on the
interface. Centre names are real; the courses in it are invented.

## Verification status — read this before trusting a listing

Run against the live site on 2 August 2026: all 13 schedules parse (840 listings), and 6
centres describe their rooms in their own words. The remaining 7 publish nothing about room
type anywhere on their sites — that was checked by crawling each one exhaustively, so
*unconfirmed* here means "the centre does not say", not "we failed to look".

| | Centres |
| --- | --- |
| **Single rooms** | Dhamma Padhāna (UK), Dhamma Pallava (PL) |
| **Single or shared** | Dhamma Mahī (FR), Dhamma Pajjota (BE) |
| **Shared rooms** | Dhamma Dīpa (UK), Dhamma Sukhakāri (UK) |
| *Unconfirmed* | Neru, Atala, Dvāra, Sumeru, Taḷāka, Sobhana, Dullabha |

Two things about these sites shape the whole design, and both were learned the hard way:

**They answer 200 for every URL.** A guessed path like `/accommodation/` never 404s — it
quietly returns the homepage. Guessing therefore cannot work, and worse, it *looks* like it
worked. `src/discover.js` fingerprints each host's filler page and discards it, then finds the
real page by following the site's own navigation.

**Centres share sites.** Only 8 of 13 live at `<slug>.dhamma.org`; the rest redirect to a
country site (`uk`, `fr`, `de`, `ru`) shared with their neighbours. A crawl that wanders into
the next centre's pages will quote its rooms as this one's — which is worse than finding
nothing, because it reads as though the centre said it. Each centre starts from its own
section, and links into a neighbouring centre's section are never followed.

`npm run doctor` re-checks all of this and tells you where reality has moved on:

- `✗ schedule` — the URL is wrong or unreachable; fix `scheduleUrls` for that centre.
- `! schedule … 0 courses parsed` — the page loaded but the layout changed; open it alongside
  `src/parse-schedule.js`.
- `! rooms  no evidence` — either the centre genuinely says nothing, or its description moved;
  check by hand, then point `entryUrls` at the right section.

A centre that fails still appears in the UI under "Centres checked", with the reason, rather
than silently vanishing from the results.

## Layout

```
server.mjs                    HTTP server; serves the UI and /api/data
src/centers.js                European centres: names and URLs only
src/parse-schedule.js         schedule page  -> courses
src/discover.js               finds each centre's accommodation page (see above)
src/parse-accommodation.js    centre pages   -> single-room verdict + quoted evidence
src/dates.js                  the date-range formats centres actually use
src/aggregate.js              orchestration and the filter rules
src/fetcher.js                polite fetching with a disk cache
public/                       the interface (vanilla JS, no framework)
scripts/                      refresh, doctor, sample-data
```

Unofficial and unaffiliated. dhamma.org is the source of truth for every course listed here.

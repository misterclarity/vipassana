# Vipassana course finder

Finds **10-day courses you can sit** (not serve) as an **old student**, taught in
**English**, at **European centres that describe single rooms** — in the tradition of
S.N. Goenka, from [dhamma.org](https://www.dhamma.org/en/index).

Those four things are the default view. Everything else is a filter you can widen.

```bash
npm start          # http://localhost:4173
```

No dependencies, no install step, no build. Node 20+.

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
| `npm test` | 41 unit tests over date parsing, row classification, evidence extraction and filtering. |

Fetched pages are cached on disk in `.cache/` for 6 hours (failures for 15 minutes), with a
concurrency cap and a pause between requests — dhamma.org is run by volunteers.

## Working offline

```bash
node scripts/sample-data.mjs > sample.json
DATA_FILE=sample.json npm start
```

Builds a dataset from the test fixtures with no network access, so you can work on the
interface. Centre names are real; the courses in it are invented.

## Verification status — read this before trusting a listing

This was built in a sandbox with **no outbound network access**, so the parsers have never run
against a live dhamma.org page. What that means concretely:

- **Tested:** date formats, course-type and status classification, language extraction,
  evidence extraction and every filter rule — against fixtures that mirror the documented page
  structure (41 tests, all passing).
- **Not tested:** that those fixtures match today's real markup, and that the centre list in
  `src/centers.js` is complete and current. VRI counts sixteen centres in Europe; thirteen are
  registered here.

So the **first thing to run is `npm run doctor`.** It fetches every page and tells you exactly
where reality differs:

- `✗ schedule` — the URL is wrong or unreachable; fix `scheduleUrls` for that centre.
- `! schedule … 0 courses parsed` — the page loaded but the layout changed; open it alongside
  `src/parse-schedule.js`.
- `! rooms  no evidence found` — the accommodation page is somewhere else; set
  `accommodationUrls` for that centre.

A centre that fails still appears in the UI under "Centres checked", with the reason, rather
than silently vanishing from the results.

## Layout

```
server.mjs                    HTTP server; serves the UI and /api/data
src/centers.js                European centres: names and URLs only
src/parse-schedule.js         schedule page  -> courses
src/parse-accommodation.js    centre pages   -> single-room verdict + quoted evidence
src/dates.js                  the date-range formats centres actually use
src/aggregate.js              orchestration and the filter rules
src/fetcher.js                polite fetching with a disk cache
public/                       the interface (vanilla JS, no framework)
scripts/                      refresh, doctor, sample-data
```

Unofficial and unaffiliated. dhamma.org is the source of truth for every course listed here.

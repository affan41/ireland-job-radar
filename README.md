# Ireland Job Radar

One portal for jobs across Ireland, filterable by county, refreshed on a timer.

Pulls from the aggregators, from employers' own careers boards, and from the remote
job boards, folds them into a single deduplicated list, works out which county each
listing is in, and scores it against the kinds of role you actually want to see.

No npm install. No build step. No API keys needed to start.

## Running it

```bash
cd ~/ireland-job-radar && npm start
```

Then open http://localhost:8099

The first launch finds an empty database and runs an initial collection, which takes
two or three minutes. After that it refreshes itself every 45 minutes while the
server is running.

To collect once without starting the server:

```bash
cd ~/ireland-job-radar && npm run refresh
```

Requires Node 22.5 or newer, because it uses Node's built-in SQLite. You have v24.

## What it searches

Roles are grouped into seven categories, tuned to your background and common
student work:

| Category | Covers |
| --- | --- |
| Accountancy and practice | ACCA, ACA, CIMA, management and financial accountant, financial controller, finance manager, practice roles |
| Tax | Corporate tax, VAT, tax consultant, tax senior and manager |
| Audit | External, internal and statutory audit, assurance |
| Finance operations | Payroll, FP&A, financial analyst, AP, AR, credit control |
| IT and software | Software engineering, IT support and systems, business and systems analyst, ERP and finance systems |
| AI and data | Machine learning, AI engineering, data science, analytics, BI |
| Student part-time jobs | Retail, hospitality, customer service, reception, admin, tutoring, warehouse, cleaning and general work advertised as part-time, casual, evening or weekend work |

Anything that matches none of these is discarded rather than stored, so the list
stays relevant instead of becoming every job in the country.

When the same vacancy appears on more than one feed, the radar stores every source
against the deduplicated job. Direct employer and JobsIreland links take precedence
over aggregator redirects, and the card shows when another source also carries it.

## Where the listings come from

| Source | Key needed | What it gives you |
| --- | --- | --- |
| Careerjet Ireland | No | The bulk of it. Aggregates IrishJobs, Jobs.ie, the recruitment agencies and most employer sites |
| ACCA Careers | No | Finance and accountancy vacancies from ACCA's official careers board, searched directly for Ireland |
| JobsIreland | No | Independent vacancies from the Irish government's Department of Social Protection service, including its complete current part-time search |
| Employer boards | No | Greenhouse, Ashby, Workable, Lever and SmartRecruiters boards, straight from companies including Stripe, Intercom, OpenAI, H&M, JYSK, Version 1 and MUFG. Roles here often never reach the aggregators |
| Remote boards | No | Remotive, Himalayas, Jobicy, Arbeitnow, filtered hard to listings that actually accept someone in Ireland |
| Adzuna Ireland | Yes, free | Extra coverage plus structured salary figures |

### Turning on Adzuna

Optional but worth the two minutes. Register at https://developer.adzuna.com, then
either copy `config.example.json` to `config.json` and fill in `appId` and `appKey`,
or run with environment variables:

```bash
ADZUNA_APP_ID=xxxx ADZUNA_APP_KEY=yyyy npm start
```

## Filters

- **Region.** All 26 counties of the Republic plus the six in Northern Ireland,
  grouped by province, with a live count against each. Counties with nothing in them
  are hidden. Remote and nationwide listings get their own buckets.
- **Category.** The six groups above.
- **Working pattern.** Hybrid, remote, on site, or not stated. Read out of the
  listing text, so hybrid roles surface even when the board has no field for it.
- **Job type.** Part-time, full-time, temporary/seasonal, contract or not stated.
  Use this together with **Student part-time jobs** to isolate casual work suitable
  around a study timetable.
- **Match strength.** "Good match" means the role title matched, not just the body
  text. Raise it to "Strong match" when a search is noisy, drop it to "Anything
  related" when you want the widest net.
- **Posted within**, **salary floor**, **source**, and free text search across title,
  company and description.

Salaries are normalised to an annual figure before filtering, so an hourly or daily
rate still sorts correctly against a salaried role.

## Shortlisting

Every listing has a **Shortlist** button and a **Hide** button. Shortlisted jobs
survive the automatic clear-out of stale listings; hidden ones stop appearing.
Tick "Shortlist only" in the sidebar to see just the ones you kept, and **Export CSV**
writes the current filtered view out to a spreadsheet.

## Keeping it current

While `npm start` is running it refreshes every 45 minutes on its own, and the
**Refresh now** button in the top right forces one.

Listings not seen in any refresh for 30 days are deleted, on the assumption they are
filled. Shortlisted jobs are never deleted.

To have it collect in the background whether or not the server is up, add a cron
entry:

```bash
crontab -l 2>/dev/null | { cat; echo "0 */2 * * * cd $HOME/ireland-job-radar && /usr/local/bin/node --no-warnings scripts/refresh-once.js >> /tmp/job-radar.log 2>&1"; } | crontab -
```

Check `which node` first and use whatever path that prints.

## Configuration

Everything is optional and lives in `config.json` (start from `config.example.json`).
The settings worth knowing:

- `refreshMinutes` how often the running server collects. Minimum 10.
- `careerjet.maxPages` pages per search term. Each page is 99 listings. The default
  is 3; raising it further widens coverage at the cost of a slower refresh.
- `accaCareers.maxPages` controls how many 20-vacancy pages are read from ACCA
  Careers' official Ireland RSS search. The default 25 covers up to 500 listings.
- `jobsIreland.latestPages` controls how many 250-vacancy pages are read from the
  government service. Its dedicated part-time search is collected separately.
- `pruneAfterDays` how long a listing survives without being seen again.
- `employers.companies` the careers boards to follow. To add one, find the company on
  Greenhouse, Ashby, Workable or Lever and take the slug out of the board URL.

## Files

```
server.js                  HTTP server and JSON API
src/config.js              Settings, config.json and environment variables
src/refresh.js             Runs every source, normalises, writes to the database
src/regions.js             County and town gazetteer, region and work mode detection
src/profiles.js            The searches to run and how relevance is scored
src/employment.js          Part-time, full-time, temporary and contract detection
src/normalise.js           Deduplication, salary parsing, HTML cleanup
src/db.js                  SQLite schema and queries
src/sources/               One adapter per source
public/                    The interface
data/jobs.db               The database, created on first run
```

## Adding a search of your own

Open `src/profiles.js` and add an entry:

```js
{
  id: 'insolvency',
  group: 'practice',
  name: 'Insolvency',
  queries: ['insolvency', 'corporate recovery'],
  titleTerms: ['insolvency', 'liquidation', 'receivership', 'restructuring'],
}
```

`queries` go out to the job boards. `titleTerms` decide relevance afterwards, and a
term found in the job title counts for five times one found in the description.
Restart and refresh.

## Known limits

- IrishJobs.ie and Jobs.ie block direct scraping, so they arrive through Careerjet
  rather than first hand. In practice the coverage is much the same.
- publicjobs.ie has no public feed. Public sector roles show up when they are
  advertised elsewhere too, but for civil service competitions specifically, set up
  an alert on publicjobs.ie directly.
- Careerjet's own keyword matching is loose, which is what the match strength filter
  is there to clean up.

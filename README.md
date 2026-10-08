# OneLess

*One less stress.* Part-time jobs for students in Ireland, on one page.

One portal for jobs across Ireland, filterable by region and visa sponsorship,
with remote part-time and Limerick views, refreshed on a timer.

Pulls from the aggregators, from employers' own careers boards, and from the remote
job boards, folds them into a single deduplicated list, works out which country and
region each listing is in, reads whether the advert says anything about sponsoring a
work permit, and scores it against the kinds of role you actually want to see.

Run `npm install` once (Cheerio parses public advert HTML). No build step. Direct public employer sources need no API key; Careerjet requires its publisher API key.

## Running it

```bash
cd ~/ireland-job-radar && npm start
```

Then open http://localhost:8099

The tabs across the top show All Ireland and Part time (Limerick plus remote).
Collection and displayed results are limited to Ireland and eligible remote work.

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
| Careerjet | Publisher API key | Searches the Irish index. Aggregates IrishJobs, Jobs.ie, recruitment agencies and employer sites |
| Local searches | Publisher API key | Careerjet again, but asked town by town rather than country-wide, for Limerick and everywhere within a commute, plus a set of work-from-home searches. A national sweep sorted by date never reaches more than a handful of Limerick listings; asking for Limerick directly returns several hundred |
| Local employer sites | No | Current adverts linked from The Old Quarter Group careers page, covering the townhouse, pub, Fordes Courtyard and The Top House |
| JobAlert.ie | No | The paginated Limerick part-time search, with open/expired status and actual employment types checked |
| Primark, Lidl, McDonald's, Supermac's and Boots | No | Official public vacancy feeds and full adverts, with contract types, hours and available workplace coordinates |
| Tesco Ireland | No | Official Irish store adverts, with contract hours read from each live vacancy page and expired adverts excluded |
| ACCA Careers | No | Finance and accountancy vacancies from ACCA's official careers board, searched directly for Ireland |
| JobsIreland | No | Independent vacancies from the Irish government's Department of Social Protection service, including its complete current part-time search |
| Major employer career sites | No | Ireland vacancies read directly from Apple, Amazon, Microsoft, KPMG, Deloitte, PwC and EY, with official application links rather than aggregator redirects |
| Employer boards | No | Greenhouse, Ashby, Workable, Lever and SmartRecruiters boards, straight from companies including Stripe, Intercom, OpenAI, H&M, JYSK, Kurt Geiger, Frasers Group / Sports Direct, Rituals, SPAR, MACE, Londis, EUROSPAR, Version 1 and MUFG. Roles here often never reach the aggregators |
| Remote boards | No | Remotive, Himalayas, Jobicy, Arbeitnow, filtered hard to listings that actually accept someone in Ireland |
| Adzuna Ireland | Yes, free | Extra coverage plus structured salary figures |

### Turning on Adzuna

Optional but worth the two minutes. Register at https://developer.adzuna.com, then
either copy `config.example.json` to `config.json` and fill in `appId` and `appKey`,
or run with environment variables:

```bash
ADZUNA_APP_ID=xxxx ADZUNA_APP_KEY=yyyy npm start
```

## Visa sponsorship

Only explicit offers or refusals in a checked advert count. Employer names,
multinational status, source websites, relocation packages and references to permit
eligibility do not establish an offer. Unsubstantiated labels are `Not stated`.
The card and CSV retain the supporting sentence and source advert URL.

## The Part time tab

A saved view rather than a country. It shows work you could take alongside a course
at the University of Limerick, which means two things at once:

- Anything in **Limerick**, or in Castletroy, Raheen, Annacotty, Shannon, Ennis,
  Nenagh, Adare or Newcastle West.
- Remote leads that pass the Ireland/student checks described below. A remote
  label alone does not mean a job can be done from Ireland.

The advert must indicate part-time work, through its title, description, stated
weekly hours or a source employment-type field. Search keywords, a student category,
evening/weekend shifts, and temporary or seasonal contracts do not establish
part-time hours.

Listings with unknown hours are left out unless **Include jobs with hours not
stated** is ticked under Hours (it is on by default). That adds shop, food,
cleaning, care and warehouse jobs whose advert gives no hours at all, each tagged
"Hours not stated". They can turn out to be full time, so confirm before applying.

Explicit full-time titles, full-time source fields and weekly hours of 30 or more
are excluded. Mixed full-time/part-time descriptions are excluded unless the title
specifically identifies a part-time vacancy. Part-time jobs can still require more
than 20 hours per week, so check the actual schedule before applying.

The bar under the tab carries the hours you are allowed: 20 a week during term and
40 a week in the holiday periods on Stamp 2. That is a reminder, not legal advice.
Check the conditions printed on your own permission before applying.

Two things make this tab find work the rest of the radar missed:

- **Town-level searching.** The national sweep is sorted by date and runs out of
  pages long before a city the size of Limerick gets a fair showing.
- **Search intent.** Local searches help find relevant roles, but cannot establish
  part-time hours. Results must also carry part-time evidence in the advert or
  source employment-type field.

To point this at somewhere else, edit `localSearch.cities` in `config.json` and
change `regionKeys` in `src/views.js`.

## Local brands and employer coverage

The local collector runs targeted part-time searches for 45 brand names, including
Penneys/Primark, Dunnes Stores, Tesco, Lidl, Aldi, Boots, NEXT, H&M, TK Maxx,
Sports Direct, JD Sports, Brown Thomas, McDonald's, Supermac's, Costa, Starbucks,
Applegreen, Circle K and local hotels. Brand searches run separately for Limerick,
Shannon, Ennis and Nenagh. Role searches also cover Dooradoyle, Caherdavin, Corbally, Mungret and Ballysimon.
A further 190 named shops, hospitality and campus employers are searched in Limerick,
based on the Crescent, Castletroy, Parkway and Arthurs Quay directories plus broader
local employer targets. With 33 remote searches, this brings the default plan to 235 local employer names and 921 searches.
The directory inventory and its sources are in `src/local-employers.js`.
These are search targets, not a claim that every brand has a suitable vacancy.

Direct feeds supplement the aggregator: Tesco Ireland, NEXT's own recruitment
system, Kurt Geiger, Frasers Group / Sports Direct and Rituals, alongside the
existing H&M and JYSK boards. NEXT's weekly shift notation (for example `5.50hrs p/w`)
and Workable's employment-type fields are used to identify part-time hours.

Customise `localSearch.brands` and `localSearch.brandCities` in `config.json`.

## Remote part-time leads for students in Ireland

Remote leads appear inside the Part time tab; tick Remote under Working pattern
to see only those. They focus on support, administration, tutoring, data entry,
research assistance and related roles. They require advertised part-time work, a
remote working pattern and a hiring location that includes Ireland. They exclude
senior roles, hybrid work, explicit freelance/self-employed gigs, survey panels
and known schedules above 20 hours/week. A card with no hours tag did not state
its hours, so check with the employer. These are potential matches, not a
guarantee of eligibility, experience fit or compatibility with lectures.

The 33 nationwide searches include role, evening/weekend and named employer
queries (Capita, Cpl, Abtran, Fexco, Amazon, Apple, Concentrix, TELUS Digital,
Wayfair, Shopify, Distilled and LivTours). Search targets do not imply current
vacancies. Distilled's public Recruitee feed also supplies live adverts directly.
Remote boards preserve structured employment types and full descriptions;
missing hiring restrictions are no longer treated as worldwide eligibility.
Remotive's full public feed and up to 500 recent Himalayas listings are checked,
alongside Jobicy and Arbeitnow.

Assessment uses the full source text before storage truncates the excerpt. Older
stored jobs are assessed as they are encountered in a refresh, rather than
guessing eligibility from incomplete cached descriptions. On Stamp 2, check the
[official student work conditions](https://www.irishimmigration.ie/coming-to-study-in-ireland/what-are-my-study-options/planning-to-study-in-ireland/)
and confirm hours, employee status and permission requirements with the employer.
Set `brands` to `[]` to turn off brand searches. `localSearch.shops` and
`localSearch.shopLocation` control the extra local employer targets. `localSites.enabled`
and `jobAlert.enabled` control the new direct-site and independent-board collectors. `tesco.enabled` and
`tesco.maxPages` control the official Tesco collector. The same strict part-time
rules apply to all new sources; unknown hours never qualify through a search term.

## Filters

- **Views.** All Ireland and Part time. The Part time tab looks back 30 days by
  default rather than 14.
- **Region.** All 26 counties of the Republic plus the six in Northern
  Ireland, grouped by province. Each with a live count, and regions with nothing
  in them hidden. Remote and country-wide listings get their own buckets.
- **Visa sponsorship.** The explicit advert signals above.
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
Press Shortlist in the filter bar to see just the ones you kept, and **Export CSV**
writes the current filtered view out to a spreadsheet.

## Keeping it current

While `npm start` is running it refreshes every 45 minutes on its own, and the
**Refresh** button in the top right forces one.

Listings are retained. Explicitly closed adverts and passed closing dates are archived; failed checks and stale verification are unverified. Shortlists, hidden choices and duplicate history are preserved.

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
- `officialEmployers` controls the direct Apple, Amazon, Microsoft, KPMG, Deloitte,
  PwC and EY collectors.
  Each company can be disabled independently in `config.json`.
- `pruneAfterDays` when old verification records are marked unverified. Listings and shortlists are retained; a missing search result does not prove closure.
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
  only when the publisher API is configured. Coverage is not guaranteed.
- publicjobs.ie has no public feed. Public sector roles show up when they are
  advertised elsewhere too, but for civil service competitions specifically, set up
  an alert on publicjobs.ie directly.
- Careerjet's own keyword matching is loose, which is what the match strength filter
  is there to clean up.

### Distance from home and nearby towns

Set `home` in `config.json` (see `config.example.json`) to your own latitude and
longitude. That file is not tracked by git, so the location stays on your machine;
without it no distances are shown. Where the workplace is precise enough, a job
then shows a straight-line distance from home, with a link to check the actual route. An
advertised workplace pin is used when available. Otherwise a known shopping-centre
reference point is used only when that centre is named in the workplace address.
City-only, county-only, ambiguous and unsupported locations show "Exact workplace unknown";
remote work shows "No regular commute stated". No journey time is inferred.
The estimate and its basis are included in CSV exports.

The Limerick part-time view now has an optional nearby-towns checkbox, enabled
initially, for Shannon and Ennis in Clare and Nenagh in Tipperary. It does not
include all jobs in those counties. The selection is saved locally; date,
employment-type and all other filters continue to apply. The API equivalent is
`view=limerick-pt&nearby=1`.

Reference place coordinates are stored in `src/places.json`, so browsing does
not send location requests to an external geocoder. Town points are a small
extract from [GeoNames Ireland](https://download.geonames.org/export/dump/IE.zip),
retrieved 19 September 2026, under [CC BY 4.0](https://www.geonames.org/about.html).
The two shopping-centre
points come from McDonald's public restaurant vacancy map pins. Place points
are approximate and can be revised independently of job history.

`retailEmployers.enabled` and `retailEmployers.providers` control the new direct
collectors. Public search configuration is read from the employer pages; no
personal login credentials are required. Dunnes has a human-verification step
and Aldi restricts automated access, so both remain covered by the existing
brand searches rather than an unreliable direct collector.


## Advert checks and direct employer priority

Sodexo Ireland, Sally Europe and SBFM are collected from their public careers
pages/sitemaps, alongside Old Quarter, JobsIreland and JobAlert. The new public-page
reader respects robots rules, reports denied/failed access and never bypasses a login
or CAPTCHA. Search results and snippets are discovery evidence, not proof of an open
vacancy. Indeed and UL MYCareerPath are manual shortcuts; UL requires the student's
login. No applications are submitted.

An advert becomes `Verified open` only after its detail page and application
entry point have been checked. Login entry points must retain the same vacancy ID.
A generic registration redirect, missing advert, access restriction or failed check
stays `Unverified`. HTTP 404/410, explicit closure and expired deadlines close a job.
Verification ages out after seven days. Posting date, closing date, first seen,
last checked and last successfully verified are separate fields. The default view
includes open and unverified records; use the status filter to see verified jobs or
archived records. Each refresh checks up to `verification.maxPerRefresh` older records,
prioritising malformed titles and local part-time jobs, in addition to direct-source
checks. It does not claim the whole historic database has been reverified.

Hours/availability filters use extracted advert evidence. Unknown hours are excluded
when a maximum is chosen. Availability filters exclude incompatible or variable
stated shift categories; a match is not a guarantee of timetable compatibility.
Conflicting title, metadata and description values remain visible. CE/WPEP schemes
have a separate filter and are excluded from ordinary vacancies.

Identity aliases use employer IDs and vacancy/application URLs, preserving meaningful
query/hash IDs. Genuine duplicates retain source provenance, shortlist notes, hidden
choices and their original records. `node scripts/repair-evidence.js` previews the
local repair; `--apply` performs it, and `--verify` additionally checks priority
adverts. Back up the SQLite database before applying bulk repairs.

Careerjet uses only its [documented publisher API](https://www.careerjet.com/partners/api).
Set `CAREERJET_API_KEY` or `careerjet.apiKey`. Manual refresh passes the actual client
IP and user agent; scheduled collection skips Careerjet because it has no triggering
client. Existing Careerjet attribution/tracking links remain intact, and the UI offers
an attributed Careerjet search shortcut. Publisher access terms must cover your use;
no legacy public endpoint or invented IP is used. Without a key, employer sources and
other configured public feeds still work.

## The hosted site

A public copy is published to GitHub Pages by `.github/workflows/publish.yml`. Every
two hours the workflow collects jobs, runs `npm run build:site` and deploys `dist/`.
There is no server: the page reads exported files and filters them in the browser
(`site/api.js` and `site/static-core.js`, which mirror the queries in `src/db.js`).

What differs from the local app:

- The shortlist and hidden jobs are kept in each visitor's browser.
- There is no Refresh button. The public job history is published, with the same
  date filters as the local app, including Any time. Closed adverts appear only
  under Archived / closed; verification still ages out after seven days.
- Distances are left out, along with anything else personal.
- Careerjet is not collected on a schedule. Previously collected public adverts
  are retained in `data/public-jobs.seed.json.gz`, preserving their attribution
  links. The workflow restores missing history before collecting new adverts,
  without overwriting newer evidence or closure decisions in its cached database.

To update that public seed from the local database, run
`node --no-warnings scripts/export-public-seed.js`. The exporter reads only public
advert fields and source/identity records. It does not export saved jobs, notes,
hidden choices, personal home coordinates, API credentials or configuration.

To preview it locally, run `npm run build:site` and serve `dist/` with any static
file server.

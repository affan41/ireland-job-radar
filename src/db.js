import { DatabaseSync } from 'node:sqlite'
import {createHash} from 'node:crypto'
import { VIEWS, VIEW_BY_KEY, viewClause } from './views.js'
import { studentRole } from './normalise.js'
import {canonicalJobUrl, employerJobKey} from './job-evidence.js'
import { estimateDistance } from './distance.js'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.JOBS_DB || join(ROOT, 'data', 'jobs.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    company         TEXT,
    location_raw    TEXT,
    region_key      TEXT NOT NULL,
    county_name     TEXT,
    province        TEXT,
    url             TEXT NOT NULL,
    source          TEXT NOT NULL,
    source_detail   TEXT,
    description     TEXT,
    salary_text     TEXT,
    salary_min      REAL,
    salary_max      REAL,
    salary_currency TEXT,
    salary_period   TEXT,
    posted_at       TEXT,
    work_mode       TEXT,
    employment_type TEXT DEFAULT 'unspecified',
    profiles        TEXT,
    groups          TEXT,
    score           INTEGER DEFAULT 0,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_region   ON jobs(region_key);
  CREATE INDEX IF NOT EXISTS idx_jobs_posted   ON jobs(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_first    ON jobs(first_seen DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_source   ON jobs(source);

  CREATE TABLE IF NOT EXISTS saved (
    job_id   TEXT PRIMARY KEY,
    note     TEXT,
    saved_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hidden (
    job_id    TEXT PRIMARY KEY,
    hidden_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    added       INTEGER DEFAULT 0,
    refreshed   INTEGER DEFAULT 0,
    scanned     INTEGER DEFAULT 0,
    notes       TEXT
  );

  CREATE TABLE IF NOT EXISTS job_sources (
    job_id        TEXT NOT NULL,
    source        TEXT NOT NULL,
    source_detail TEXT NOT NULL DEFAULT '',
    url           TEXT NOT NULL,
    last_seen     TEXT NOT NULL,
    PRIMARY KEY (job_id, source, source_detail)
  );

  CREATE INDEX IF NOT EXISTS idx_job_sources_source ON job_sources(source);
`)

// Existing databases pre-date some fields. Keep upgrades automatic so a user can
// pull a newer version and start it without rebuilding or losing shortlists.
const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name))
const evidenceColumns = {
  original_title: 'TEXT', title_repair_note: 'TEXT', full_description: 'TEXT', closing_at: 'TEXT', checked_at: 'TEXT', verified_at: 'TEXT',
  verification_status: "TEXT DEFAULT 'unverified'", verification_reason: 'TEXT',
  application_url: 'TEXT', employer_job_id: 'TEXT', hours_min: 'REAL', hours_max: 'REAL',
  hours_evidence: 'TEXT', shifts: 'TEXT', availability: 'TEXT', conflicts: 'TEXT',
  scheme: "TEXT DEFAULT 'ordinary'", location_precision: 'TEXT', title_needs_review: 'INTEGER DEFAULT 0',
  sponsorship_evidence: 'TEXT', sponsorship_source: 'TEXT', merged_into: 'TEXT',
}
for (const [column,type] of Object.entries(evidenceColumns)) if(!jobColumns.has(column)) db.exec(`ALTER TABLE jobs ADD COLUMN ${column} ${type}`)
db.exec('CREATE TABLE IF NOT EXISTS job_identity (alias TEXT PRIMARY KEY, job_id TEXT NOT NULL)')
if (!jobColumns.has('remote_student_note')) db.exec('ALTER TABLE jobs ADD COLUMN remote_student_note TEXT')
for (const column of ['latitude', 'longitude']) {
  if (!jobColumns.has(column)) db.exec(`ALTER TABLE jobs ADD COLUMN ${column} REAL`)
}
if (!jobColumns.has('employment_type')) {
  db.exec("ALTER TABLE jobs ADD COLUMN employment_type TEXT DEFAULT 'unspecified'")
}
if (!jobColumns.has('country')) {
  db.exec("ALTER TABLE jobs ADD COLUMN country TEXT")
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country)")
}
if (!jobColumns.has('career_role')) {
  db.exec('ALTER TABLE jobs ADD COLUMN career_role INTEGER DEFAULT 0')
}
if (!jobColumns.has('student_role')) {
  db.exec('ALTER TABLE jobs ADD COLUMN student_role INTEGER DEFAULT 0')
  const mark = db.prepare('UPDATE jobs SET student_role = 1 WHERE id = ?')
  db.exec('BEGIN')
  for (const row of db.prepare('SELECT id, title FROM jobs').all()) if (studentRole(row.title)) mark.run(row.id)
  db.exec('COMMIT')
}
if (!jobColumns.has('sponsorship')) {
  db.exec("ALTER TABLE jobs ADD COLUMN sponsorship TEXT DEFAULT 'unknown'")
  db.exec("ALTER TABLE jobs ADD COLUMN sponsorship_reasons TEXT")
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_sponsorship ON jobs(sponsorship)")
}

if (!jobColumns.has('verification_status')) db.exec("UPDATE jobs SET sponsorship='unknown', sponsorship_reasons=NULL")

// Seed provenance for databases created before multi-source tracking existed.
db.exec(`
  INSERT OR IGNORE INTO job_sources (job_id, source, source_detail, url, last_seen)
  SELECT id, source, COALESCE(source_detail, ''), url, last_seen FROM jobs
`)

const preferredSource = `
  (CASE excluded.source
    WHEN 'employer' THEN 6
    WHEN 'jobsireland' THEN 5
    WHEN 'acca' THEN 4
    WHEN 'adzuna' THEN 3
    WHEN 'careerjet' THEN 2
    ELSE 1 END)
  >=
  (CASE jobs.source
    WHEN 'employer' THEN 6
    WHEN 'jobsireland' THEN 5
    WHEN 'acca' THEN 4
    WHEN 'adzuna' THEN 3
    WHEN 'careerjet' THEN 2
    ELSE 1 END)
`

const upsertStmt = db.prepare(`
  INSERT INTO jobs (
    id, title, company, location_raw, region_key, county_name, province, country,
    url, source, source_detail, description,
    salary_text, salary_min, salary_max, salary_currency, salary_period,
    posted_at, work_mode, employment_type, career_role, sponsorship, sponsorship_reasons,
    profiles, groups, score, first_seen, last_seen, latitude, longitude, remote_student_note
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    last_seen   = excluded.last_seen,
    latitude    = COALESCE(excluded.latitude, jobs.latitude),
    longitude   = COALESCE(excluded.longitude, jobs.longitude),
    url         = CASE WHEN ${preferredSource} THEN excluded.url ELSE jobs.url END,
    source      = CASE WHEN ${preferredSource} THEN excluded.source ELSE jobs.source END,
    source_detail = CASE WHEN ${preferredSource} THEN excluded.source_detail ELSE jobs.source_detail END,
    salary_text = COALESCE(excluded.salary_text, jobs.salary_text),
    salary_min  = COALESCE(excluded.salary_min,  jobs.salary_min),
    salary_max  = COALESCE(excluded.salary_max,  jobs.salary_max),
    description = COALESCE(NULLIF(excluded.description,''), jobs.description),
    posted_at   = COALESCE(jobs.posted_at, excluded.posted_at),
    -- Re-apply classification so edits to profiles.js reach listings already stored.
    region_key  = excluded.region_key,
    county_name = excluded.county_name,
    province    = excluded.province,
    country     = excluded.country,
    work_mode   = excluded.work_mode,
    remote_student_note = excluded.remote_student_note,
    employment_type = excluded.employment_type,
    career_role = excluded.career_role,
    sponsorship = excluded.sponsorship,
    sponsorship_reasons = excluded.sponsorship_reasons,
    profiles    = excluded.profiles,
    groups      = excluded.groups,
    score       = excluded.score
`)

const existsStmt = db.prepare('SELECT 1 FROM jobs WHERE id = ?')
const upsertSourceStmt = db.prepare(`
  INSERT INTO job_sources (job_id, source, source_detail, url, last_seen)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(job_id, source, source_detail) DO UPDATE SET
    url = excluded.url,
    last_seen = excluded.last_seen
`)

// Returns true when this was a job we had not seen before.
export function identityAliases(j) {
  const aliases = [j.applicationUrl, j.url].map(canonicalJobUrl).filter(Boolean).filter(value=>{const u=new URL(value);return u.hash || [...u.searchParams.keys()].some(k=>/^(?:id|record|jobid|vacancyid|gh_jid|requisitionid)$/i.test(k)) || (u.pathname.split('/').filter(Boolean).length>=2 && !/search|browse-jobs|vacancy-search/i.test(u.pathname))}).map(u=>`url:${u}`)
  const key=employerJobKey(j.applicationUrl)||employerJobKey(j.url)
  if(key)aliases.push(`employer:${key}`)
  else if(j.employerJobId && j.company)aliases.push(`employer:${j.company.toLowerCase()}:${j.employerJobId}`)
  return [...new Set(aliases)]
}
export function mergeJobs(keep, drop) {
  if(keep===drop)return
  const saved=db.prepare('SELECT * FROM saved WHERE job_id=?').get(drop)
  if(saved){const own=db.prepare('SELECT * FROM saved WHERE job_id=?').get(keep);db.prepare('INSERT OR REPLACE INTO saved VALUES (?,?,?)').run(keep,[own?.note,saved.note].filter(Boolean).join('\n')||null,own?.saved_at||saved.saved_at)}
  db.prepare('INSERT OR IGNORE INTO hidden SELECT ?, hidden_at FROM hidden WHERE job_id=?').run(keep,drop)
  db.prepare('INSERT OR IGNORE INTO job_sources SELECT ?,source,source_detail,url,last_seen FROM job_sources WHERE job_id=?').run(keep,drop)
  db.prepare('UPDATE job_identity SET job_id=? WHERE job_id=?').run(keep,drop)
  db.prepare('UPDATE jobs SET merged_into=? WHERE id=?').run(keep,drop)
}
export function upsertJob(input) {
  const aliases=identityAliases(input)
  const owners=[...new Set(aliases.map(a=>db.prepare('SELECT job_id FROM job_identity WHERE alias=?').get(a)?.job_id).filter(Boolean))]
  const previous=db.prepare('SELECT url,application_url,employer_job_id,company FROM jobs WHERE id=?').get(input.id)
  const priorAliases=previous ? identityAliases({url:previous.url,applicationUrl:previous.application_url,employerJobId:previous.employer_job_id,company:previous.company}) : []
  // Identical titles at one workplace can describe separate vacancies. Once
  // both records have distinct vacancy identities, the title hash cannot merge them.
  const distinct=aliases.length && priorAliases.length && !aliases.some(a=>priorAliases.includes(a))
  const fallbackId=distinct ? createHash('sha256').update(aliases[0]).digest('hex').slice(0,24) : input.id
  const j={...input,id:owners[0]||fallbackId}
  for(const other of owners.slice(1))mergeJobs(j.id,other)
  if(j.id!==input.id && previous && !distinct)mergeJobs(j.id,input.id)
  for(const alias of aliases)db.prepare('INSERT OR REPLACE INTO job_identity VALUES (?,?)').run(alias,j.id)
  const existing=db.prepare('SELECT verified_at,verification_status FROM jobs WHERE id=?').get(j.id)
  if(existing?.verified_at && !j.checkedAt) {
    db.prepare('UPDATE jobs SET last_seen=? WHERE id=?').run(j.seenAt,j.id)
    upsertSourceStmt.run(j.id,j.source,j.sourceDetail??'',j.url,j.seenAt)
    return false
  }

  const isNew = !existsStmt.get(j.id)
  upsertStmt.run(
    j.id,
    j.title,
    j.company ?? null,
    j.locationRaw ?? null,
    j.regionKey,
    j.countyName ?? null,
    j.province ?? null,
    j.country ?? null,
    j.url,
    j.source,
    j.sourceDetail ?? null,
    j.description ?? null,
    j.salaryText ?? null,
    j.salaryMin ?? null,
    j.salaryMax ?? null,
    j.salaryCurrency ?? null,
    j.salaryPeriod ?? null,
    j.postedAt ?? null,
    j.workMode ?? null,
    j.employmentType ?? 'unspecified',
    j.careerRole ?? 0,
    j.sponsorship ?? 'unknown',
    (j.sponsorshipReasons || []).join(' · ') || null,
    (j.profiles || []).join(','),
    (j.groups || []).join(','),
    j.score ?? 0,
    j.seenAt,
    j.seenAt,
    j.latitude ?? null,
    j.longitude ?? null,
    j.remoteStudentNote ?? null,
  )
  db.prepare(`UPDATE jobs SET title=?,full_description=?,closing_at=COALESCE(?,closing_at),checked_at=COALESCE(?,checked_at),
    verified_at=COALESCE(?,verified_at),verification_status=?,verification_reason=?,application_url=COALESCE(?,application_url),
    employer_job_id=COALESCE(?,employer_job_id),hours_min=?,hours_max=?,hours_evidence=?,shifts=?,availability=?,conflicts=?,scheme=?,
    location_precision=?,title_needs_review=?,sponsorship_evidence=?,sponsorship_source=?,student_role=? WHERE id=?`).run(
    j.title,j.fullDescription||j.description||'',j.closingAt??null,j.checkedAt??null,j.verifiedAt??null,
    j.verificationStatus||'unverified',j.verificationReason||null,j.applicationUrl??null,j.employerJobId??null,
    j.hoursMin??null,j.hoursMax??null,JSON.stringify(j.hoursEvidence||[]),JSON.stringify(j.shifts||[]),
    (j.availability||[]).join(','),JSON.stringify(j.conflicts||[]),j.scheme||'ordinary',j.locationPrecision??null,
    j.titleNeedsReview?1:0,j.sponsorshipEvidence??null,j.sponsorshipSource??null,j.studentRole?1:0,j.id)
  upsertSourceStmt.run(j.id, j.source, j.sourceDetail ?? '', j.url, j.seenAt)
  return isNew
}

export function startRun() {
  const r = db.prepare('INSERT INTO runs (started_at) VALUES (?)').run(new Date().toISOString())
  return Number(r.lastInsertRowid)
}

export function finishRun(id, { added, refreshed, scanned, notes }) {
  db.prepare(`UPDATE runs SET finished_at = ?, added = ?, refreshed = ?, scanned = ?, notes = ? WHERE id = ?`)
    .run(new Date().toISOString(), added, refreshed, scanned, notes ?? null, id)
}

export function lastRun() {
  return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get() ?? null
}

export function recentRuns(n = 10) {
  return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(n)
}

const SORTS = {
  newest: 'COALESCE(j.posted_at, j.first_seen) DESC',
  found: 'j.first_seen DESC',
  salary: 'COALESCE(j.salary_max, j.salary_min, 0) DESC, COALESCE(j.posted_at, j.first_seen) DESC',
  relevance: 'j.score DESC, COALESCE(j.posted_at, j.first_seen) DESC',
  company: 'j.company COLLATE NOCASE ASC',
}

const UNSTATED_HOURS = "(COALESCE(j.student_role, 0) = 1 AND j.employment_type = 'unspecified')"

// Builds the shared WHERE clause. `skip` names a filter to leave out. FACET_BASE
// leaves out every filter the facet counts vary, so one scan can serve them all.
const FACET_BASE = '*'
function buildWhere(opts = {}, skip = null) {
  const skipped = (name) => skip === FACET_BASE || skip === name
  const where = ["j.merged_into IS NULL", "COALESCE(j.title_needs_review,0)=0"]
  const params = []
  if(opts.status === 'closed') where.push("(j.verification_status='closed' OR (j.closing_at IS NOT NULL AND substr(j.closing_at,1,10)<date('now')))")
  else if(opts.status === 'open') where.push("j.verification_status='open' AND julianday(j.verified_at) >= julianday('now','-7 days') AND (j.closing_at IS NULL OR substr(j.closing_at,1,10)>=date('now'))")
  else if(opts.status === 'unverified') where.push("(j.verification_status='unverified' OR (j.verification_status='open' AND julianday(j.verified_at) < julianday('now','-7 days'))) AND (j.closing_at IS NULL OR substr(j.closing_at,1,10)>=date('now'))")
  else where.push("j.verification_status!='closed' AND (j.closing_at IS NULL OR substr(j.closing_at,1,10)>=date('now'))")
  if(opts.scheme === 'schemes')where.push("j.scheme IN ('ce','wpep')")
  else where.push("COALESCE(j.scheme,'ordinary')='ordinary'")
  if(Number(opts.maxHours)>0){where.push('j.hours_max IS NOT NULL AND j.hours_max<=?');params.push(Number(opts.maxHours))}
  if(opts.availability){where.push("(','||COALESCE(j.availability,'')||',') LIKE ?");params.push(`%,${opts.availability},%`)}
  const unavailable = {weekends:['weekdays','variable'],evenings:['mornings','nights','variable'],weekdays:['weekends','variable']}[opts.availability] || []
  for(const shift of unavailable){where.push("(','||COALESCE(j.availability,'')||',') NOT LIKE ?");params.push(`%,${shift},%`)}
  if(opts.noConflicts)where.push("COALESCE(j.conflicts,'[]')='[]'")

  // The country switch is deliberately not skippable: every other facet count is
  // meant to describe the country you are currently looking at.
  if (skip !== FACET_BASE && opts.countries?.length) {
    where.push(`(j.country IN (${opts.countries.map(() => '?').join(',')})
      OR (j.country IS NULL AND j.region_key = 'remote'))`)
    params.push(...opts.countries)
  }
  // A saved view pins its own location and contract rules on top of whatever the
  // sidebar is asking for.
  if (skip !== FACET_BASE && opts.view) {
    const vc = viewClause(opts.view, opts)
    if (vc) {
      where.push(`(${vc.sql})`)
      params.push(...vc.params)
    }
  }
  if (!skipped('sponsorship') && opts.sponsorship?.length) {
    where.push(`COALESCE(j.sponsorship, 'unknown') IN (${opts.sponsorship.map(() => '?').join(',')})`)
    params.push(...opts.sponsorship)
  }
  if (!skipped('region') && opts.regions?.length) {
    where.push(`j.region_key IN (${opts.regions.map(() => '?').join(',')})`)
    params.push(...opts.regions)
  }
  if (!skipped('region') && opts.provinces?.length) {
    where.push(`j.province IN (${opts.provinces.map(() => '?').join(',')})`)
    params.push(...opts.provinces)
  }
  if (!skipped('group') && opts.groups?.length) {
    where.push(`(${opts.groups.map(() => `(',' || j.groups || ',') LIKE ?`).join(' OR ')})`)
    params.push(...opts.groups.map((g) => `%,${g},%`))
  }
  if (opts.profiles?.length) {
    where.push(`(${opts.profiles.map(() => `(',' || j.profiles || ',') LIKE ?`).join(' OR ')})`)
    params.push(...opts.profiles.map((p) => `%,${p},%`))
  }
  if (!skipped('source') && opts.sources?.length) {
    where.push(`EXISTS (
      SELECT 1 FROM job_sources jsf
      WHERE jsf.job_id = j.id AND jsf.source IN (${opts.sources.map(() => '?').join(',')})
    )`)
    params.push(...opts.sources)
  }
  if (!skipped('mode') && opts.workModes?.length) {
    where.push(`j.work_mode IN (${opts.workModes.map(() => '?').join(',')})`)
    params.push(...opts.workModes)
  }
  if (!skipped('employmentType') && opts.employmentTypes?.length) {
    where.push(`j.employment_type IN (${opts.employmentTypes.map(() => '?').join(',')})`)
    params.push(...opts.employmentTypes)
  }
  if (opts.q) {
    where.push('(j.title LIKE ? OR j.company LIKE ? OR j.description LIKE ?)')
    const like = `%${opts.q}%`
    params.push(like, like, like)
  }
  if (Number(opts.salaryMin) > 0) {
    where.push('COALESCE(j.salary_max, j.salary_min) >= ?')
    params.push(Number(opts.salaryMin))
  }
  if (Number(opts.days) > 0) {
    where.push(`COALESCE(j.posted_at, j.first_seen) >= ?`)
    params.push(new Date(Date.now() - Number(opts.days) * 86400000).toISOString())
  }
  if (Number(opts.minScore) > 0) {
    // Jobs let in for their title alone never earned a match score, because the
    // student categories need part-time evidence. Do not let the score drop them.
    const relax = opts.includeUnstated && (skip === FACET_BASE || VIEW_BY_KEY[opts.view]?.unstatedHours)
    where.push(relax ? `(j.score >= ? OR ${UNSTATED_HOURS})` : 'j.score >= ?')
    params.push(Number(opts.minScore))
  }
  if (opts.savedOnly) where.push('s.job_id IS NOT NULL')
  if (!opts.includeHidden) where.push('h.job_id IS NULL')

  return {
    clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

const JOINS = `FROM jobs j
  LEFT JOIN saved  s ON s.job_id = j.id
  LEFT JOIN hidden h ON h.job_id = j.id`

export function effectiveStatus(j, now=Date.now()) {
  if(j.verification_status==='closed' || (j.closing_at && j.closing_at.slice(0,10)<new Date(now).toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'})))return 'closed'
  if(j.verification_status==='open' && Date.parse(j.verified_at)>=now-7*86400000)return 'open'
  return 'unverified'
}
export function queryJobs(opts = {}) {
  const { clause, params } = buildWhere(opts)
  const order = SORTS[opts.sort] || SORTS.newest
  const limit = Math.min(Number(opts.limit) || 60, 300)
  const offset = Math.max(Number(opts.offset) || 0, 0)

  const total = db.prepare(`SELECT COUNT(*) AS n ${JOINS} ${clause}`).get(...params).n
  const rows = db.prepare(`
    SELECT j.*, (s.job_id IS NOT NULL) AS is_saved, s.note AS note,
      (SELECT GROUP_CONCAT(DISTINCT js.source) FROM job_sources js WHERE js.job_id = j.id) AS available_sources
    ${JOINS} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return { total, rows: rows.map(j => ({ ...j, verification_status: effectiveStatus(j), distance: estimateDistance(j) })), limit, offset }
}

// One advert in full, for the reading pane.
export function getJob(id) {
  const j = db.prepare(`
    SELECT j.*, (s.job_id IS NOT NULL) AS is_saved, s.note AS note,
      (SELECT GROUP_CONCAT(DISTINCT js.source) FROM job_sources js WHERE js.job_id = j.id) AS available_sources
    FROM jobs j LEFT JOIN saved s ON s.job_id = j.id WHERE j.id = ?
  `).get(id)
  return j ? { ...j, verification_status: effectiveStatus(j), distance: estimateDistance(j) } : null
}

// Counts for every filter option, across the whole result set rather than the
// current page. Each dimension ignores its own filter, so the sidebar shows what
// you would get if you changed only that one thing.
//
// One scan fetches every row that passes the filters no count varies, and the
// rest is tallied here. Running a query per dimension rescanned the table a
// dozen times on every click.
export function facets(opts = {}) {
  const { clause, params } = buildWhere(opts, FACET_BASE)
  const views = VIEWS.map((v) => ({ key: v.key, clause: viewClause(v.key, opts) }))
  const viewColumns = views.map((v, i) => `, ${v.clause ? `(${v.clause.sql})` : '1'} AS view_${i}`).join('')
  const rows = db.prepare(`
    SELECT j.region_key, j.province, j.groups, j.work_mode, j.employment_type, j.country, j.score,
      COALESCE(j.sponsorship, 'unknown') AS sponsorship,
      (SELECT GROUP_CONCAT(DISTINCT js.source) FROM job_sources js WHERE js.job_id = j.id) AS sources
      ${viewColumns}
    ${JOINS} ${clause}
  `).all(...views.flatMap((v) => v.clause?.params || []), ...params)

  const chosen = (values) => (values?.length ? new Set(values) : null)
  const want = {
    sponsorship: chosen(opts.sponsorship),
    regions: chosen(opts.regions),
    provinces: chosen(opts.provinces),
    groups: chosen(opts.groups),
    sources: chosen(opts.sources),
    modes: chosen(opts.workModes),
    types: chosen(opts.employmentTypes),
    countries: chosen(opts.countries),
  }
  const currentView = views.findIndex((v) => v.key === opts.view && v.clause)
  const minScore = Number(opts.minScore) || 0

  const out = { byView: {}, byRegion: {}, byGroup: {}, bySource: {}, byCountry: {}, byMode: {}, byEmploymentType: {}, bySponsorship: {} }
  for (const v of VIEWS) out.byView[v.key] = 0
  const bump = (bucket, key) => { bucket[key] = (bucket[key] || 0) + 1 }

  for (const r of rows) {
    const groups = r.groups ? r.groups.split(',').filter(Boolean) : []
    const sources = r.sources ? r.sources.split(',') : []
    const pass = {
      sponsorship: !want.sponsorship || want.sponsorship.has(r.sponsorship),
      region: (!want.regions || want.regions.has(r.region_key)) && (!want.provinces || want.provinces.has(r.province)),
      group: !want.groups || groups.some((g) => want.groups.has(g)),
      source: !want.sources || sources.some((s) => want.sources.has(s)),
      mode: !want.modes || want.modes.has(r.work_mode),
      type: !want.types || want.types.has(r.employment_type),
    }
    const failed = Object.keys(pass).filter((k) => !pass[k])
    if (failed.length > 1) continue
    const all = failed.length === 0
    const only = failed[0]

    const inCountry = !want.countries || want.countries.has(r.country) || (r.country == null && r.region_key === 'remote')

    // Only a view that takes unstated hours may count a row below the match score.
    const scored = r.score >= minScore
    if (all) {
      // The Ireland tab shows its total independently of the selected saved view,
      // and each view tab ignores the country switch.
      if (scored && (r.country === 'ie' || (r.country == null && r.region_key === 'remote'))) bump(out.byCountry, r.country ?? 'unknown')
      views.forEach((v, i) => { if (r[`view_${i}`] && (scored || VIEW_BY_KEY[v.key].unstatedHours)) out.byView[v.key]++ })
    }

    if (!inCountry || (currentView >= 0 && !r[`view_${currentView}`])) continue
    if (!scored && !VIEW_BY_KEY[opts.view]?.unstatedHours) continue
    if (all || only === 'region') bump(out.byRegion, r.region_key ?? 'unspecified')
    if (all || only === 'group') for (const g of groups) bump(out.byGroup, g)
    if (all || only === 'source') for (const s of sources) bump(out.bySource, s)
    if (all || only === 'mode') bump(out.byMode, r.work_mode ?? 'unspecified')
    if (all || only === 'type') bump(out.byEmploymentType, r.employment_type ?? 'unspecified')
    if (all || only === 'sponsorship') bump(out.bySponsorship, r.sponsorship)
  }
  return out
}

export function setSaved(jobId, saved, note) {
  if (saved) {
    db.prepare('INSERT INTO saved (job_id, note, saved_at) VALUES (?,?,?) ON CONFLICT(job_id) DO UPDATE SET note = excluded.note')
      .run(jobId, note ?? null, new Date().toISOString())
  } else {
    db.prepare('DELETE FROM saved WHERE job_id = ?').run(jobId)
  }
}

export function setHidden(jobId, hidden) {
  if (hidden) {
    db.prepare('INSERT OR IGNORE INTO hidden (job_id, hidden_at) VALUES (?,?)').run(jobId, new Date().toISOString())
  } else {
    db.prepare('DELETE FROM hidden WHERE job_id = ?').run(jobId)
  }
}

export function stats() {
  const since = new Date(Date.now() - 86400000).toISOString()
  const r = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(s.job_id IS NOT NULL), 0) AS saved,
      COALESCE(SUM(j.first_seen >= ?), 0) AS fresh
    FROM jobs j LEFT JOIN saved s ON s.job_id = j.id
    WHERE j.merged_into IS NULL AND (j.country = 'ie' OR (j.country IS NULL AND j.region_key = 'remote'))`).get(since)
  return { total: r.total, saved: r.saved, newLast24h: r.fresh }
}

// Missing from discovery does not prove closure. Preserve records and shortlists;
// only explicit checks/deadlines close adverts. Old verification becomes unknown.
export function pruneStale(days = 21) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const r=db.prepare("UPDATE jobs SET verification_status='unverified',verification_reason='Previous verification is stale' WHERE verification_status='open' AND verified_at<?").run(cutoff)
  return Number(r.changes)
}

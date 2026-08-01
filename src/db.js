import { DatabaseSync } from 'node:sqlite'
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
if (!jobColumns.has('employment_type')) {
  db.exec("ALTER TABLE jobs ADD COLUMN employment_type TEXT DEFAULT 'unspecified'")
}

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
    id, title, company, location_raw, region_key, county_name, province,
    url, source, source_detail, description,
    salary_text, salary_min, salary_max, salary_currency, salary_period,
    posted_at, work_mode, employment_type, profiles, groups, score, first_seen, last_seen
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    last_seen   = excluded.last_seen,
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
    work_mode   = excluded.work_mode,
    employment_type = excluded.employment_type,
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
export function upsertJob(j) {
  const isNew = !existsStmt.get(j.id)
  upsertStmt.run(
    j.id,
    j.title,
    j.company ?? null,
    j.locationRaw ?? null,
    j.regionKey,
    j.countyName ?? null,
    j.province ?? null,
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
    (j.profiles || []).join(','),
    (j.groups || []).join(','),
    j.score ?? 0,
    j.seenAt,
    j.seenAt,
  )
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

// Builds the shared WHERE clause. `skip` names a filter to leave out, which is how
// each facet counts what you would get if you changed only that one filter.
function buildWhere(opts = {}, skip = null) {
  const where = []
  const params = []

  if (skip !== 'region' && opts.regions?.length) {
    where.push(`j.region_key IN (${opts.regions.map(() => '?').join(',')})`)
    params.push(...opts.regions)
  }
  if (skip !== 'region' && opts.provinces?.length) {
    where.push(`j.province IN (${opts.provinces.map(() => '?').join(',')})`)
    params.push(...opts.provinces)
  }
  if (skip !== 'group' && opts.groups?.length) {
    where.push(`(${opts.groups.map(() => `(',' || j.groups || ',') LIKE ?`).join(' OR ')})`)
    params.push(...opts.groups.map((g) => `%,${g},%`))
  }
  if (opts.profiles?.length) {
    where.push(`(${opts.profiles.map(() => `(',' || j.profiles || ',') LIKE ?`).join(' OR ')})`)
    params.push(...opts.profiles.map((p) => `%,${p},%`))
  }
  if (skip !== 'source' && opts.sources?.length) {
    where.push(`EXISTS (
      SELECT 1 FROM job_sources jsf
      WHERE jsf.job_id = j.id AND jsf.source IN (${opts.sources.map(() => '?').join(',')})
    )`)
    params.push(...opts.sources)
  }
  if (skip !== 'mode' && opts.workModes?.length) {
    where.push(`j.work_mode IN (${opts.workModes.map(() => '?').join(',')})`)
    params.push(...opts.workModes)
  }
  if (skip !== 'employmentType' && opts.employmentTypes?.length) {
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
    where.push('j.score >= ?')
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

  return { total, rows, limit, offset }
}

// Counts for every filter option, across the whole result set rather than the
// current page. Each dimension ignores its own filter, so the sidebar shows what
// you would get if you changed only that one thing.
export function facets(opts = {}) {
  const tally = (skip, column) => {
    const { clause, params } = buildWhere(opts, skip)
    const rows = db.prepare(`SELECT ${column} AS v, COUNT(*) AS n ${JOINS} ${clause} GROUP BY ${column}`).all(...params)
    return Object.fromEntries(rows.map((r) => [r.v ?? 'unspecified', r.n]))
  }

  // groups is a comma separated list, so it has to be counted in JavaScript.
  const byGroup = {}
  {
    const { clause, params } = buildWhere(opts, 'group')
    for (const r of db.prepare(`SELECT j.groups AS g ${JOINS} ${clause}`).all(...params)) {
      for (const g of String(r.g || '').split(',').filter(Boolean)) byGroup[g] = (byGroup[g] || 0) + 1
    }
  }

  const bySource = {}
  {
    const { clause, params } = buildWhere(opts, 'source')
    const rows = db.prepare(`
      SELECT js.source AS v, COUNT(DISTINCT j.id) AS n
      ${JOINS}
      JOIN job_sources js ON js.job_id = j.id
      ${clause}
      GROUP BY js.source
    `).all(...params)
    for (const r of rows) bySource[r.v] = r.n
  }

  return {
    byRegion: tally('region', 'j.region_key'),
    byGroup,
    bySource,
    byMode: tally('mode', 'j.work_mode'),
    byEmploymentType: tally('employmentType', 'j.employment_type'),
  }
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
  const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
  const saved = db.prepare('SELECT COUNT(*) AS n FROM saved').get().n
  const since = new Date(Date.now() - 86400000).toISOString()
  const fresh = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE first_seen >= ?').get(since).n
  return { total, saved, newLast24h: fresh }
}

// Listings nobody has re-advertised in a fortnight are almost always filled.
export function pruneStale(days = 21) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  db.prepare('DELETE FROM job_sources WHERE last_seen < ?').run(cutoff)
  const r = db.prepare('DELETE FROM jobs WHERE last_seen < ? AND id NOT IN (SELECT job_id FROM saved)').run(cutoff)
  db.exec('DELETE FROM job_sources WHERE job_id NOT IN (SELECT id FROM jobs)')
  return Number(r.changes)
}

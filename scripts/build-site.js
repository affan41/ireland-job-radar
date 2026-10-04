// Builds the hosted site into dist/: the page from public/, the browser data
// layer from site/, and the current jobs exported as static files.
//
// Nothing personal is exported: no shortlist, no hidden list, no home location
// or distances. Only adverts from the last WINDOW_DAYS days are included.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, effectiveStatus, lastRun } from '../src/db.js'
import { VIEWS, viewClause } from '../src/views.js'
import { allRegions, PROVINCE_ORDER, COUNTRIES } from '../src/regions.js'
import { SPONSORSHIP_LEVELS, PERMIT_NOTES } from '../src/sponsorship.js'
import { GROUPS } from '../src/profiles.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const WINDOW_DAYS = 30

rmSync(DIST, { recursive: true, force: true })
cpSync(join(ROOT, 'public'), DIST, { recursive: true })
cpSync(join(ROOT, 'site'), DIST, { recursive: true })
mkdirSync(join(DIST, 'data', 'detail'), { recursive: true })
writeFileSync(join(DIST, '.nojekyll'), '')

// The distance note names the owner's home area; the hosted page has no distances.
const indexFile = join(DIST, 'index.html')
writeFileSync(indexFile, readFileSync(indexFile, 'utf8').replace(/\s*<p id="distanceNote">[\s\S]*?<\/p>/, ''))

const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
const stored = db.prepare(`
  SELECT j.*, (SELECT GROUP_CONCAT(DISTINCT js.source) FROM job_sources js WHERE js.job_id = j.id) AS available_sources
  FROM jobs j
  WHERE j.merged_into IS NULL AND COALESCE(j.title_needs_review, 0) = 0
    AND (j.country = 'ie' OR (j.country IS NULL AND j.region_key = 'remote'))
    AND COALESCE(j.posted_at, j.first_seen) >= ?
`).all(since)

// Which jobs each view takes, for every combination of its two options. The bit
// order matches viewBit in site/static-core.js: nearby is 1, unstated hours is 2.
const membership = {}
for (const v of VIEWS) {
  membership[v.key] = [0, 1, 2, 3].map((bits) => {
    const c = viewClause(v.key, { includeNearby: Boolean(bits & 1), includeUnstated: Boolean(bits & 2) })
    return new Set(db.prepare(`SELECT j.id FROM jobs j WHERE ${c.sql}`).all(...c.params).map((r) => r.id))
  })
}

const LIST_FIELDS = ['id', 'title', 'company', 'location_raw', 'county_name', 'region_key', 'province', 'country', 'url',
  'source', 'source_detail', 'available_sources', 'salary_text', 'salary_min', 'salary_max', 'salary_currency',
  'posted_at', 'first_seen', 'work_mode', 'employment_type', 'groups', 'score', 'sponsorship', 'sponsorship_reasons',
  'sponsorship_evidence', 'sponsorship_source', 'closing_at', 'verified_at', 'hours_min', 'hours_max', 'shifts',
  'availability', 'conflicts', 'scheme', 'student_role', 'remote_student_note', 'title_repair_note', 'original_title']

const jobs = []
const detail = {}
for (const j of stored) {
  const status = effectiveStatus(j)
  // Closed adverts are no use to a visitor, so they are left out entirely.
  if (status === 'closed') continue
  const row = Object.fromEntries(LIST_FIELDS.filter((k) => j[k] != null && j[k] !== '').map((k) => [k, j[k]]))
  row.verification_status = status
  row.description = j.description && j.description.length > 320 ? `${j.description.slice(0, 320)}…` : j.description || undefined
  const views = {}
  for (const v of VIEWS) {
    const bits = membership[v.key].reduce((n, set, i) => n | (set.has(j.id) ? 1 << i : 0), 0)
    if (bits) views[v.key] = bits
  }
  if (Object.keys(views).length) row.views = views
  jobs.push(row)

  const prefix = j.id.slice(0, 2)
  ;(detail[prefix] ||= {})[j.id] = {
    full_description: j.full_description || '',
    application_url: j.application_url || undefined,
    verification_reason: j.verification_reason || undefined,
  }
}

writeFileSync(join(DIST, 'data', 'jobs.json'), JSON.stringify(jobs))
for (const [prefix, bucket] of Object.entries(detail)) writeFileSync(join(DIST, 'data', 'detail', `${prefix}.json`), JSON.stringify(bucket))

writeFileSync(join(DIST, 'data', 'meta.json'), JSON.stringify({
  regions: allRegions().filter((r) => !r.country || r.country === 'ie'),
  provinceOrder: PROVINCE_ORDER.filter((p) => !['Cyprus', 'Malta'].includes(p)),
  countries: COUNTRIES.filter((c) => c.code === 'ie').map((c) => ({ code: c.code, name: c.name })),
  views: VIEWS.map((v) => ({ key: v.key, name: v.name, country: v.country, note: v.note, noteLink: v.noteLink, defaultDays: v.defaultDays, unstatedHours: Boolean(v.unstatedHours) })),
  sponsorshipLevels: SPONSORSHIP_LEVELS,
  permitNotes: { ie: PERMIT_NOTES.ie },
  groups: GROUPS,
  lastRun: lastRun(),
  windowDays: WINDOW_DAYS,
}))

const size = (file) => `${(readFileSync(join(DIST, 'data', file)).length / 1024).toFixed(0)} KB`
console.log(`Built dist/ with ${jobs.length} jobs from the last ${WINDOW_DAYS} days (jobs.json ${size('jobs.json')}, ${Object.keys(detail).length} detail files)`)

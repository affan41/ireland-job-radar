// Public advert data only. Personal tables and configuration never enter a seed.
export const PUBLIC_JOB_FIELDS = [
  'id', 'title', 'company', 'location_raw', 'region_key', 'county_name', 'province', 'country',
  'url', 'source', 'source_detail', 'description', 'salary_text', 'salary_min', 'salary_max',
  'salary_currency', 'salary_period', 'posted_at', 'work_mode', 'employment_type',
  'career_role', 'sponsorship', 'sponsorship_reasons', 'groups', 'score', 'first_seen', 'last_seen',
  'remote_student_note', 'full_description', 'closing_at', 'checked_at', 'verified_at',
  'verification_status', 'verification_reason', 'application_url', 'employer_job_id',
  'hours_min', 'hours_max', 'hours_evidence', 'shifts', 'availability', 'conflicts', 'scheme',
  'location_precision', 'sponsorship_evidence', 'sponsorship_source', 'original_title',
  'title_repair_note', 'student_role',
]

export function publicJobSnapshot(db) {
  const jobs = db.prepare(`SELECT ${PUBLIC_JOB_FIELDS.join(', ')} FROM jobs
    WHERE merged_into IS NULL AND COALESCE(title_needs_review, 0) = 0
      AND (country = 'ie' OR (country IS NULL AND region_key = 'remote')) ORDER BY id`).all()
  const ids = new Set(jobs.map((j) => j.id))
  return {
    version: 1,
    jobs,
    sources: db.prepare('SELECT job_id, source, source_detail, url, last_seen FROM job_sources').all().filter((r) => ids.has(r.job_id)),
    identities: db.prepare('SELECT alias, job_id FROM job_identity').all().filter((r) => ids.has(r.job_id)),
  }
}

// Fill gaps without replacing fresher hosted evidence, including closed adverts.
export function seedPublicJobs(db, snapshot) {
  if (snapshot.version !== 1 || !Array.isArray(snapshot.jobs)) throw new Error('Unsupported public job seed')
  const knownColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name))
  const columns = PUBLIC_JOB_FIELDS.filter((f) => knownColumns.has(f))
  const insert = db.prepare(`INSERT OR IGNORE INTO jobs (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
  const owner = db.prepare('SELECT job_id FROM job_identity WHERE alias = ?')
  const source = db.prepare('INSERT OR IGNORE INTO job_sources (job_id,source,source_detail,url,last_seen) VALUES (?,?,?,?,?)')
  const identity = db.prepare('INSERT OR IGNORE INTO job_identity (alias,job_id) VALUES (?,?)')
  const aliases = new Map()
  for (const r of snapshot.identities || []) {
    if (!aliases.has(r.job_id)) aliases.set(r.job_id, [])
    aliases.get(r.job_id).push(r.alias)
  }
  const imported = new Map()
  let added = 0
  db.exec('BEGIN')
  try {
    for (const j of snapshot.jobs) {
      if (!(j.country === 'ie' || (j.country == null && j.region_key === 'remote'))) continue
      const id = (aliases.get(j.id) || []).map((a) => owner.get(a)?.job_id).find(Boolean) || j.id
      added += Number(insert.run(...columns.map((f) => f === 'id' ? id : j[f] ?? null)).changes)
      imported.set(j.id, id)
    }
    for (const r of snapshot.sources || []) if (imported.has(r.job_id)) source.run(imported.get(r.job_id), r.source, r.source_detail || '', r.url, r.last_seen)
    for (const r of snapshot.identities || []) if (imported.has(r.job_id)) identity.run(r.alias, imported.get(r.job_id))
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return added
}

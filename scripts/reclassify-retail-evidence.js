// Recompute labels and view membership from the current cached full evidence.
// Preserve status, verification dates, personal choices and the original history.
import { db, upsertJob } from '../src/db.js'
import { buildJob, studentRole } from '../src/normalise.js'
import { storedRaw } from '../src/verify-jobs.js'
let updated = 0
try {
  for (const row of db.prepare('SELECT * FROM jobs WHERE merged_into IS NULL').all()) {
    if (!studentRole(row.title) && !/full.{0,15}part.{0,8}time/i.test(row.title)) continue
    const evidence=JSON.parse(row.hours_evidence||'[]')
    const metadata=row.source_metadata||[row.employment_type,...evidence.filter(h=>h.source==='metadata').map(h=>h.text)].filter(Boolean).join(' ')
    const job=buildJob({...storedRaw(row),metadata,checkedAt:row.checked_at,verifiedAt:row.verified_at,
      verificationStatus:row.verification_status,verificationReason:row.verification_reason},row.last_seen)
    if (!job) continue
    job.id=row.id
    upsertJob(job);updated++
  }
  console.log(`Reclassified ${updated} retail and hospitality adverts from their stored evidence`)
} finally { db.close() }

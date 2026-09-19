// One-time repair for records collected before the stricter part-time rules.
// Dry run by default; --apply creates a database backup before making changes.
// Historical records store snippets, not the original structured source fields.
// Preserve full-time exclusions and employer/government part-time classifications
// when no contrary evidence survives in the stored text.
import { backup } from 'node:sqlite'
import { join } from 'node:path'
import { db } from '../src/db.js'
import { detectEmploymentType } from '../src/employment.js'

const changes = []
for (const row of db.prepare('SELECT id, title, description, employment_type, source, groups, profiles FROM jobs').all()) {
  const trustedType = row.employment_type === 'full_time'
    || ['employer', 'jobsireland'].includes(row.source) ? row.employment_type : undefined
  const type = detectEmploymentType(row.title, row.description, trustedType)
  const groups = String(row.groups || '').split(',').filter(Boolean)
  const profiles = String(row.profiles || '').split(',').filter(Boolean)
  const nextGroups = (type === 'part_time' ? groups : groups.filter(g => g !== 'student')).join(',')
  const nextProfiles = (type === 'part_time' ? profiles : profiles.filter(p => !p.startsWith('student'))).join(',')
  if (type !== row.employment_type || nextGroups !== (row.groups || '') || nextProfiles !== (row.profiles || '')) {
    changes.push({id: row.id, type, groups: nextGroups, profiles: nextProfiles})
  }
}
console.log(`${changes.length} stored records need employment/category corrections.`)
if (process.argv.includes('--apply')) {
  const backupPath = join(process.cwd(), 'data', `jobs-before-employment-fix-${Date.now()}.db`)
  await backup(db, backupPath)
  const update = db.prepare('UPDATE jobs SET employment_type = ?, groups = ?, profiles = ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    for (const row of changes) update.run(row.type, row.groups, row.profiles, row.id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  console.log(`Applied corrections. Backup: ${backupPath}`)
}

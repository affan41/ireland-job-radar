// Recomputes country and sponsorship for listings already in the database, so
// adding a country or changing the sponsorship rules does not mean waiting for
// every job to be seen again by a refresh.
//
//   npm run backfill

import { db } from '../src/db.js'
import { resolveRegion, countryFallback, detectWorkMode } from '../src/regions.js'
import { assessSponsorship } from '../src/sponsorship.js'
import { SENIOR_TITLE } from '../src/normalise.js'
import { classify } from '../src/profiles.js'

const rows = db.prepare('SELECT id, title, company, description, location_raw, source, groups, profiles, score, work_mode FROM jobs').all()

const update = db.prepare(`
  UPDATE jobs SET
    region_key = ?, county_name = ?, province = ?, country = ?,
    sponsorship = ?, sponsorship_reasons = ?
  WHERE id = ?
`)

// A search's intent is not stored, so it cannot be recomputed here. What can be
// undone is intent that should never have been granted: a senior title that only
// carries a student category because a broad "part time" search returned it.
const declassify = db.prepare('UPDATE jobs SET groups = ?, profiles = ?, score = ? WHERE id = ?')
const setCareer = db.prepare('UPDATE jobs SET career_role = ? WHERE id = ?')
// Work mode is re-read too, because "remote location" in a rural advert used to be
// misread as remote working.
const setMode = db.prepare('UPDATE jobs SET work_mode = ? WHERE id = ?')

let changed = 0
let demoted = 0
let remodelled = 0
const byCountry = {}
const bySponsorship = {}

db.exec('BEGIN')
try {
  for (const r of rows) {
    let region = resolveRegion(r.location_raw)
    if (region.regionKey === 'unknown' && region.country) region = countryFallback(region.country)

    const s = assessSponsorship({
      title: r.title,
      description: r.description,
      company: r.company,
      source: r.source,
      country: region.country ?? null,
    })

    update.run(
      region.regionKey,
      region.countyName ?? null,
      region.province ?? null,
      region.country ?? null,
      s.level,
      s.reasons.join(' · ') || null,
      r.id,
    )

    const mode = detectWorkMode(r.title, r.description, r.location_raw)
    if (mode !== r.work_mode) { setMode.run(mode, r.id); remodelled++ }

    const career = SENIOR_TITLE.test(r.title) ? 1 : 0
    setCareer.run(career, r.id)

    if (career) {
      const groups = String(r.groups || '').split(',').filter(Boolean)
      if (groups.includes('student')) {
        const honest = classify(r.title, r.description)
        // Keep it only if the title itself earns a student category.
        if (!honest.groups.includes('student')) {
          declassify.run(
            honest.groups.join(','),
            honest.profiles.join(','),
            honest.score,
            r.id,
          )
          demoted++
        }
      }
    }

    changed++
    byCountry[region.country ?? 'unknown'] = (byCountry[region.country ?? 'unknown'] || 0) + 1
    bySponsorship[s.level] = (bySponsorship[s.level] || 0) + 1
  }
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  throw err
}

console.log(`Reclassified ${changed} listings`)
console.log(`  senior titles removed from the student categories: ${demoted}`)
console.log(`  work mode corrected: ${remodelled}`)
console.log('  by country:     ', byCountry)
console.log('  by sponsorship: ', bySponsorship)

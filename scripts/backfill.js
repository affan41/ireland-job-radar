// Recomputes country and sponsorship for listings already in the database, so
// adding a country or changing the sponsorship rules does not mean waiting for
// every job to be seen again by a refresh.
//
//   npm run backfill

import { db } from '../src/db.js'
import { resolveRegion, countryFallback } from '../src/regions.js'
import { assessSponsorship } from '../src/sponsorship.js'

const rows = db.prepare('SELECT id, title, company, description, location_raw, source FROM jobs').all()

const update = db.prepare(`
  UPDATE jobs SET
    region_key = ?, county_name = ?, province = ?, country = ?,
    sponsorship = ?, sponsorship_reasons = ?
  WHERE id = ?
`)

let changed = 0
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
console.log('  by country:     ', byCountry)
console.log('  by sponsorship: ', bySponsorship)

// Refresh the screenshot employers before publishing code updates, without a
// full multi-source refresh. Ordinary scheduled runs also collect these feeds.
import { fetchBestseller, fetchSostreneGrene } from '../src/sources/fashion.js'
import { fetchSupermacs } from '../src/sources/retail.js'
import { buildJob } from '../src/normalise.js'
import { db, upsertJob } from '../src/db.js'

const seenAt = new Date().toISOString()
let stored = 0
try {
  for (const [name, collect] of [['BESTSELLER', fetchBestseller], ['Søstrene Grene', fetchSostreneGrene], ["Supermac's", fetchSupermacs]]) {
    try {
      const result = await collect({ onProgress: console.log })
      let accepted = 0
      for (const raw of result.jobs) {
        const job = buildJob(raw, seenAt)
        if (!job || !job.score) continue
        upsertJob(job); accepted++; stored++
      }
      console.log(`${name}: stored ${accepted} relevant adverts`)
      for (const error of result.errors) console.warn(error)
    } catch (error) { console.warn(`${name}: ${error.message}`) }
  }
  console.log(`Stored ${stored} adverts from the featured employers`)
} finally { db.close() }

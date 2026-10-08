import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { db } from '../src/db.js'
import { seedPublicJobs } from '../src/public-jobs.js'

const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../data/public-jobs.seed.json.gz', import.meta.url))))
console.log(`Added ${seedPublicJobs(db, snapshot)} missing public adverts to the hosted database`)
db.close()

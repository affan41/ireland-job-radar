import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { publicJobSnapshot } from '../src/public-jobs.js'

const source = process.env.JOBS_DB || fileURLToPath(new URL('../data/jobs.db', import.meta.url))
const output = process.argv[2] || fileURLToPath(new URL('../data/public-jobs.seed.json.gz', import.meta.url))
const db = new DatabaseSync(source, { readOnly: true })
const snapshot = publicJobSnapshot(db)
db.close()
const bytes = gzipSync(JSON.stringify(snapshot))
writeFileSync(output, bytes)
console.log(`Exported ${snapshot.jobs.length} public adverts (${bytes.length} compressed bytes)`)

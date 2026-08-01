import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_COMPANIES } from './sources/ats.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'config.json')

const defaults = {
  port: 8099,
  refreshMinutes: 45,
  refreshOnStart: true,
  pruneAfterDays: 30,
  careerjet: { enabled: true, maxPages: 3, affid: null },
  accaCareers: { enabled: true, maxPages: 25 },
  adzuna: { enabled: true, appId: null, appKey: null, maxPages: 2 },
  jobsIreland: { enabled: true, latestPageSize: 250, latestPages: 4, partTimeLimit: 250 },
  employers: { enabled: true, companies: DEFAULT_COMPANIES },
  remoteBoards: { enabled: true },
}

function deepMerge(base, extra) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v
  }
  return out
}

let fileConfig = {}
if (existsSync(FILE)) {
  try {
    fileConfig = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch (err) {
    console.error(`config.json is not valid JSON, ignoring it: ${err.message}`)
  }
}

export const config = deepMerge(defaults, fileConfig)

// Environment variables win, so you can keep keys out of the config file.
if (process.env.PORT) config.port = Number(process.env.PORT)
if (process.env.ADZUNA_APP_ID) config.adzuna.appId = process.env.ADZUNA_APP_ID
if (process.env.ADZUNA_APP_KEY) config.adzuna.appKey = process.env.ADZUNA_APP_KEY
if (process.env.CAREERJET_AFFID) config.careerjet.affid = process.env.CAREERJET_AFFID

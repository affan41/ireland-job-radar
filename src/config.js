import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_COMPANIES } from './sources/ats.js'
import { MNC_EMPLOYERS } from './mncs.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'config.json')

const defaults = {
  port: 8099,
  refreshMinutes: 45,
  // Which countries to collect. Ireland is home; Cyprus and Malta are the other
  // two English-speaking EU markets that hire third-country nationals into finance.
  countries: ['ie', 'cy', 'mt'],
  refreshOnStart: true,
  pruneAfterDays: 30,
  careerjet: { enabled: true, maxPages: 12, affid: null },
  accaCareers: { enabled: true, maxPages: 40 },
  adzuna: { enabled: true, appId: null, appKey: null, maxPages: 8 },
  jobsIreland: { enabled: true, latestPageSize: 250, latestPages: 8, partTimeLimit: 500 },
  officialEmployers: {
    enabled: true,
    apple: true,
    amazon: true,
    microsoft: true,
    kpmg: true,
    deloitte: true,
    pwc: true,
    ey: true,
    appleMaxPages: 10,
    amazonMaxPages: 10,
    microsoftMaxPages: 10,
    kpmgMaxPages: 10,
    deloitteMaxPages: 10,
    eyMaxPages: 10,
  },
  employers: { enabled: true, companies: DEFAULT_COMPANIES },
  mncEmployers: { enabled: true, companies: MNC_EMPLOYERS },
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

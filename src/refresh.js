import { config } from './config.js'
import { PROFILES } from './profiles.js'
import { buildJob } from './normalise.js'
import { upsertJob, startRun, finishRun, pruneStale, db } from './db.js'
import { fetchCareerjet } from './sources/careerjet.js'
import { fetchAccaCareers } from './sources/acca.js'
import { fetchAdzuna } from './sources/adzuna.js'
import { fetchJobsIreland } from './sources/jobsireland.js'
import { fetchOfficialEmployers } from './sources/official-employers.js'
import { fetchATS } from './sources/ats.js'
import { fetchPlatformEmployers } from './sources/platforms.js'
import { fetchRemote } from './sources/remote.js'

let running = false
let progress = { active: false, step: '', log: [] }

export function refreshState() {
  return { ...progress, log: progress.log.slice(-40) }
}

export async function runRefresh({ quiet = false } = {}) {
  if (running) return { skipped: 'a refresh is already running' }
  running = true

  const started = Date.now()
  const runId = startRun()
  const errors = []
  const seenAt = new Date().toISOString()

  progress = { active: true, step: 'starting', log: [] }
  const note = (msg) => {
    progress.step = msg
    progress.log.push(`${new Date().toISOString().slice(11, 19)}  ${msg}`)
    if (!quiet) console.log(`  ${msg}`)
  }

  const collected = []

  try {
    if (config.careerjet.enabled) {
      note(`Careerjet: searching ${config.countries.join(', ').toUpperCase()}`)
      const r = await fetchCareerjet({
        profiles: PROFILES,
        countries: config.countries,
        maxPages: config.careerjet.maxPages,
        affid: config.careerjet.affid,
        onProgress: note,
      })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.accaCareers.enabled) {
      note('ACCA Careers: searching Ireland')
      const r = await fetchAccaCareers({
        maxPages: config.accaCareers.maxPages,
        onProgress: note,
      })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.adzuna.enabled) {
      note('Adzuna: searching Ireland')
      const r = await fetchAdzuna({
        appId: config.adzuna.appId,
        appKey: config.adzuna.appKey,
        profiles: PROFILES,
        maxPages: config.adzuna.maxPages,
        onProgress: note,
      })
      if (r.skipped) note(`Adzuna skipped (${r.skipped})`)
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.jobsIreland.enabled) {
      note('JobsIreland government service')
      const r = await fetchJobsIreland({
        latestPageSize: config.jobsIreland.latestPageSize,
        latestPages: config.jobsIreland.latestPages,
        partTimeLimit: config.jobsIreland.partTimeLimit,
        onProgress: note,
      })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.officialEmployers.enabled) {
      note('Official MNC career sites')
      const r = await fetchOfficialEmployers({ settings: config.officialEmployers, onProgress: note })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.employers.enabled) {
      note('Employer boards')
      const r = await fetchATS({ companies: config.employers.companies, onProgress: note })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    if (config.mncEmployers.enabled) {
      note('Multinational careers systems')
      const r = await fetchPlatformEmployers({ companies: config.mncEmployers.companies, onProgress: note })
      collected.push(...r.jobs.map((j) => ({ country: 'ie', ...j })))
      errors.push(...r.errors)
    }

    if (config.remoteBoards.enabled) {
      note('Remote boards')
      const r = await fetchRemote({ onProgress: note })
      collected.push(...r.jobs)
      errors.push(...r.errors)
    }

    note(`Normalising ${collected.length} listings`)

    let added = 0
    let refreshed = 0
    let dropped = 0

    const writeAll = (rows) => {
      for (const raw of rows) {
        const job = buildJob(raw, seenAt)
        // No profile matched at all means it is not a job you asked to see.
        if (!job || job.score === 0) { dropped++; continue }
        if (upsertJob(job)) added++
        else refreshed++
      }
    }

    db.exec('BEGIN')
    try { writeAll(collected); db.exec('COMMIT') } catch (err) { db.exec('ROLLBACK'); throw err }

    const pruned = pruneStale(config.pruneAfterDays)
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    const summary = `${added} new, ${refreshed} still live, ${dropped} off-profile, ${pruned} expired, ${secs}s`
    note(`Done: ${summary}`)

    finishRun(runId, {
      added,
      refreshed,
      scanned: collected.length,
      notes: errors.length ? `${summary} | issues: ${errors.slice(0, 8).join('; ')}` : summary,
    })

    return { added, refreshed, dropped, pruned, scanned: collected.length, seconds: Number(secs), errors }
  } catch (err) {
    errors.push(`fatal: ${err.message}`)
    finishRun(runId, { added: 0, refreshed: 0, scanned: collected.length, notes: errors.join('; ') })
    throw err
  } finally {
    running = false
    progress.active = false
  }
}

export function scheduleRefresh() {
  const mins = Math.max(Number(config.refreshMinutes) || 45, 10)
  setInterval(() => {
    runRefresh({ quiet: true }).catch((err) => console.error(`scheduled refresh failed: ${err.message}`))
  }, mins * 60000).unref?.()
  return mins
}

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from './src/config.js'
import { allRegions, PROVINCE_ORDER, COUNTRIES } from './src/regions.js'
import { SPONSORSHIP_LEVELS, PERMIT_NOTES } from './src/sponsorship.js'
import { GROUPS, PROFILES } from './src/profiles.js'
import { queryJobs, facets, setSaved, setHidden, stats, lastRun, recentRuns } from './src/db.js'
import { runRefresh, scheduleRefresh, refreshState } from './src/refresh.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(ROOT, 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

function filtersFrom(url) {
  const p = url.searchParams
  return {
    countries: list(p.get('countries')),
    sponsorship: list(p.get('sponsorship')),
    regions: list(p.get('regions')),
    provinces: list(p.get('provinces')),
    groups: list(p.get('groups')),
    profiles: list(p.get('profiles')),
    sources: list(p.get('sources')),
    workModes: list(p.get('modes')),
    employmentTypes: list(p.get('types')),
    q: p.get('q')?.trim() || '',
    // Numbers, not strings: the string "0" is truthy and would switch these on.
    salaryMin: Number(p.get('salaryMin')) || 0,
    days: Number(p.get('days')) || 0,
    minScore: Number(p.get('minScore')) || 0,
    savedOnly: p.get('saved') === '1',
    sort: p.get('sort') || 'newest',
    limit: p.get('limit') || 60,
    offset: p.get('offset') || 0,
  }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname

  try {
    if (path === '/api/meta') {
      const f = filtersFrom(url)
      return json(res, {
        regions: allRegions(),
        provinceOrder: PROVINCE_ORDER,
        countries: COUNTRIES.map((c) => ({ code: c.code, name: c.name, provinces: c.provinces })),
        sponsorshipLevels: SPONSORSHIP_LEVELS,
        permitNotes: PERMIT_NOTES,
        groups: GROUPS,
        profiles: PROFILES.map((p) => ({ id: p.id, name: p.name, group: p.group })),
        facets: facets(f),
        stats: stats(),
        lastRun: lastRun(),
        runs: recentRuns(6),
        refreshMinutes: config.refreshMinutes,
        adzunaConfigured: Boolean(config.adzuna.appId && config.adzuna.appKey),
      })
    }

    if (path === '/api/jobs') {
      return json(res, queryJobs(filtersFrom(url)))
    }

    if (path === '/api/export.csv') {
      const { rows } = queryJobs({ ...filtersFrom(url), limit: 300 })
      const head = ['Title', 'Company', 'Location', 'Country', 'Region', 'Work mode', 'Job type',
        'Sponsorship signal', 'Why', 'Salary', 'Posted', 'Source', 'Link']
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [head.join(','), ...rows.map((r) => [
        r.title, r.company, r.location_raw, r.country, r.county_name, r.work_mode, r.employment_type,
        r.sponsorship, r.sponsorship_reasons,
        r.salary_text, (r.posted_at || r.first_seen || '').slice(0, 10), r.available_sources || r.source, r.url,
      ].map(esc).join(','))].join('\n')
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="job-radar-${new Date().toISOString().slice(0, 10)}.csv"`,
      })
      return res.end(csv)
    }

    if (path === '/api/refresh' && req.method === 'POST') {
      runRefresh().catch((err) => console.error(`refresh failed: ${err.message}`))
      return json(res, { started: true })
    }

    if (path === '/api/refresh/status') return json(res, refreshState())

    const saveMatch = path.match(/^\/api\/jobs\/([a-f0-9]+)\/(save|hide)$/)
    if (saveMatch && req.method === 'POST') {
      const [, id, action] = saveMatch
      const body = await readBody(req)
      if (action === 'save') setSaved(id, body.saved !== false, body.note)
      else setHidden(id, body.hidden !== false)
      return json(res, { ok: true })
    }

    // Static files
    const rel = path === '/' ? 'index.html' : normalize(path).replace(/^([/\\.]+)/, '')
    const file = join(PUBLIC, rel)
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden') }

    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    return res.end(data)
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not found') }
    console.error(err)
    return json(res, { error: err.message }, 500)
  }
})

server.listen(config.port, () => {
  const mins = scheduleRefresh()
  const s = stats()
  console.log(`\n  Ireland Job Radar`)
  console.log(`  http://localhost:${config.port}`)
  console.log(`  ${s.total} jobs stored, ${s.newLast24h} added in the last 24 hours`)
  console.log(`  Auto-refresh every ${mins} minutes`)
  if (!config.adzuna.appId) console.log(`  Adzuna is off. Add free keys to config.json for extra coverage.`)
  console.log('')

  if (config.refreshOnStart && s.total === 0) {
    console.log('  Empty database, running a first refresh. This takes a couple of minutes.\n')
    runRefresh().catch((err) => console.error(`initial refresh failed: ${err.message}`))
  }
})

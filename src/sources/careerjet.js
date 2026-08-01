// Careerjet's public search API. This is the workhorse: it aggregates IrishJobs,
// Jobs.ie, the recruitment agencies and most employer sites, and it needs no key.
// It does insist on a Referer header, and pagesize silently caps at 99.

import { getJSON, sleep } from './http.js'

const ENDPOINT = 'http://public.api.careerjet.net/search'
const PAGE_SIZE = 99

export async function fetchCareerjet({ profiles, maxPages = 2, delayMs = 350, affid, onProgress }) {
  const out = []
  const errors = []

  const queries = profiles.flatMap((p) => p.queries.map((q) => ({ q, profile: p.id })))

  for (const { q, profile } of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        keywords: q,
        location: 'Ireland',
        locale_code: 'en_IE',
        pagesize: String(PAGE_SIZE),
        page: String(page),
        sort: 'date',
        // Careerjet wants to know who the end user is; these are the values it
        // expects a server-side integration to pass through.
        user_ip: '87.44.1.1',
        user_agent: 'Mozilla/5.0',
      })
      if (affid) params.set('affid', affid)

      let data
      try {
        data = await getJSON(`${ENDPOINT}?${params}`, { headers: { Referer: 'http://localhost/ireland-job-radar' } })
      } catch (err) {
        errors.push(`careerjet "${q}" p${page}: ${err.message}`)
        break
      }

      if (data?.type !== 'JOBS' || !Array.isArray(data.jobs) || data.jobs.length === 0) break

      for (const j of data.jobs) {
        out.push({
          source: 'careerjet',
          sourceDetail: j.site || null,
          title: j.title,
          company: j.company,
          locationRaw: j.locations,
          url: j.url,
          description: j.description,
          postedAt: j.date,
          salaryText: j.salary,
          salaryMin: numOrNull(j.salary_min),
          salaryMax: numOrNull(j.salary_max),
          salaryCurrency: j.salary_currency_code || null,
          salaryPeriod: periodFromCode(j.salary_type),
        })
      }

      onProgress?.(`careerjet "${q}" page ${page}: ${data.jobs.length}`)
      if (page >= (data.pages || 1)) break
      await sleep(delayMs)
    }
    await sleep(delayMs)
  }

  return { jobs: out, errors }
}

const numOrNull = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Careerjet encodes the pay period as a single letter.
const periodFromCode = (c) => ({ Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour' }[c] || null)

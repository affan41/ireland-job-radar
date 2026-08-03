// Careerjet's public search API. This is the workhorse: it aggregates IrishJobs,
// Jobs.ie, the recruitment agencies and most employer sites, and it needs no key.
// It does insist on a Referer header, and pagesize silently caps at 99.

import { getJSON, sleep } from './http.js'

const ENDPOINT = 'http://public.api.careerjet.net/search'
const PAGE_SIZE = 99

// Careerjet runs a separate index per country, each with its own locale code.
export const CAREERJET_COUNTRIES = [
  { code: 'ie', location: 'Ireland', locale: 'en_IE' },
  { code: 'cy', location: 'Cyprus', locale: 'en_CY' },
  { code: 'mt', location: 'Malta', locale: 'en_MT' },
]

export async function fetchCareerjet({
  profiles,
  countries = ['ie'],
  maxPages = 12,
  delayMs = 120,
  concurrency = 5,
  affid,
  onProgress,
}) {
  const out = []
  const errors = []

  const markets = CAREERJET_COUNTRIES.filter((c) => countries.includes(c.code))
  const queries = markets.flatMap((market) =>
    profiles.flatMap((p) => p.queries.map((q) => ({ q, profile: p.id, market }))))

  // Over a hundred searches against three indexes is thousands of requests, so run
  // a handful at a time rather than one after another. Each worker still pauses
  // between its own calls, which keeps the rate on the API reasonable.
  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < queries.length) {
      const { q, market } = queries[cursor++]

      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          keywords: q,
          location: market.location,
          locale_code: market.locale,
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
          data = await getJSON(`${ENDPOINT}?${params}`, { headers: { Referer: 'http://localhost/job-radar' } })
        } catch (err) {
          errors.push(`careerjet ${market.location} "${q}" p${page}: ${err.message}`)
          break
        }

        if (data?.type !== 'JOBS' || !Array.isArray(data.jobs) || data.jobs.length === 0) break

        for (const j of data.jobs) {
          out.push({
            source: 'careerjet',
            sourceDetail: j.site || null,
            country: market.code,
            // Cyprus and Malta boards often give a bare town, so name the country
            // for anything the gazetteer would otherwise file as unclassified.
            regionHint: market.location,
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

        if (page >= (data.pages || 1)) break
        await sleep(delayMs)
      }

      done++
      if (done % 10 === 0 || done === queries.length) {
        onProgress?.(`careerjet: ${done}/${queries.length} searches, ${out.length} listings`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  return { jobs: out, errors }
}

const numOrNull = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Careerjet encodes the pay period as a single letter.
const periodFromCode = (c) => ({ Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour' }[c] || null)

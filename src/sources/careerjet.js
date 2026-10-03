// Documented Careerjet publisher API. Requires a publisher key and actual
// user request context; scheduled calls without that context are skipped.

import { sleep } from './http.js'
import {careerjetAccessIssue,careerjetQuery} from './careerjet-api.js'

const PAGE_SIZE = 99

// Search only the Irish index.
export const CAREERJET_COUNTRIES = [
  { code: 'ie', location: 'Ireland', locale: 'en_IE' },
]

export async function fetchCareerjet({
  profiles,
  countries = ['ie'],
  maxPages = 12,
  delayMs = 120,
  concurrency = 5,
  apiKey, requestContext,
  onProgress,
}) {
  const out = []
  const errors = []
  const accessIssue=careerjetAccessIssue({apiKey,requestContext})
  if(accessIssue){onProgress?.(accessIssue);return {jobs:[],errors:[accessIssue],skipped:accessIssue}}

  const markets = CAREERJET_COUNTRIES.filter((c) => countries.includes(c.code))
  const queries = markets.flatMap((market) =>
    profiles.flatMap((p) => p.queries.map((q) => ({ q, profile: p.id, market }))))

  // Many role searches can generate thousands of requests, so run
  // a handful at a time rather than one after another. Each worker still pauses
  // between its own calls, which keeps the rate on the API reasonable.
  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < queries.length) {
      const { q, market } = queries[cursor++]

      for (let page = 1; page <= Math.min(maxPages,10); page++) {
        const params = new URLSearchParams({
          keywords: q,
          location: market.location,
          locale_code: market.locale,
          page_size: String(PAGE_SIZE), fragment_size: '1000',
          page: String(page),
          sort: 'date',
          // Careerjet wants to know who the end user is; these are the values it
          // expects a server-side integration to pass through.

        })

        let data
        try {
          data = await careerjetQuery(params,{apiKey,requestContext})
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
            // Preserve the market for otherwise unclassified locations.
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

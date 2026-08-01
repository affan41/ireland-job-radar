// Adzuna's Ireland index. Optional: it needs a free app_id/app_key from
// developer.adzuna.com. Worth adding, because it carries structured salary data
// and categories that Careerjet does not always expose.

import { getJSON, sleep } from './http.js'

const ENDPOINT = 'https://api.adzuna.com/v1/api/jobs/ie/search'

export async function fetchAdzuna({ appId, appKey, profiles, maxPages = 1, delayMs = 400, maxDaysOld = 14, onProgress }) {
  if (!appId || !appKey) return { jobs: [], errors: [], skipped: 'no Adzuna credentials configured' }

  const out = []
  const errors = []
  const queries = [...new Set(profiles.flatMap((p) => p.queries))]

  for (const q of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: '50',
        what: q,
        max_days_old: String(maxDaysOld),
        sort_by: 'date',
        'content-type': 'application/json',
      })

      let data
      try {
        data = await getJSON(`${ENDPOINT}/${page}?${params}`)
      } catch (err) {
        errors.push(`adzuna "${q}" p${page}: ${err.message}`)
        break
      }

      const results = data?.results || []
      if (!results.length) break

      for (const j of results) {
        out.push({
          source: 'adzuna',
          sourceDetail: j.company?.display_name ? null : (j.category?.label || null),
          title: j.title,
          company: j.company?.display_name,
          locationRaw: j.location?.display_name,
          url: j.redirect_url,
          description: j.description,
          postedAt: j.created,
          salaryMin: j.salary_min || null,
          salaryMax: j.salary_max || null,
          salaryCurrency: 'EUR',
          salaryPeriod: 'year',
          salaryText: salaryLabel(j),
        })
      }

      onProgress?.(`adzuna "${q}" page ${page}: ${results.length}`)
      await sleep(delayMs)
    }
  }

  return { jobs: out, errors }
}

function salaryLabel(j) {
  if (!j.salary_min && !j.salary_max) return null
  const fmt = (n) => `€${Math.round(n).toLocaleString('en-IE')}`
  if (j.salary_min && j.salary_max && j.salary_min !== j.salary_max) return `${fmt(j.salary_min)} - ${fmt(j.salary_max)} per year`
  return `${fmt(j.salary_max || j.salary_min)} per year`
}

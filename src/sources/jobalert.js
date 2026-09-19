import { getText } from './http.js'

export function parseJobAlert(html) {
  const raw = html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!raw) throw new Error('JobAlert page data missing')
  const data = JSON.parse(raw).props?.pageProps?.initialReduxState?.entities?.jobs
  if (!Array.isArray(data?.data)) throw new Error('JobAlert vacancies missing')
  // The search can contain promoted nationwide listings. Keep actual locations
  // and statuses; never infer part-time hours or Limerick from the search query.
  const jobs = data.data.filter(j => j.status === 'OPEN' && j.isOpen !== false && j.address?.countryCode === 'ie').map(j => {
    const types = (j.jobTypes || []).map(t => t.name).join(' ')
    return {
      title: j.title, company: j.company?.name, locationRaw: j.address.formatted || [j.address.city, j.address.county].filter(Boolean).join(', '),
      description: j.description, postedAt: j.postedAt, country: 'ie',
      source: 'jobalert', sourceDetail: 'JobAlert.ie', url: `https://www.jobalert.ie/job/${encodeURIComponent(j.slug)}`,
      employmentType: /full.time/i.test(types) ? 'full_time' : /part.time/i.test(types) ? 'part_time' : undefined,
    }
  })
  return {jobs, pages: Math.ceil((Number(data.count) || 0) / (Number(data.pageSize) || 10))}
}

export async function fetchJobAlert({request = getText, maxPages = 15, onProgress} = {}) {
  const jobs = new Map(), errors = []
  let pages = 1
  for (let page = 0; page < Math.min(pages, maxPages); page++) {
    try {
      const result = parseJobAlert(await request(`https://www.jobalert.ie/jobs?jobType=Part-time&location=Limerick&sort=date&page=${page}`))
      pages = result.pages
      for (const job of result.jobs) jobs.set(job.url, job)
    } catch (error) { errors.push(`JobAlert page ${page + 1}: ${error.message}`); break }
  }
  onProgress?.(`JobAlert.ie: ${jobs.size} open adverts from the Limerick part-time search`)
  return {jobs: [...jobs.values()], errors}
}

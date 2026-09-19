// Tesco's official Ireland vacancy board. Search dates are closing dates, not
// posting dates. Read each advert's contract details rather than guessing hours.
import { getText } from './http.js'
import { clean } from '../normalise.js'
import { detectEmploymentType } from '../employment.js'

const ORIGIN = 'https://apply.tesco-careers.com'
const SEARCH = `${ORIGIN}/v2/job/search?location_country=106`

export function parseTescoSearch(html) {
  const jobs = []
  for (const block of html.split(/<div class="tbp-list-item\b/).slice(1)) {
    const link = block.match(/<a[^>]*class="[^"]*tbp-li-title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) continue
    const url = new URL(link[1].replace(/&amp;/g, '&'), ORIGIN)
    if (url.origin !== ORIGIN || !url.searchParams.has('record')) continue
    jobs.push({title: clean(link[2]), url: url.href})
  }
  const pages = [...html.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map(m => Number(m[1]))
  return {jobs, pages: Math.max(1, ...pages)}
}

export function parseTescoJob(html, url, now = Date.now()) {
  const article = html.match(/<article\b[^>]*id="job-advert-wrapper"[^>]*>([\s\S]*?)<\/article>/)?.[1]
  if (!article || /this (?:job|vacancy) (?:has|is) (?:now )?(?:closed|expired)/i.test(clean(article))) return null
  const field = (label) => clean(article.match(new RegExp(`${label}:\\s*</strong>\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`, 'i'))?.[1])
  const closing = field('Closing Date').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (closing && Date.UTC(+closing[3], +closing[2] - 1, +closing[1] + 1) <= now) return null
  const title = clean(article.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1])
  const location = field('Location')
  if (!title || !location) return null
  const hours = Number(field('Working Hours'))
  const contract = field('Contract Details')
  const schedule = [contract, hours > 0 ? `${hours} hours per week` : ''].filter(Boolean).join('. ')
  return {
    title, company: 'Tesco', locationRaw: location, country: 'ie', url,
    source: 'employer', sourceDetail: 'Tesco Ireland Careers',
    description: `${schedule}. ${clean(article, 15000)}`,
    employmentType: detectEmploymentType(title, schedule),
    // There is no posted date on this board. first_seen records when we found it.
    postedAt: null,
  }
}

export async function fetchTesco({maxPages = 20, onProgress, request = getText} = {}) {
  const found = new Map()
  const jobs = [], errors = []
  let pages = 1
  for (let page = 1; page <= Math.min(pages, maxPages); page++) {
    try {
      const result = parseTescoSearch(await request(`${SEARCH}&page=${page}`, {retries: 1, timeout: 15000}))
      pages = Math.max(pages, result.pages)
      for (const job of result.jobs) found.set(job.url, job)
      if (!result.jobs.length) break
    } catch (error) { errors.push(`Tesco search p${page}: ${error.message}`); break }
  }
  const candidates = [...found.values()].filter(j => detectEmploymentType(j.title) !== 'full_time')
  let index = 0
  await Promise.all(Array.from({length: 3}, async () => {
    while (index < candidates.length) {
      const candidate = candidates[index++]
      try {
        const job = parseTescoJob(await request(candidate.url, {retries: 1, timeout: 15000}), candidate.url)
        if (job) jobs.push(job)
      } catch (error) { errors.push(`Tesco advert: ${error.message}`) }
    }
  }))
  onProgress?.(`Tesco: ${jobs.length} adverts read from ${found.size} Ireland vacancies`)
  return {jobs, errors}
}

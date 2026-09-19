import { getJSON, getText, postJSON, sleep } from './http.js'
import { clean } from '../normalise.js'
import { isIrishLocation } from '../regions.js'

const employer = (name, job) => ({ country: 'ie', source: 'employer', sourceDetail: `${name} Careers`, company: name, ...job })
const typeFrom = value => /full[\s_-]*time/i.test(String(value)) ? 'full_time' : /part[\s_-]*time/i.test(String(value)) ? 'part_time' : undefined
const closed = date => date && Number.isFinite(Date.parse(date)) && Date.parse(date) < Date.now()
const allowedURL = (url, origin) => { try { return new URL(url, origin).origin === origin ? new URL(url, origin).href : null } catch { return null } }

export function parseJobPosting(html) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1])
      const entries = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])]
      const job = entries.find(j => [].concat(j['@type'] || []).includes('JobPosting'))
      if (job) return job
    } catch { /* Other structured page data is not necessarily a vacancy. */ }
  }
  return null
}

async function details(items, mapper) {
  const jobs = [], errors = []
  let cursor = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      try { const job = await mapper(item); if (job) jobs.push(job) }
      catch (error) { errors.push(`${item.url || item.id}: ${error.message}`) }
      await sleep(100)
    }
  }))
  return { jobs, errors }
}

export function mapPrimark(job) {
  if (String(job.location?.country).toLowerCase() !== 'ie') return null
  return employer('Penneys / Primark', {
    title: job.name,
    locationRaw: [job.location.address, job.location.city, job.location.region, 'Ireland'].filter(Boolean).join(', '),
    url: `https://jobs.smartrecruiters.com/Primark/${job.id}`,
    postedAt: job.releasedDate,
    description: Object.values(job.jobAd?.sections || {}).map(s => s.text || '').join(' '),
    employmentType: typeFrom(job.typeOfEmployment?.label),
    latitude: Number(job.location.latitude) || undefined, longitude: Number(job.location.longitude) || undefined,
  })
}
export async function fetchPrimark({ json = getJSON } = {}) {
  const cards = []
  for (let page = 0; page < 10; page++) {
    const data = await json(`https://api.smartrecruiters.com/v1/companies/Primark/postings?country=ie&limit=100&offset=${page * 100}`)
    if (!Array.isArray(data.content)) throw new Error('Vacancy list missing')
    cards.push(...data.content.filter(j => String(j.location?.country).toLowerCase() === 'ie'))
    if ((page + 1) * 100 >= data.totalFound || !data.content.length) break
  }
  return details(cards, async card => mapPrimark({ ...card, ...await json(`https://api.smartrecruiters.com/v1/companies/Primark/postings/${card.id}`) }))
}

export function mapLidl(job) {
  if (job.location?.country !== 'IE' || !job.jobDetailUrl || closed(job.onlineUntil)) return null
  const url = allowedURL(job.jobDetailUrl, 'https://jobs.lidl.ie')
  if (!url) return null
  return employer('Lidl', { title: job.title, url,
    locationRaw: [job.location.address, job.location.city, job.location.zipCode, 'Ireland'].filter(Boolean).join(', '),
    description: [job.descHeader, job.descResponsibilities, job.descRequirements, job.descBenefits, job.workingHours].filter(Boolean).join(' '),
    employmentType: typeFrom(job.contractType || job.categories?.contract_type?.value), postedAt: job.onlineFrom,
    latitude: job.location.latitude, longitude: job.location.longitude,
  })
}
export async function fetchLidl({ json = getJSON } = {}) {
  const jobs = []
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ general: JSON.stringify({ page, resultsPerPage: 100 }) })
    const data = await json(`https://jobs.lidl.ie/api/v1/search?${query}`)
    if (!Array.isArray(data.jobs)) throw new Error('Vacancy list missing')
    jobs.push(...data.jobs.map(mapLidl).filter(Boolean))
    if (page * (data.meta?.resultsPerPage || 20) >= data.meta?.totalCount || !data.jobs.length) break
  }
  return { jobs, errors: [] }
}

export function mapMcDonalds(job) {
  if (job.country !== 'Republic of Ireland') return null
  const url = allowedURL(job.jd_url, 'https://people.mcdonalds.ie')
  if (!url || !job.jd_url) return null
  // This public search feed encodes the restaurant's map pin in its detail URL.
  const coordinates = job.jd_url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  return employer("McDonald's", { title: job.title, url,
    locationRaw: [job.display_address || job.town_city, job.state, 'Ireland'].filter(Boolean).join(', '),
    description: job.description, employmentType: typeFrom(job.contract_type), postedAt: null,
    latitude: coordinates ? Number(coordinates[1]) : undefined, longitude: coordinates ? Number(coordinates[2]) : undefined,
  })
}
export async function fetchMcDonalds({ text = getText, post = postJSON } = {}) {
  const html = await text('https://people.mcdonalds.ie/job-search')
  // Public search-only configuration, refreshed from the careers page. No login
  // or personal account credentials are read or stored.
  const app = html.match(/AG_ID\s*=\s*['"]([^'"]+)/)?.[1]
  const key = html.match(/AG_KEY\s*=\s*['"]([^'"]+)/)?.[1]
  const index = JSON.parse(html.match(/AG_INDEX\s*=\s*(\{[^;]+\})/)?.[1] || '{}').default
  if (!app || !key || !index || !/^[a-z0-9]+$/i.test(app)) throw new Error('Public search configuration missing')
  const jobs = []
  for (let page = 0; page < 10; page++) {
    const data = await post(`https://${app}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`, {
      query: '', filters: 'country:"Republic of Ireland"', hitsPerPage: 100, page,
    }, { headers: { Referer: 'https://people.mcdonalds.ie/', Origin: 'https://people.mcdonalds.ie', 'x-algolia-application-id': app, 'x-algolia-api-key': key } })
    if (!Array.isArray(data.hits)) throw new Error('Vacancy list missing')
    jobs.push(...data.hits.map(mapMcDonalds).filter(Boolean))
    if (page + 1 >= data.nbPages || !data.hits.length) break
  }
  return { jobs, errors: [] }
}

export function parseSupermacs(html, url) {
  const jobBody = html.match(/<div class="wpjb wpjb-job wpjb-page-single">([\s\S]*?)<div class="wpjb-job-apply"/)?.[1]
  if (!jobBody || /(?:job (?:has expired|is no longer available)|position (?:is|has been) filled)/i.test(clean(jobBody, Infinity))) return null
  const value = key => clean(jobBody.match(new RegExp(`wpjb-row-meta-${key}[\\s\\S]*?wpjb-col-60[^>]*>([\\s\\S]*?)<\\/div>`))?.[1], Infinity)
  const location = value('_location')
  if (!isIrishLocation(location)) return null
  const title = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
  const description = jobBody.match(/<div class="wpjb-text">([\s\S]*?)<\/div>/)?.[1]
  if (!title || !description) return null
  return employer("Supermac's / The Plaza Group", { title, url, locationRaw: location, description,
    employmentType: typeFrom(value('_tag_type')), postedAt: value('job_created_at'), salaryText: value('salary') })
}
export async function fetchSupermacs({ text = getText } = {}) {
  const urls = new Set()
  for (let page = 1; page <= 10; page++) {
    const html = await text(page === 1 ? 'https://supermacs.ie/careers/' : `https://supermacs.ie/careers/page/${page}/`)
    for (const match of html.matchAll(/<a\b[^>]*href="(https:\/\/supermacs\.ie\/job\/[^"?]+)"[^>]*class="wpjb-job_title[^>]*>/g)) urls.add(match[1])
    if (!html.includes('class="next page-numbers"')) break
  }
  if (!urls.size) throw new Error('Vacancy links missing')
  return details([...urls].map(url => ({ url })), async ({ url }) => parseSupermacs(await text(url), url))
}

async function postForm(url, body) {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(body), signal: AbortSignal.timeout(25000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
export function parseBootsCards(html) {
  return [...html.matchAll(/<h3 class="job-card__title">([\s\S]*?)<\/ul>/g)].map(match => ({
    url: match[1].match(/href="(https:\/\/www\.boots\.jobs\/jobs\/[^" ]+)"/)?.[1],
    hours: clean(match[1].match(/class="job-card__meta-icon-work_hours">([\s\S]*?)<\/li>/)?.[1]),
  })).filter(j => j.url)
}
export function parseBoots(html, card) {
  const job = parseJobPosting(html)
  if (!job || closed(job.validThrough)) return null
  const location = [].concat(job.jobLocation || [])
  if (location.length !== 1) return null
  const address = location[0]?.address || {}
  const place = [address.streetAddress, address.addressLocality, address.addressRegion].filter(v => v && v !== '-').join(', ')
  if (!isIrishLocation(place) || /\b(?:United Kingdom|GB|UK)\b/i.test(address.addressCountry || '')) return null
  return employer('Boots', { title: job.title, url: card.url, locationRaw: place,
    description: [card.hours, job.description].filter(Boolean).join(' '), employmentType: typeFrom(job.employmentType), postedAt: job.datePosted,
    latitude: Number(location[0]?.geo?.latitude) || undefined, longitude: Number(location[0]?.geo?.longitude) || undefined,
  })
}
export async function fetchBoots({ form = postForm, text = getText } = {}) {
  const endpoint = 'https://www.boots.jobs/wp-admin/admin-ajax.php'
  const nonce = await form(endpoint, { action: 'get_dynamic_nonces' })
  if (!nonce.success || !nonce.data?.jobs_nonce) throw new Error('Public search token unavailable')
  const cards = new Map()
  for (let page = 1; page <= 15; page++) {
    const data = await form(endpoint, { action: 'boots_job_search', nonce: nonce.data.jobs_nonce,
      data: JSON.stringify({ jobfeed: 'external', location: 'Limerick', page: String(page), store_last_search: false }) })
    if (!data.success || typeof data.data?.html !== 'string') throw new Error('Vacancy list missing')
    for (const card of parseBootsCards(data.data.html)) cards.set(card.url, card)
    if (!data.data.has_more) break
  }
  return details([...cards.values()], async card => parseBoots(await text(card.url), card))
}

export async function fetchRetailEmployers({ onProgress, providers = ['primark', 'lidl', 'mcdonalds', 'supermacs', 'boots'] } = {}) {
  const adapters = { primark: fetchPrimark, lidl: fetchLidl, mcdonalds: fetchMcDonalds, supermacs: fetchSupermacs, boots: fetchBoots }
  const jobs = [], errors = []
  for (const name of providers) {
    onProgress?.(`${name}: reading official vacancies and hours`)
    try {
      if (!adapters[name]) throw new Error('Unknown provider')
      const result = await adapters[name]()
      jobs.push(...result.jobs); errors.push(...result.errors.map(e => `${name}: ${e}`))
      onProgress?.(`${name}: ${result.jobs.length} official adverts read`)
    } catch (error) { errors.push(`${name}: ${error.message}`) }
  }
  return { jobs, errors }
}

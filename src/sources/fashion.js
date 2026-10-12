import { load } from 'cheerio'
import { getPublicPage } from './public-page.js'
import { parseAdvert, verifyAdvert } from '../verification.js'
import { isIrishLocation } from '../regions.js'
import { sleep } from './http.js'

async function readAdverts(urls, company, request, onProgress) {
  const jobs = [], errors = []
  for (const url of urls) {
    try {
      const page = await request(url)
      const parsed = parseAdvert(page.html, page.url)
      if (page.status !== 200) throw new Error(`Advert HTTP ${page.status}`)
      if (!parsed.hasAdvert) throw new Error('No identifiable vacancy at destination')
      if (!isIrishLocation(parsed.locationRaw, { includeNorthernIreland: false })) continue
      const raw = { ...parsed, url: page.url, country: 'ie', source: 'employer',
        sourceDetail: `${company} Careers`, company: company === 'BESTSELLER' ? (parsed.title.match(/^(VILA|JACK\s*&\s*JONES|ONLY|NAME IT|SELECTED)\b/i)?.[0] || company) : company }
      jobs.push({ ...await verifyAdvert(raw, { page, request }), company: raw.company })
    } catch (error) { errors.push(`${company} ${url}: ${error.message}`) }
    await sleep(100)
  }
  onProgress?.(`${company}: ${jobs.length} Irish adverts read`)
  return { jobs, errors }
}

export async function fetchBestseller({ request = getPublicPage, onProgress } = {}) {
  // The employer's public careers page advertises this complete vacancy feed.
  const page = await request('https://bestseller.com/api/v1/jobs/GetJobs')
  if (page.status !== 200) throw new Error(`Vacancy feed HTTP ${page.status}`)
  let rows = JSON.parse(page.html)
  if (typeof rows === 'string') rows = JSON.parse(rows)
  if (!Array.isArray(rows)) throw new Error('Vacancy feed missing')
  const urls = new Set()
  for (const row of rows) {
    if (!/\bIE\b|\bIreland\b/i.test(row.JobCountry || '')) continue
    const url = new URL(row.Url, 'https://bestseller.com')
    if (url.origin === 'https://bestseller.com' && url.pathname.startsWith('/careers/jobs/')) urls.add(url.href)
  }
  return readAdverts(urls, 'BESTSELLER', request, onProgress)
}

export async function fetchSostreneGrene({ request = getPublicPage, onProgress, maxPages = 20 } = {}) {
  const root = 'https://career.sostrenegrene.com'
  const queue = [`${root}/search/?q=&optionsFacetsDD_country=IE`], seen = new Set(), jobs = new Set()
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    const page = await request(url)
    if (page.status !== 200) throw new Error(`Vacancy search HTTP ${page.status}`)
    const $ = load(page.html)
    $('a[href]').each((i, e) => {
      const next = new URL($(e).attr('href'), page.url)
      if (next.origin !== root) return
      if (/^\/job\/[^/]+\/\d+\/?$/.test(next.pathname)) jobs.add(next.href)
      if (next.pathname === '/search/' && next.searchParams.get('optionsFacetsDD_country') === 'IE'
          && next.searchParams.has('startrow') && !seen.has(next.href)) queue.push(next.href)
    })
  }
  const result = await readAdverts(jobs, 'Søstrene Grene', request, onProgress)
  if (queue.some(url => !seen.has(url))) result.errors.push(`Søstrene Grene discovery capped at ${maxPages} pages`)
  return result
}

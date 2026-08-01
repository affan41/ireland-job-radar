// ACCA Careers runs on Madgex. Its public RSS search is considerably more stable
// than scraping the HTML results pages and supports normal page-by-page fetching.

import { resolveRegion } from '../regions.js'
import { getText, sleep } from './http.js'

const ENDPOINT = 'https://jobs.accaglobal.com/jobsrss/'
const PAGE_SIZE = 20

const decodeXml = (value = '') => String(value)
  .replace(/^<!\[CDATA\[|\]\]>$/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&(amp|lt|gt|quot|apos);/gi, (_, name) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  })[name.toLowerCase()])

function tag(xml, name) {
  const match = String(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? decodeXml(match[1].trim()) : ''
}

function canonicalUrl(value) {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === 'trackid' || key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return value
  }
}

function descriptionLines(value) {
  return decodeXml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function parseAccaRss(xml) {
  const jobs = []
  const items = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []

  for (const item of items) {
    const feedTitle = tag(item, 'title')
    const link = canonicalUrl(tag(item, 'link'))
    if (!feedTitle || !link) continue

    const colon = feedTitle.indexOf(':')
    const companyFromTitle = colon > 0 ? feedTitle.slice(0, colon).trim() : ''
    const title = colon > 0 ? feedTitle.slice(colon + 1).trim() : feedTitle
    const lines = descriptionLines(tag(item, 'description'))

    const companyIndex = companyFromTitle
      ? lines.findIndex((line) => line.replace(/:\s*$/, '').trim().toLowerCase() === companyFromTitle.toLowerCase())
      : -1
    const company = companyFromTitle || (companyIndex >= 0 ? lines[companyIndex].replace(/:\s*$/, '') : null)
    const bodyStart = companyIndex >= 0 ? companyIndex + 1 : Math.min(lines.length, 1)
    const locationRaw = lines.length > bodyStart ? lines.at(-1) : ''
    const description = lines.slice(bodyStart, -1).join(' ')
    const salaryText = (companyIndex > 0 ? lines.slice(0, companyIndex).join(' ') : lines[0] || '')
      .replace(/:\s*$/, '') || null

    // A keyword search can occasionally match "Ireland" in the advert body for
    // a job located elsewhere. Only retain locations the radar recognises as Irish.
    if (resolveRegion(locationRaw).regionKey === 'unknown') continue

    jobs.push({
      source: 'acca',
      sourceDetail: 'ACCA Careers',
      title,
      company,
      locationRaw,
      url: link,
      description,
      salaryText,
      postedAt: tag(item, 'pubDate'),
    })
  }

  return jobs
}

export async function fetchAccaCareers({ maxPages = 25, delayMs = 200, onProgress } = {}) {
  const jobs = []
  const errors = []
  let totalResults = null

  for (let page = 1; page <= Math.max(Number(maxPages) || 0, 0); page++) {
    const params = new URLSearchParams({ keywords: 'Ireland', page: String(page) })
    let xml
    try {
      xml = await getText(`${ENDPOINT}?${params}`, { timeout: 40000, retries: 1 })
    } catch (err) {
      errors.push(`acca careers page ${page}: ${err.message}`)
      break
    }

    const itemCount = (xml.match(/<item(?:\s[^>]*)?>/gi) || []).length
    const parsed = parseAccaRss(xml)
    jobs.push(...parsed)

    if (totalResults == null) {
      const total = xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/i)
      totalResults = total ? Number(total[1]) : null
    }

    onProgress?.(`acca careers page ${page}: ${parsed.length} Ireland jobs (${itemCount} read)`)
    if (itemCount === 0 || itemCount < PAGE_SIZE || (totalResults != null && page * PAGE_SIZE >= totalResults)) break
    if (page < maxPages) await sleep(delayMs)
  }

  return { jobs, errors }
}

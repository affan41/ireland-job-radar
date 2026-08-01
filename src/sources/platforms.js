// Generic adapters for the enterprise recruiting platforms the multinationals run on.
//
// Almost every large employer in Ireland puts its vacancies on one of a handful of
// systems: Workday, SAP SuccessFactors, Oracle Recruiting, Eightfold, Avature or iCIMS.
// Rather than writing a scraper per company, there is one adapter per platform here and
// a data-only list of employers in src/mncs.js. Adding a company is one line.
//
// Everything is read from the employer's own public careers site, so the application
// links are the real ones rather than aggregator redirects.

import { getJSON, getText, postJSON, sleep } from './http.js'
import { isIrishLocation } from '../regions.js'

const employmentFrom = (value) => {
  const v = String(value || '').toLowerCase()
  if (!v) return undefined
  if (v.includes('part')) return 'part_time'
  if (v.includes('full')) return 'full_time'
  if (v.includes('contract') || v.includes('fixed term')) return 'contract'
  if (v.includes('temp') || v.includes('seasonal') || v.includes('intern')) return 'temporary'
  return undefined
}

const workModeFrom = (value) => {
  const v = String(value || '').toLowerCase()
  if (!v) return undefined
  if (v.includes('hybrid')) return 'hybrid'
  if (v.includes('remote') || v.includes('virtual') || v.includes('home')) return 'remote'
  if (v.includes('onsite') || v.includes('on-site') || v.includes('office')) return 'onsite'
  return undefined
}

// The facet says the job is in Ireland even when the location string is vague, so
// make sure the text we hand on can still be resolved to somewhere on the island.
const withIreland = (location) => {
  const loc = String(location || '').trim()
  if (!loc) return 'Ireland'
  return isIrishLocation(loc) ? loc : `${loc}, Ireland`
}

/* ------------------------------------------------------------------ Workday */

// Workday's country ids are shared across tenants, so this is the usual one for
// Ireland. It is still looked up per site, because a tenant can differ.
export const WORKDAY_IRELAND_FACET = '04a05835925f45b3a59406a2a6b72c8a'

// Tenants do not agree on how they expose country. The standard sites nest a
// "locationCountry" facet inside a "locationMainGroup" wrapper, but Salesforce uses a
// custom calculated field, State Street calls it "Location_Country", and some sites
// only publish a flat list of offices ("Ireland, Cork"). So walk the whole facet tree
// and take the best Ireland-shaped match wherever it turns up.
const IRELAND_EXACT = /^(?:republic of )?ireland$/i
const IRELAND_PREFIX = /^ireland\b/i
const COUNTRY_ISH = /country/i
const LOCATION_ISH = /location|region|office|site|hierarchy/i

export function findWorkdayCountryFacet(facets, country = 'Ireland') {
  const exact = country === 'Ireland' ? IRELAND_EXACT : new RegExp(`^${country}$`, 'i')
  const prefix = country === 'Ireland' ? IRELAND_PREFIX : new RegExp(`^${country}\\b`, 'i')

  const hits = []
  let sawPlaceFacet = false

  const walk = (nodes, owner, ownerLabel) => {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue
      const param = node.facetParameter || owner
      const label = node.facetParameter ? node.descriptor : ownerLabel

      // Remember whether this site publishes any list of places at all. If it does
      // and none of them is Irish, the honest answer is "nothing here today".
      if (node.facetParameter && (COUNTRY_ISH.test(param) || LOCATION_ISH.test(param)
        || COUNTRY_ISH.test(label || '') || LOCATION_ISH.test(label || ''))) {
        sawPlaceFacet = true
      }

      const descriptor = node.facetParameter ? null : String(node.descriptor || '').trim()
      if (descriptor && node.id && param) {
        const isCountryFacet = COUNTRY_ISH.test(param) || COUNTRY_ISH.test(String(ownerLabel || ''))
        const rank = exact.test(descriptor) ? (param === 'locationCountry' ? 0 : isCountryFacet ? 1 : 2)
          : !LOCATION_ISH.test(param) && !isCountryFacet ? null
            : prefix.test(descriptor) ? 3
              // Last resort: an office list with no country level, e.g. "Cork" or "IRL-Dublin".
              : isIrishLocation(descriptor, { includeNationwide: false }) ? 4
                : null
        if (rank !== null) hits.push({ rank, facetParameter: param, id: node.id, descriptor, count: node.count })
      }

      if (Array.isArray(node.values)) walk(node.values, param, label)
    }
  }

  walk(facets, null, null)

  if (!hits.length) return { facetParameter: null, ids: [], noIrelandJobs: sawPlaceFacet }

  const best = Math.min(...hits.map((h) => h.rank))
  const chosen = hits.filter((h) => h.rank === best && h.facetParameter === hits.find((x) => x.rank === best).facetParameter)

  return { facetParameter: chosen[0].facetParameter, ids: chosen.map((h) => h.id), noIrelandJobs: false }
}

// A req number is not a place. Workday puts both in the same bullet list.
const REQ_ID_RE = /^[a-z]{0,4}[-_ ]?\d{3,}[a-z0-9_-]*$/i

export function workdayLocation(job) {
  if (job.locationsText) return String(job.locationsText).replace(/\s+/g, ' ').trim()

  // Workday lists the req number first and the office last, so when more than one
  // bullet survives, trust the one that reads like a place, then the last one.
  const bullets = (job.bulletFields || [])
    .map((f) => String(f || '').replace(/\s+/g, ' ').trim())
    .filter((f) => f && !REQ_ID_RE.test(f))
  const bullet = bullets.find((f) => isIrishLocation(f, { includeNationwide: false })) || bullets.at(-1)
  if (bullet) return bullet

  // Failing that, the vacancy path carries the office: /job/Dublin/Tax-Manager_R123
  const fromPath = String(job.externalPath || '').match(/^\/job\/([^/]+)\//)?.[1]
  if (fromPath) return decodeURIComponent(fromPath).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

  return ''
}

export function mapWorkdayJob(job, { company, host, site, sourceDetail, locale = 'en-US', assumeIreland = true }) {
  const location = workdayLocation(job)
  return {
    title: job.title,
    company,
    locationRaw: assumeIreland ? withIreland(location) : (location || 'Ireland'),
    url: new URL(`/${locale}/${site}${job.externalPath}`, `https://${host}`).href,
    postedAt: job.postedOn || job.startDate,
    description: [job.timeType, ...(job.bulletFields || [])].filter(Boolean).join(' '),
    employmentType: employmentFrom(job.timeType),
    source: 'employer',
    sourceDetail,
  }
}

export async function fetchWorkday({
  name,
  host,
  tenant = String(host || '').split('.')[0],
  site,
  locale = 'en-US',
  countryFacetId,
  countryFacetParameter = 'locationCountry',
  irelandOnly = false,
  maxPages = 15,
  pageSize = 20,
  delayMs = 200,
  sourceDetail = `${name} Careers`,
  onProgress,
} = {}) {
  const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`
  const ask = (appliedFacets, offset) => postJSON(endpoint, { appliedFacets, limit: pageSize, offset, searchText: '' })

  let appliedFacets = {}
  if (!irelandOnly) {
    if (countryFacetId) {
      appliedFacets = { [countryFacetParameter]: [countryFacetId] }
    } else {
      const probe = await ask({}, 0)
      const facet = findWorkdayCountryFacet(probe.facets)
      // A site that lists its countries and does not list Ireland simply has nothing
      // here today. That is an empty result, not a broken collector.
      if (!facet.facetParameter) {
        if (facet.noIrelandJobs) {
          onProgress?.(`${name}: no Ireland vacancies open`)
          return []
        }
        throw new Error('no Ireland location facet on this Workday site')
      }
      appliedFacets = { [facet.facetParameter]: facet.ids }
    }
  }

  const jobs = []
  let offset = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && offset < total) {
    const data = await ask(appliedFacets, offset)
    const rows = data.jobPostings || []
    if (Number(data.total) > 0) total = Number(data.total)
    jobs.push(...rows.map((job) => mapWorkdayJob(job, {
      company: name, host, site, sourceDetail, locale, assumeIreland: true,
    })))
    onProgress?.(`${name}: page ${page}, ${Math.min(offset + rows.length, total)}/${total}`)
    if (!rows.length) break
    offset += pageSize
    page++
    if (offset < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

/* ------------------------------------------------- SAP SuccessFactors (RCM) */

// Every SuccessFactors career site renders the same results table, so one parser
// covers EY, and any other employer running the same product.
export function parseSuccessFactorsSearch(html, {
  company,
  sourceDetail = `${company} Careers`,
  origin,
  locationFilter,
} = {}) {
  const text = String(html)
  const total = Number(text.match(/of\s*<b>\s*([\d,]+)\s*<\/b>/i)?.[1]?.replace(/,/g, '')) || 0
  const keep = locationFilter || ((location) => /\bIE\b|Ireland/i.test(location) || isIrishLocation(location))
  const jobs = []

  for (const row of text.split(/<tr[^>]*class="[^"]*data-row[^"]*"[^>]*>/i).slice(1)) {
    const anchor = row.match(/<a\s+([^>]*jobTitle-link[^>]*)>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const href = anchor[1].match(/href="([^"]+)"/i)?.[1]
    if (!href) continue

    const location = (row.match(/<span[^>]*class="[^"]*jobLocation[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!keep(location)) continue

    const department = (row.match(/<span[^>]*class="[^"]*jobDepartment[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    jobs.push({
      title: anchor[2].replace(/\s+/g, ' ').trim(),
      company,
      locationRaw: location,
      url: new URL(href.replace(/&amp;/gi, '&'), origin).href,
      description: department || undefined,
      source: 'employer',
      sourceDetail,
    })
  }

  return { jobs, total: total || jobs.length }
}

export async function fetchSuccessFactors({
  name,
  searchUrl,
  maxPages = 10,
  pageSize = 25,
  delayMs = 200,
  sourceDetail = `${name} Careers`,
  locationFilter,
  onProgress,
} = {}) {
  const origin = new URL(searchUrl).origin
  const separator = searchUrl.includes('?') ? '&' : '?'
  const jobs = []
  let offset = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && offset < total) {
    const html = await getText(`${searchUrl}${separator}startrow=${offset}`)
    const result = parseSuccessFactorsSearch(html, { company: name, sourceDetail, origin, locationFilter })
    total = result.total
    jobs.push(...result.jobs)
    onProgress?.(`${name}: page ${page}, ${Math.min(offset + result.jobs.length, total)}/${total}`)
    if (!result.jobs.length) break
    offset += pageSize
    page++
    if (offset < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

/* -------------------------------------------------------- Oracle Recruiting */

export function mapOracleJob(req, { company, host, site, sourceDetail }) {
  const locations = [req.PrimaryLocation, ...(req.secondaryLocations || []).map((l) => l.Name)]
    .filter(Boolean)
  return {
    title: req.Title,
    company,
    locationRaw: [...new Set(locations)].join('; ') || 'Ireland',
    url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${req.Id}`,
    postedAt: req.PostedDate,
    description: [req.ShortDescriptionStr, req.JobFamily].filter(Boolean).join(' '),
    workMode: workModeFrom(req.WorkplaceType || req.WorkplaceTypeCode),
    employmentType: employmentFrom(req.JobSchedule || req.JobType),
    source: 'employer',
    sourceDetail,
  }
}

export async function fetchOracleRecruiting({
  name,
  host,
  site,
  pageSize = 200,
  maxPages = 10,
  delayMs = 200,
  sourceDetail = `${name} Careers`,
  onProgress,
} = {}) {
  const jobs = []
  let offset = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && offset < total) {
    const finder = `findReqs;siteNumber=${site},limit=${pageSize},offset=${offset},sortBy=POSTING_DATES_DESC`
    const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions`
      + `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURI(finder)}`
    const data = await getJSON(url)
    const bundle = data.items?.[0] || {}
    const rows = bundle.requisitionList || []
    if (Number(bundle.TotalJobsCount) > 0) total = Number(bundle.TotalJobsCount)

    for (const req of rows) {
      const where = [req.PrimaryLocation, ...(req.secondaryLocations || []).map((l) => l.Name)].filter(Boolean)
      if (!where.some((loc) => isIrishLocation(loc))) continue
      jobs.push(mapOracleJob(req, { company: name, host, site, sourceDetail }))
    }

    onProgress?.(`${name}: page ${page}, ${jobs.length} in Ireland of ${Math.min(offset + rows.length, total)}/${total}`)
    if (!rows.length) break
    offset += pageSize
    page++
    if (offset < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

/* ---------------------------------------------------------------- Eightfold */

export function mapEightfoldJob(position, { company, tenant, sourceDetail }) {
  const locations = position.locations?.length ? position.locations : [position.location].filter(Boolean)
  return {
    title: position.name,
    company,
    locationRaw: [...new Set(locations)].join('; ') || 'Ireland',
    url: position.canonicalPositionUrl || `https://${tenant}.eightfold.ai/careers/job/${position.id}`,
    postedAt: position.t_create || position.t_update,
    description: position.job_description,
    workMode: workModeFrom(position.work_location_option),
    employmentType: employmentFrom(position.type),
    source: 'employer',
    sourceDetail,
  }
}

export async function fetchEightfold({
  name,
  tenant,
  domain,
  pageSize = 100,
  maxPages = 10,
  delayMs = 200,
  sourceDetail = `${name} Careers`,
  onProgress,
} = {}) {
  const jobs = []
  let start = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && start < total) {
    const query = new URLSearchParams({
      domain,
      location: 'Ireland',
      start: String(start),
      num: String(pageSize),
      sort_by: 'relevance',
    })
    const data = await getJSON(`https://${tenant}.eightfold.ai/api/apply/v2/jobs?${query}`)
    const rows = (data.positions || []).filter((p) => {
      const where = p.locations?.length ? p.locations : [p.location]
      return where.some((loc) => isIrishLocation(loc))
    })
    total = Number(data.count) || rows.length
    jobs.push(...rows.map((p) => mapEightfoldJob(p, { company: name, tenant, sourceDetail })))
    onProgress?.(`${name}: page ${page}, ${jobs.length} in Ireland`)
    if (!data.positions?.length) break
    start += pageSize
    page++
    if (start < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

/* ------------------------------------------------------------------ Avature */

export function parseAvatureSearch(html, { company, sourceDetail = `${company} Careers`, origin } = {}) {
  const text = String(html)
  const total = Number(text.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+results/i)?.[1]?.replace(/,/g, '')) || 0
  const jobs = []
  const row = /<div class="list__item__text__title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>[\s\S]*?<div class="list__item__text__subtitle">\s*<span>([\s\S]*?)<\/span>[\s\S]*?<div class="list__item__description">([\s\S]*?)<\/div>/gi

  for (const match of text.matchAll(row)) {
    jobs.push({
      title: match[2],
      company,
      locationRaw: match[3],
      url: origin ? new URL(match[1], origin).href : match[1],
      description: match[4],
      source: 'employer',
      sourceDetail,
    })
  }

  return { jobs, total: total || jobs.length }
}

export async function fetchAvature({
  name,
  searchUrl,
  maxPages = 10,
  pageSize = 10,
  delayMs = 200,
  sourceDetail = `${name} Careers`,
  onProgress,
} = {}) {
  const origin = new URL(searchUrl).origin
  const separator = searchUrl.includes('?') ? '&' : '?'
  const jobs = []
  let offset = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && offset < total) {
    const html = await getText(`${searchUrl}${separator}folderOffset=${offset}`)
    const result = parseAvatureSearch(html, { company: name, sourceDetail, origin })
    total = result.total
    jobs.push(...result.jobs)
    onProgress?.(`${name}: page ${page}, ${Math.min(offset + result.jobs.length, total)}/${total}`)
    if (!result.jobs.length) break
    offset += pageSize
    page++
    if (offset < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

/* -------------------------------------------------------------------- iCIMS */

export function parseIcimsSearch(html, { company, sourceDetail = `${company} Careers`, origin } = {}) {
  const text = String(html)
  const total = Number(text.match(/of\s+([\d,]+)\s+(?:job|result)/i)?.[1]?.replace(/,/g, '')) || 0
  const jobs = []

  for (const block of text.split(/<div[^>]*class="[^"]*\brow\b[^"]*"[^>]*>/i).slice(1)) {
    const anchor = block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*class="[^"]*\btitle\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!anchor) continue

    const location = (block.match(/Job Locations?[\s\S]{0,200}?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || block.match(/<div[^>]*class="[^"]*\bheader\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (location && !isIrishLocation(location.replace(/^IE-/, 'Ireland '))) continue

    jobs.push({
      title: anchor[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      company,
      locationRaw: location.replace(/^IE-/, '') || 'Ireland',
      url: origin ? new URL(anchor[1], origin).href : anchor[1],
      source: 'employer',
      sourceDetail,
    })
  }

  return { jobs, total: total || jobs.length }
}

export async function fetchIcims({
  name,
  searchUrl,
  maxPages = 10,
  delayMs = 250,
  sourceDetail = `${name} Careers`,
  onProgress,
} = {}) {
  const origin = new URL(searchUrl).origin
  const separator = searchUrl.includes('?') ? '&' : '?'
  const jobs = []

  for (let page = 1; page <= maxPages; page++) {
    const html = await getText(`${searchUrl}${separator}pr=${page - 1}`, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    })
    const result = parseIcimsSearch(html, { company: name, sourceDetail, origin })
    jobs.push(...result.jobs)
    onProgress?.(`${name}: page ${page}, ${jobs.length} in Ireland`)
    if (!result.jobs.length) break
    if (page < maxPages) await sleep(delayMs)
  }

  return jobs
}

/* ------------------------------------------------------------------ Runner */

export const PLATFORM_ADAPTERS = {
  workday: fetchWorkday,
  successfactors: fetchSuccessFactors,
  oracle: fetchOracleRecruiting,
  eightfold: fetchEightfold,
  avature: fetchAvature,
  icims: fetchIcims,
}

// Runs every employer in the list, keeping going when one site is down or has
// changed its markup. A broken employer is one line in the run notes, not a
// failed refresh.
export async function fetchPlatformEmployers({
  companies = [],
  delayMs = 250,
  concurrency = 4,
  onProgress,
} = {}) {
  const queue = companies.filter((c) => c && c.enabled !== false)
  const jobs = []
  const errors = []
  let cursor = 0

  const worker = async () => {
    while (cursor < queue.length) {
      const company = queue[cursor++]
      const adapter = PLATFORM_ADAPTERS[company.platform]

      if (!adapter) {
        errors.push(`${company.name || company.platform}: unknown platform "${company.platform}"`)
        continue
      }

      try {
        const found = await adapter({ ...company, onProgress })
        jobs.push(...found)
        onProgress?.(`${company.name}: ${found.length} in Ireland`)
      } catch (err) {
        errors.push(`${company.name}: ${err.message}`)
      }

      await sleep(delayMs)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  return { jobs, errors }
}

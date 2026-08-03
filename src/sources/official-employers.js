import { getJSON, getText, postJSON, sleep } from './http.js'
import {
  fetchAvature,
  fetchSuccessFactors,
  fetchWorkday,
  mapWorkdayJob,
  parseAvatureSearch,
  parseSuccessFactorsSearch,
} from './platforms.js'

const APPLE_SEARCH_URL = 'https://jobs.apple.com/en-ie/search?location=ireland-IRL'
const AMAZON_SEARCH_URL = 'https://www.amazon.jobs/en/search.json'
const AMAZON_LOCATIONS = ['dublin-ireland', 'cork-ireland']
const MICROSOFT_SEARCH_URL = 'https://apply.careers.microsoft.com/api/pcsx/search'
const KPMG_SEARCH_URL = 'https://kpmgireland.avature.net/experiencedhires/SearchJobs/'
const DELOITTE_ORIGIN = 'https://deloitteie.wd3.myworkdayjobs.com'
const DELOITTE_SITE = 'Experienced_Professionals'
const PWC_SEARCH_URL = 'https://www.pwc.ie/careers-ie/experienced-jobs.html'
const EY_SEARCH_URL = 'https://careers.ey.com/ey/search/?q=&locationsearch=Ireland'

function appleHydrationData(html) {
  const scripts = [...String(html).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  const script = scripts.map((match) => match[1])
    .find((body) => body.includes('window.__staticRouterHydrationData'))

  if (!script) throw new Error('Apple search data not found')

  const marker = 'JSON.parse('
  const start = script.indexOf(marker)
  const end = script.lastIndexOf(');')
  if (start < 0 || end < start) throw new Error('Apple search data has changed format')

  try {
    return JSON.parse(JSON.parse(script.slice(start + marker.length, end)))
  } catch {
    throw new Error('Apple search data could not be decoded')
  }
}

export function parseAppleSearch(html) {
  const search = appleHydrationData(html)?.loaderData?.search
  if (!search || !Array.isArray(search.searchResults)) {
    throw new Error('Apple search results not found')
  }

  const jobs = search.searchResults
    .filter((job) => job.postExternal !== false)
    .map((job) => {
      const locations = (job.locations || [])
        .filter((location) => location.countryName === 'Ireland')
        .map((location) => [location.name, location.countryName].filter(Boolean).join(', '))
      const slug = job.transformedPostingTitle || 'job'
      const team = job.team?.teamCode ? `?team=${encodeURIComponent(job.team.teamCode)}` : ''

      return {
        title: job.postingTitle,
        company: 'Apple',
        locationRaw: [...new Set(locations)].join('; ') || 'Ireland',
        url: `https://jobs.apple.com/en-ie/details/${job.reqId}/${slug}${team}`,
        postedAt: job.postDateInGMT || job.postingDate,
        description: [job.jobSummary, job.team?.teamName].filter(Boolean).join(' '),
        workMode: job.homeOffice ? 'remote' : undefined,
        employmentType: job.standardWeeklyHours && job.standardWeeklyHours < 30 ? 'part_time' : 'full_time',
        source: 'employer',
        sourceDetail: 'Apple Careers',
      }
    })

  return {
    jobs,
    page: Number(search.page) || 1,
    total: Number(search.totalRecords) || jobs.length,
  }
}

export async function fetchAppleCareers({ maxPages = 10, delayMs = 200, onProgress } = {}) {
  const jobs = []
  let page = 1
  let total = Infinity

  while (page <= maxPages && jobs.length < total) {
    const html = await getText(`${APPLE_SEARCH_URL}&page=${page}`)
    const result = parseAppleSearch(html)
    total = result.total
    jobs.push(...result.jobs)
    onProgress?.(`Apple Careers: page ${page}, ${jobs.length}/${total}`)
    if (!result.jobs.length) break
    page++
    if (jobs.length < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

export function mapAmazonJob(job) {
  const schedule = String(job.job_schedule_type || '').toLowerCase()
  return {
    title: job.title,
    company: 'Amazon',
    locationRaw: job.normalized_location || job.location || [job.city, 'Ireland'].filter(Boolean).join(', '),
    url: new URL(job.job_path, 'https://www.amazon.jobs').href,
    postedAt: job.posted_date,
    description: [job.description, job.basic_qualifications, job.preferred_qualifications].filter(Boolean).join(' '),
    employmentType: schedule.includes('part') ? 'part_time'
      : schedule.includes('full') ? 'full_time'
        : schedule.includes('contract') ? 'contract' : undefined,
    source: 'employer',
    sourceDetail: 'Amazon Jobs',
  }
}

export async function fetchAmazonJobs({
  locations = AMAZON_LOCATIONS,
  pageSize = 100,
  maxPages = 10,
  delayMs = 200,
  onProgress,
} = {}) {
  const byUrl = new Map()

  for (const location of locations) {
    let offset = 0
    let total = Infinity
    let page = 1

    while (page <= maxPages && offset < total) {
      const query = new URLSearchParams({
        'location[]': location,
        result_limit: String(pageSize),
        offset: String(offset),
      })
      const data = await getJSON(`${AMAZON_SEARCH_URL}?${query}`)
      const rows = (data.jobs || []).filter((job) => job.country_code === 'IRL')
      for (const job of rows) {
        const mapped = mapAmazonJob(job)
        byUrl.set(mapped.url, mapped)
      }
      total = Number(data.hits) || 0
      onProgress?.(`Amazon Jobs/${location}: page ${page}, ${Math.min(offset + data.jobs.length, total)}/${total}`)
      if (!data.jobs?.length) break
      offset += pageSize
      page++
      if (offset < total && page <= maxPages) await sleep(delayMs)
    }
    await sleep(delayMs)
  }

  return [...byUrl.values()]
}

export function mapMicrosoftJob(job) {
  const mode = String(job.workLocationOption || '').toLowerCase()
  return {
    title: job.name,
    company: 'Microsoft',
    locationRaw: (job.standardizedLocations || job.locations || []).join('; ') || 'Ireland',
    url: new URL(job.positionUrl || `/careers/job/${job.id}`, 'https://apply.careers.microsoft.com').href,
    postedAt: job.postedTs ? Number(job.postedTs) : undefined,
    description: job.department,
    workMode: mode.includes('remote') ? 'remote'
      : mode.includes('hybrid') ? 'hybrid'
        : mode.includes('onsite') ? 'onsite' : undefined,
    source: 'employer',
    sourceDetail: 'Microsoft Careers',
  }
}

export async function fetchMicrosoftCareers({ maxPages = 10, pageSize = 10, delayMs = 200, onProgress } = {}) {
  const jobs = []
  let start = 0
  let total = Infinity
  let page = 1

  while (page <= maxPages && start < total) {
    const query = new URLSearchParams({
      domain: 'microsoft.com',
      query: '',
      location: 'Ireland',
      start: String(start),
      hl: 'en',
    })
    const data = await getJSON(`${MICROSOFT_SEARCH_URL}?${query}`, {
      headers: { Referer: 'https://apply.careers.microsoft.com/careers?location=Ireland&hl=en' },
    })
    const rows = data?.data?.positions || []
    total = Number(data?.data?.count) || 0
    jobs.push(...rows.map(mapMicrosoftJob))
    onProgress?.(`Microsoft Careers: page ${page}, ${Math.min(start + rows.length, total)}/${total}`)
    if (!rows.length) break
    start += pageSize
    page++
    if (start < total && page <= maxPages) await sleep(delayMs)
  }

  return jobs
}

// KPMG Ireland runs Avature, shared with the other Avature employers.
export function parseKpmgSearch(html) {
  return parseAvatureSearch(html, {
    company: 'KPMG',
    sourceDetail: 'KPMG Careers',
    origin: new URL(KPMG_SEARCH_URL).origin,
  })
}

export async function fetchKpmgCareers({ maxPages = 10, pageSize = 10, delayMs = 200, onProgress } = {}) {
  return fetchAvature({
    name: 'KPMG',
    searchUrl: KPMG_SEARCH_URL,
    sourceDetail: 'KPMG Careers',
    maxPages,
    pageSize,
    delayMs,
    onProgress,
  })
}

// Deloitte Ireland runs its own Workday tenant, so every vacancy on it is Irish
// and no country facet is needed. The mapping itself is the shared Workday one.
export function mapDeloitteJob(job) {
  return mapWorkdayJob(job, {
    company: 'Deloitte',
    host: new URL(DELOITTE_ORIGIN).host,
    site: DELOITTE_SITE,
    sourceDetail: 'Deloitte Careers',
  })
}

export async function fetchDeloitteCareers({ maxPages = 10, pageSize = 20, delayMs = 200, onProgress } = {}) {
  return fetchWorkday({
    name: 'Deloitte',
    host: new URL(DELOITTE_ORIGIN).host,
    tenant: 'deloitteie',
    site: DELOITTE_SITE,
    sourceDetail: 'Deloitte Careers',
    irelandOnly: true,
    maxPages,
    pageSize,
    delayMs,
    onProgress,
  })
}

export function parsePwcSearch(html) {
  const marker = 'var jsondata = '
  const start = String(html).indexOf(marker)
  if (start < 0) throw new Error('PwC search data not found')
  const arrayStart = start + marker.length
  let end = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = arrayStart; i < String(html).length; i++) {
    const char = String(html)[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '[') depth++
    else if (char === ']') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end < arrayStart) throw new Error('PwC search data has changed format')

  let rows
  try {
    rows = JSON.parse(String(html).slice(arrayStart, end + 1))
  } catch {
    throw new Error('PwC search data could not be decoded')
  }

  return rows
    .filter((job) => job.iso === 'IRL')
    .map((job) => {
      const type = String(job.timetype || '').toLowerCase()
      return {
        title: job.title,
        company: 'PwC',
        locationRaw: [job.location, job.otherlocations].filter(Boolean).join('; ') || 'Ireland',
        url: String(job.apply || '').replace(/\/apply(?:\?.*)?$/, ''),
        postedAt: job.date,
        description: [job.grade, job.los, job.specialism].filter((value) => value && value !== 'Not Applicable').join(' '),
        employmentType: type.includes('part') ? 'part_time' : type.includes('full') ? 'full_time' : undefined,
        source: 'employer',
        sourceDetail: 'PwC Careers',
      }
    })
}

export async function fetchPwcCareers({ onProgress } = {}) {
  const html = await getText(PWC_SEARCH_URL)
  const jobs = parsePwcSearch(html)
  onProgress?.(`PwC Careers: ${jobs.length} Ireland jobs`)
  return jobs
}

// EY's board is SAP SuccessFactors, the same product a lot of other multinationals
// use, so it goes through the shared parser.
export function parseEySearch(html) {
  return parseSuccessFactorsSearch(html, {
    company: 'EY',
    sourceDetail: 'EY Careers',
    origin: 'https://careers.ey.com',
  })
}

export async function fetchEyCareers({ maxPages = 10, pageSize = 25, delayMs = 200, onProgress } = {}) {
  return fetchSuccessFactors({
    name: 'EY',
    searchUrl: EY_SEARCH_URL,
    sourceDetail: 'EY Careers',
    maxPages,
    pageSize,
    delayMs,
    onProgress,
  })
}

export async function fetchOfficialEmployers({ settings = {}, onProgress } = {}) {
  const jobs = []
  const errors = []

  if (settings.apple !== false) {
    try {
      const apple = await fetchAppleCareers({ maxPages: settings.appleMaxPages, onProgress })
      jobs.push(...apple)
    } catch (err) {
      errors.push(`Apple Careers: ${err.message}`)
    }
  }

  if (settings.amazon !== false) {
    try {
      const amazon = await fetchAmazonJobs({ maxPages: settings.amazonMaxPages, onProgress })
      jobs.push(...amazon)
    } catch (err) {
      errors.push(`Amazon Jobs: ${err.message}`)
    }
  }

  if (settings.microsoft !== false) {
    try {
      const microsoft = await fetchMicrosoftCareers({ maxPages: settings.microsoftMaxPages, onProgress })
      jobs.push(...microsoft)
    } catch (err) {
      errors.push(`Microsoft Careers: ${err.message}`)
    }
  }

  if (settings.kpmg !== false) {
    try {
      const kpmg = await fetchKpmgCareers({ maxPages: settings.kpmgMaxPages, onProgress })
      jobs.push(...kpmg)
    } catch (err) {
      errors.push(`KPMG Careers: ${err.message}`)
    }
  }

  if (settings.deloitte !== false) {
    try {
      const deloitte = await fetchDeloitteCareers({ maxPages: settings.deloitteMaxPages, onProgress })
      jobs.push(...deloitte)
    } catch (err) {
      errors.push(`Deloitte Careers: ${err.message}`)
    }
  }

  if (settings.pwc !== false) {
    try {
      const pwc = await fetchPwcCareers({ onProgress })
      jobs.push(...pwc)
    } catch (err) {
      errors.push(`PwC Careers: ${err.message}`)
    }
  }

  if (settings.ey !== false) {
    try {
      const ey = await fetchEyCareers({ maxPages: settings.eyMaxPages, onProgress })
      jobs.push(...ey)
    } catch (err) {
      errors.push(`EY Careers: ${err.message}`)
    }
  }

  // Every collector above reads an Ireland careers site, so a listing whose office
  // name the gazetteer cannot place is still an Irish job.
  return { jobs: jobs.map((j) => ({ country: 'ie', ...j })), errors }
}

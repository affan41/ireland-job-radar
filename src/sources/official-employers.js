import { getJSON, getText, sleep } from './http.js'

const APPLE_SEARCH_URL = 'https://jobs.apple.com/en-ie/search?location=ireland-IRL'
const AMAZON_SEARCH_URL = 'https://www.amazon.jobs/en/search.json'
const AMAZON_LOCATIONS = ['dublin-ireland', 'cork-ireland']
const MICROSOFT_SEARCH_URL = 'https://apply.careers.microsoft.com/api/pcsx/search'

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

  return { jobs, errors }
}

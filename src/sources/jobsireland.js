// JobsIreland is the Irish government's public employment service, operated by
// the Department of Social Protection. Its public site uses this JSON endpoint
// to power the vacancy search; no account or API key is required to read it.

import { getJSON } from './http.js'

const ENDPOINT = 'https://api.jobsireland.ie/api/Job/SearchVacancies'

function urlFor({ page = 1, pageSize, contractType = '' }) {
  const p = new URLSearchParams({
    keyWord: '',
    location: '',
    vacancyId: '-1',
    CareerlevelId: '-1',
    ContractType: contractType,
    page: String(page),
    pageSize: String(pageSize),
    VacancytypeId: '-1',
    RemoteOrBlendedJobType: '-1',
    NaceCode: '',
  })
  return `${ENDPOINT}?${p}`
}

export function mapJobsIrelandJob(j, employmentType) {
  const id = Number(j.JobId)
  return {
    source: 'jobsireland',
    sourceDetail: 'Department of Social Protection',
    title: j.JobTitle,
    company: j.EmployerName,
    locationRaw: j.Location,
    url: Number.isFinite(id) && id > 0
      ? `https://api.jobsireland.ie/#id=${id}`
      : 'https://api.jobsireland.ie/#browse-jobs/0',
    description: j.Description,
    postedAt: j.StartDate,
    employmentType,
  }
}

export async function fetchJobsIreland({ latestPageSize = 250, latestPages = 4, partTimeLimit = 250, onProgress } = {}) {
  const out = []
  const errors = []

  // Run the two public searches together. The general feed catches fresh finance
  // and tech roles; the dedicated filter guarantees coverage of every currently
  // advertised part-time role even when its title does not say "part-time".
  const searches = [
    ...Array.from({ length: Math.max(Number(latestPages) || 0, 0) }, (_, i) => ({
      name: `latest page ${i + 1}`,
      page: i + 1,
      pageSize: latestPageSize,
      contractType: '',
      employmentType: undefined,
    })),
    { name: 'part-time', pageSize: partTimeLimit, contractType: 'Part-time', employmentType: 'part_time' },
  ].filter((s) => Number(s.pageSize) > 0)

  const settled = await Promise.allSettled(searches.map(async (s) => ({
    search: s,
    rows: await getJSON(urlFor(s), { timeout: 70000, retries: 1 }),
  })))

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    const search = searches[i]
    if (result.status === 'rejected') {
      errors.push(`jobsireland ${search.name}: ${result.reason?.message || result.reason}`)
      continue
    }
    const rows = Array.isArray(result.value.rows) ? result.value.rows : []
    for (const j of rows) out.push(mapJobsIrelandJob(j, search.employmentType))
    onProgress?.(`jobsireland ${search.name}: ${rows.length}`)
  }

  return { jobs: out, errors }
}

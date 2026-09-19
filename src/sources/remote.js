// Remote boards cover career and student work. Preserve their employment type
// and full description, and require an advertised hiring area including Ireland.

import { getJSON } from './http.js'

import { irelandRemoteLocation } from '../remote-student.js'

export function remoteEmploymentType(value) {
  const text = (Array.isArray(value) ? value.join(' ') : String(value || '')).replace(/[_-]/g, ' ')
  if (/full\s*time/i.test(text)) return 'full_time'
  if (/freelance|contract/i.test(text)) return 'contract'
  if (/part\s*time/i.test(text)) return 'part_time'
  return undefined
}

export async function fetchRemote({ onProgress, request = getJSON, himalayasPages = 25 } = {}) {
  const out = []
  const errors = []

  // Remotive
  try {
    const d = await request('https://remotive.com/api/remote-jobs')
    let n = 0
    for (const j of d.jobs || []) {
      if (!irelandRemoteLocation(j.candidate_required_location)) continue
      out.push({
        source: 'remote',
        sourceDetail: 'remotive',
        title: j.title,
        company: j.company_name,
        locationRaw: j.candidate_required_location,
        regionHint: 'remote',
        url: j.url,
        description: j.description,
        employmentType: remoteEmploymentType(j.job_type),
        postedAt: j.publication_date,
        salaryText: j.salary || null,
        workMode: 'remote',
      })
      n++
    }
    onProgress?.(`remotive: ${n} Ireland-eligible`)
  } catch (err) { errors.push(`remotive: ${err.message}`) }

  // Himalayas. Its API hands back 20 at a time whatever you ask for, so page through.
  try {
    let n = 0
    let scanned = 0
    for (let page = 0; page < himalayasPages; page++) {
      const d = await request(`https://himalayas.app/jobs/api?limit=20&offset=${page * 20}`)
      const batch = d.jobs || []
      if (!batch.length) break
      scanned += batch.length

      for (const j of batch) {
        const restrictions = (j.locationRestrictions || []).join(', ')
        // Missing restrictions are not evidence of Ireland eligibility.
        if (!irelandRemoteLocation(restrictions)) continue
        out.push({
          source: 'remote',
          sourceDetail: 'himalayas',
          title: j.title,
          company: j.companyName,
          locationRaw: restrictions || 'Remote, no location restriction',
          regionHint: 'remote',
          url: j.applicationLink || j.guid,
          description: j.description || j.excerpt,
          employmentType: remoteEmploymentType(j.employmentType),
          postedAt: j.pubDate,
          salaryMin: j.minSalary || null,
          salaryMax: j.maxSalary || null,
          salaryCurrency: j.currency || null,
          salaryPeriod: j.salaryPeriod === 'annual' ? 'year' : j.salaryPeriod || null,
          workMode: 'remote',
        })
        n++
      }
    }
    onProgress?.(`himalayas: ${n} of ${scanned} Ireland-eligible`)
  } catch (err) { errors.push(`himalayas: ${err.message}`) }

  // Jobicy
  try {
    const d = await request('https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe')
    let n = 0
    for (const j of d.jobs || []) {
      if (!irelandRemoteLocation(j.jobGeo)) continue
      out.push({
        source: 'remote',
        sourceDetail: 'jobicy',
        title: j.jobTitle,
        company: j.companyName,
        locationRaw: j.jobGeo,
        regionHint: 'remote',
        url: j.url,
        description: j.jobDescription || j.jobExcerpt,
        employmentType: remoteEmploymentType(j.jobType),
        postedAt: j.pubDate,
        salaryMin: j.salaryMin || null,
        salaryMax: j.salaryMax || null,
        salaryCurrency: j.salaryCurrency || null,
        salaryPeriod: j.salaryPeriod === 'yearly' ? 'year' : j.salaryPeriod || null,
        workMode: 'remote',
      })
      n++
    }
    onProgress?.(`jobicy: ${n} Ireland-eligible`)
  } catch (err) { errors.push(`jobicy: ${err.message}`) }

  // Arbeitnow (EU-focused)
  try {
    const d = await request('https://www.arbeitnow.com/api/job-board-api')
    let n = 0
    for (const j of d.data || []) {
      const loc = j.location || ''
      if (!irelandRemoteLocation(loc)) continue
      const irish = /\b(ireland|dublin|cork|galway|limerick)\b/i.test(loc)
      if (!irish && !j.remote) continue
      out.push({
        source: 'remote',
        sourceDetail: 'arbeitnow',
        title: j.title,
        company: j.company_name,
        locationRaw: loc,
        regionHint: irish ? undefined : 'remote',
        url: j.url,
        description: j.description,
        employmentType: remoteEmploymentType(j.job_types),
        postedAt: j.created_at,
        workMode: j.remote ? 'remote' : undefined,
      })
      n++
    }
    onProgress?.(`arbeitnow: ${n} relevant`)
  } catch (err) { errors.push(`arbeitnow: ${err.message}`) }

  return { jobs: out, errors }
}

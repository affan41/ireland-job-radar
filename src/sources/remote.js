// Remote-first boards, for the hybrid and fully remote IT / AI roles that an
// Ireland-only search misses. These boards are heavily US-weighted, so the filter
// below is deliberately strict: a listing only counts if it explicitly says
// Ireland, the EU, Europe, EMEA, or worldwide, and does not say US-only.

import { getJSON } from './http.js'

const EUROPE_OK = /\b(ireland|irish|dublin|emea|europe|european|eu\b|worldwide|anywhere|global)\b/i
const US_ONLY = /\b(us only|usa only|united states only|us[- ]based only|must reside in the (us|united states)|remote in (the )?(us|usa|united states)|\(us\)|us[- ]remote)\b/i
const US_LOCK = /^\s*(united states|usa|us)\s*$/i

function europeEligible(...fields) {
  const hay = fields.filter(Boolean).join(' | ')
  if (!hay) return false
  if (US_ONLY.test(hay)) return false
  if (US_LOCK.test(hay.trim())) return false
  return EUROPE_OK.test(hay)
}

export async function fetchRemote({ onProgress } = {}) {
  const out = []
  const errors = []

  // Remotive
  try {
    const d = await getJSON('https://remotive.com/api/remote-jobs?limit=300')
    let n = 0
    for (const j of d.jobs || []) {
      if (!europeEligible(j.candidate_required_location, j.title)) continue
      out.push({
        source: 'remote',
        sourceDetail: 'remotive',
        title: j.title,
        company: j.company_name,
        locationRaw: j.candidate_required_location,
        regionHint: 'remote',
        url: j.url,
        description: j.description,
        postedAt: j.publication_date,
        salaryText: j.salary || null,
        workMode: 'remote',
      })
      n++
    }
    onProgress?.(`remotive: ${n} Europe-eligible`)
  } catch (err) { errors.push(`remotive: ${err.message}`) }

  // Himalayas. Its API hands back 20 at a time whatever you ask for, so page through.
  try {
    let n = 0
    let scanned = 0
    for (let page = 0; page < 8; page++) {
      const d = await getJSON(`https://himalayas.app/jobs/api?limit=20&offset=${page * 20}`)
      const batch = d.jobs || []
      if (!batch.length) break
      scanned += batch.length

      for (const j of batch) {
        const restrictions = (j.locationRestrictions || []).join(', ')
        // No stated restriction on a remote-first board means anywhere.
        if (!europeEligible(restrictions || 'worldwide', j.title)) continue
        out.push({
          source: 'remote',
          sourceDetail: 'himalayas',
          title: j.title,
          company: j.companyName,
          locationRaw: restrictions || 'Remote, no location restriction',
          regionHint: 'remote',
          url: j.applicationLink || j.guid,
          description: j.excerpt || j.description,
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
    onProgress?.(`himalayas: ${n} of ${scanned} Europe-eligible`)
  } catch (err) { errors.push(`himalayas: ${err.message}`) }

  // Jobicy
  try {
    const d = await getJSON('https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe')
    let n = 0
    for (const j of d.jobs || []) {
      if (!europeEligible(j.jobGeo, j.jobTitle)) continue
      out.push({
        source: 'remote',
        sourceDetail: 'jobicy',
        title: j.jobTitle,
        company: j.companyName,
        locationRaw: j.jobGeo,
        regionHint: 'remote',
        url: j.url,
        description: j.jobExcerpt || j.jobDescription,
        postedAt: j.pubDate,
        salaryMin: j.salaryMin || null,
        salaryMax: j.salaryMax || null,
        salaryCurrency: j.salaryCurrency || null,
        salaryPeriod: j.salaryPeriod === 'yearly' ? 'year' : j.salaryPeriod || null,
        workMode: 'remote',
      })
      n++
    }
    onProgress?.(`jobicy: ${n} Europe-eligible`)
  } catch (err) { errors.push(`jobicy: ${err.message}`) }

  // Arbeitnow (EU-focused)
  try {
    const d = await getJSON('https://www.arbeitnow.com/api/job-board-api')
    let n = 0
    for (const j of d.data || []) {
      const loc = j.location || ''
      // tags is usually an array but the feed is not consistent about it.
      const tags = Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags ?? '')
      // Keep Irish listings, plus remote roles posted on an EU board.
      const irish = /\b(ireland|dublin|cork|galway|limerick)\b/i.test(loc)
      if (!irish && !(j.remote && EUROPE_OK.test(`${loc} ${tags}`))) continue
      out.push({
        source: 'remote',
        sourceDetail: 'arbeitnow',
        title: j.title,
        company: j.company_name,
        locationRaw: loc,
        regionHint: irish ? undefined : 'remote',
        url: j.url,
        description: j.description,
        postedAt: j.created_at,
        workMode: j.remote ? 'remote' : undefined,
      })
      n++
    }
    onProgress?.(`arbeitnow: ${n} relevant`)
  } catch (err) { errors.push(`arbeitnow: ${err.message}`) }

  return { jobs: out, errors }
}

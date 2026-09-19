import { getJSON } from './http.js'
import { isIrishLocation } from '../regions.js'

export function mapRecruiteeJob(job, {name, slug}, now = Date.now()) {
  if (job.status !== 'published' || (job.close_at && Date.parse(job.close_at) < now)) return null
  if (job.country_code !== 'IE' && !isIrishLocation(job.location || job.city)) return null
  const type = String(job.employment_type_code || '')
  const origin = `https://${slug}.recruitee.com`
  const url = new URL(job.careers_url || `/o/${encodeURIComponent(job.slug)}`, origin)
  if (url.origin !== origin) return null
  return {
    title: job.title, company: job.company_name || name,
    locationRaw: job.location || [job.city, job.country].filter(Boolean).join(', '),
    url: url.href, country: 'ie', source: 'employer', sourceDetail: `${name} Careers`,
    description: [job.description, job.requirements].filter(Boolean).join(' '),
    postedAt: job.published_at,
    // The API's default min/max range (often 4-40) is not a promised schedule.
    employmentType: type.includes('fulltime') ? 'full_time' : type.includes('parttime') ? 'part_time' : undefined,
  }
}

export async function fetchRecruitee(company) {
  const data = await getJSON(`https://${company.slug}.recruitee.com/api/offers/`)
  if (!Array.isArray(data.offers)) throw new Error('Vacancy list missing from Recruitee response')
  return data.offers.map(job => mapRecruiteeJob(job, company)).filter(Boolean)
}

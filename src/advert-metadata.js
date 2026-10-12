import { load } from 'cheerio'

// Rituals repeats related vacancies in the page's component data. Only facts
// tied to the requisition in the canonical URL belong to the current advert.
export function ritualMetadata(html, url) {
  const u = new URL(url)
  if (u.hostname !== 'careers.rituals.com') return null
  const ref = u.pathname.match(/\/(R\d+)\/?$/)?.[1]
  if (!ref) return null
  const $ = load(html)
  let job
  $('*').contents().each((i, e) => {
    if (e.type !== 'comment' || job) return
    try { const data = JSON.parse(e.data); if (data.props?.job?.refNumber === ref) job = data.props.job } catch {}
  })
  if (!job) return null
  const hours = job.hoursPerWeek
  const schedule = hours && Number.isFinite(hours.min) && Number.isFinite(hours.max)
    ? `${hours.min === hours.max ? hours.max : `${hours.min}-${hours.max}`} hours per week` : ''
  return { employerJobId: ref, metadata: [job.lookupContractType?.label || job.contractType?.id, schedule].filter(Boolean).join(' '),
    locationName: job.locationName, contractType: job.contractType?.id }
}

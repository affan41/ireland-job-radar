// Direct-from-employer boards (Greenhouse, Ashby, Workable, Lever).
// These carry roles that often never reach the aggregators, and they are the best
// route to the Dublin tech and AI employers. Each board is public and needs no key.
//
// Edit the company list in config.json to follow whoever you care about. To find a
// slug, open a company's careers page and look at the URL its job listings load from.

import { getJSON, sleep } from './http.js'
import { resolveRegion } from '../regions.js'

export const DEFAULT_COMPANIES = [
  { provider: 'greenhouse', slug: 'stripe', name: 'Stripe' },
  { provider: 'greenhouse', slug: 'intercom', name: 'Intercom' },
  { provider: 'greenhouse', slug: 'datadog', name: 'Datadog' },
  { provider: 'greenhouse', slug: 'anthropic', name: 'Anthropic' },
  { provider: 'greenhouse', slug: 'tines', name: 'Tines' },
  { provider: 'greenhouse', slug: 'mongodb', name: 'MongoDB' },
  { provider: 'greenhouse', slug: 'squarespace', name: 'Squarespace' },
  { provider: 'greenhouse', slug: 'udemy', name: 'Udemy' },
  { provider: 'greenhouse', slug: 'twilio', name: 'Twilio' },
  { provider: 'greenhouse', slug: 'cloudflare', name: 'Cloudflare' },
  { provider: 'greenhouse', slug: 'elastic', name: 'Elastic' },
  { provider: 'ashby', slug: 'openai', name: 'OpenAI' },
  { provider: 'ashby', slug: 'wayflyer', name: 'Wayflyer' },
  { provider: 'workable', slug: 'wayflyer', name: 'Wayflyer' },
  { provider: 'smartrecruiters', slug: 'HMGroup', name: 'H&M Group' },
  { provider: 'smartrecruiters', slug: 'JYSK', name: 'JYSK' },
  { provider: 'smartrecruiters', slug: 'Version1', name: 'Version 1' },
  { provider: 'smartrecruiters', slug: 'MUFGInvestorServices', name: 'MUFG Investor Services' },
  { provider: 'smartrecruiters', slug: 'LetsGetChecked', name: 'LetsGetChecked' },
  { provider: 'smartrecruiters', slug: 'VusionGroupSA', name: 'VusionGroup' },
  { provider: 'smartrecruiters', slug: 'Ocorian', name: 'Ocorian' },
]

// A "Dublin" that sits next to a US state is Dublin, Ohio or Dublin, California.
const FALSE_DUBLIN = /\b(oh|ca|usa|u\.s\.|united states|ohio|california|georgia|texas|virginia|pennsylvania|new hampshire)\b/i
const ROI_AND_NI = new Set(['Leinster', 'Munster', 'Connacht', 'Ulster (ROI)', 'Northern Ireland'])

function isIrish(locationText) {
  const loc = String(locationText || '')
  if (!loc) return false
  const r = resolveRegion(loc)
  if (r.regionKey === 'nationwide') return true
  if (!ROI_AND_NI.has(r.province)) return false
  if (FALSE_DUBLIN.test(loc) && !/\bireland\b/i.test(loc)) return false
  return true
}

const ADAPTERS = {
  async greenhouse({ slug, name }) {
    const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
    return (d.jobs || [])
      .filter((j) => isIrish(j.location?.name))
      .map((j) => ({
        title: j.title,
        company: name,
        locationRaw: j.location?.name,
        url: j.absolute_url,
        postedAt: j.updated_at || j.first_published,
      }))
  },

  async ashby({ slug, name }) {
    const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
    return (d.jobs || [])
      .filter((j) => isIrish(j.location) || (j.secondaryLocations || []).some((s) => isIrish(s?.location)))
      .map((j) => ({
        title: j.title,
        company: name,
        locationRaw: j.location,
        url: j.jobUrl || j.applyUrl,
        postedAt: j.publishedAt,
        description: j.descriptionPlain,
        workMode: j.isRemote ? 'remote' : undefined,
      }))
  },

  async workable({ slug, name }) {
    const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`)
    return (d.jobs || [])
      .map((j) => ({ ...j, _loc: [j.city, j.region, j.country].filter(Boolean).join(', ') }))
      .filter((j) => isIrish(j._loc))
      .map((j) => ({
        title: j.title,
        company: name || d.name,
        locationRaw: j._loc,
        url: j.url || j.application_url,
        postedAt: j.published_on,
        description: j.description,
      }))
  },

  async lever({ slug, name }) {
    const d = await getJSON(`https://api.lever.co/v0/postings/${slug}?mode=json`)
    const list = Array.isArray(d) ? d : []
    return list
      .filter((j) => isIrish(j.categories?.location))
      .map((j) => ({
        title: j.text,
        company: name,
        locationRaw: j.categories?.location,
        url: j.hostedUrl,
        postedAt: j.createdAt,
        description: j.descriptionPlain,
      }))
  },

  async smartrecruiters({ slug, name }) {
    const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?country=ie&limit=100`)
    return (d.content || [])
      .filter((j) => String(j.location?.country || '').toLowerCase() === 'ie')
      .map((j) => {
        const type = String(j.typeOfEmployment?.label || '').toLowerCase()
        return {
          title: j.name,
          company: name,
          locationRaw: j.location?.fullLocation || [j.location?.city, j.location?.region, 'Ireland'].filter(Boolean).join(', '),
          url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
          postedAt: j.releasedDate,
          employmentType: type.includes('part') ? 'part_time'
            : type.includes('full') ? 'full_time'
              : type.includes('contract') ? 'contract'
                : type.includes('temp') ? 'temporary' : undefined,
          workMode: j.location?.remote ? 'remote' : j.location?.hybrid ? 'hybrid' : undefined,
        }
      })
  },
}

export async function fetchATS({ companies = DEFAULT_COMPANIES, delayMs = 250, onProgress }) {
  const out = []
  const errors = []

  for (const c of companies) {
    const adapter = ADAPTERS[c.provider]
    if (!adapter) { errors.push(`ats: unknown provider "${c.provider}"`); continue }
    try {
      const jobs = await adapter(c)
      for (const j of jobs) out.push({ ...j, source: 'employer', sourceDetail: `${c.provider}:${c.slug}` })
      onProgress?.(`${c.provider}/${c.slug}: ${jobs.length} in Ireland`)
    } catch (err) {
      errors.push(`ats ${c.provider}/${c.slug}: ${err.message}`)
    }
    await sleep(delayMs)
  }

  return { jobs: out, errors }
}

import { load } from 'cheerio'
import { getPublicPage } from './public-page.js'
import { parseAdvert, verifyAdvert } from '../verification.js'
import { isIrishLocation } from '../regions.js'
import { sleep } from './http.js'
import {fetchCuratedLocal} from './curated-local.js'
import {fetchEmployerDiscovery} from './employer-discovery.js'

async function readPages(urls, company, request) {
  const jobs = [], errors = []
  let cursor = 0
  const list = [...urls]
  async function worker() {
    while (cursor < list.length) {
      const url = list[cursor++]
      try {
        const page = await request(url), parsed = parseAdvert(page.html, page.url)
        if (page.status !== 200 || !parsed.hasAdvert) { errors.push(`${company} ${url}: no current advert`); continue }
        if (!isIrishLocation(parsed.locationRaw, { includeNorthernIreland: false })) continue
        const raw = { ...parsed, company: parsed.company || company, url: page.url, country: 'ie', source: 'employer', sourceDetail: `${company} Careers` }
        jobs.push(await verifyAdvert(raw, { request, page }))
      } catch (e) { errors.push(`${company} ${url}: ${e.message}`) }
      await sleep(100)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { jobs, errors }
}

export async function fetchRituals({ request = getPublicPage } = {}) {
  const page = await request('https://careers.rituals.com/api/sitemap/')
  if (page.status !== 200) throw new Error(`Sitemap HTTP ${page.status}`)
  const $ = load(page.html, { xmlMode: true })
  const urls = new Set($('loc').map((i,e)=>$(e).text()).get().filter(url=>/^https:\/\/careers\.rituals\.com\/en-IE\/jobs\/[^/]+\/R\d+\/$/.test(url)))
  if (!urls.size) throw new Error('Irish vacancy links missing from sitemap')
  return readPages(urls, 'Rituals', request)
}

export async function fetchBaxterStorey({ request = getPublicPage } = {}) {
  // The shared WSH API disallows this reader. Recheck the exact public advert
  // supplied by the user instead; this is deliberately not complete WSH coverage.
  return readPages(new Set(['https://jobs.smartrecruiters.com/WSHGroup/744000154992359-kitchen-porter-']), 'BaxterStorey', request)
}

export function mapOccupopJob(job, url, checkedAt = new Date().toISOString()) {
  if (!job?.title || !job.description || job.country_short !== 'IE') return null
  // Export a whitelist of public advert facts. The API also returns upload
  // configuration and account fields, which are never stored or exported.
  const text=load(job.description).text()
  const contractHours=text.match(/\bpart[ -]time\s+(\d+(?:\s*-\s*\d+)?)\s*hours?\b/i)?.[1]
  const closed=job.closed===true||job.status===false||job.external===false||job.is_draft===true
  return { title: job.title, description: job.description, company: job.company_name,
    metadata: contractHours ? `Part-time contract: ${contractHours} hours` : job.period === 'parttime' ? 'Part-time' : 'Full-time',
    locationRaw: job.city_name, country: 'ie', url, applicationUrl: url,
    source: 'employer', sourceDetail: 'Carraig Donn Careers', employerJobId: `occupop:${job.uuid}`,
    postedAt: job.created_at, employmentType: job.period === 'parttime' ? 'part_time' : job.period === 'fulltime' ? 'full_time' : undefined,
    checkedAt, verifiedAt:closed?checkedAt:null, verificationStatus: closed ? 'closed' : 'unverified',
    verificationReason: 'Public vacancy feed checked; rendered application form requires a browser check' }
}

export async function fetchCarraigDonn({ request = getPublicPage, index = 'https://www.carraigdonn.com/pages/career-listings', name = 'Carraig Donn' } = {}) {
  const page = await request(index)
  if (page.status !== 200) throw new Error(`Careers index HTTP ${page.status}`)
  const $ = load(page.html)
  const frame = $('[src],[href],[data-cookieblock-src]').map((i,e)=>$(e).attr('data-cookieblock-src')||$(e).attr('src')||$(e).attr('href')).get().find(u=>u.startsWith('https://api.occupop.com/api/jobs-frame/'))
  if (!frame) throw new Error('Public careers frame missing')
  const listing = await request(frame)
  if (listing.status !== 200) throw new Error(`Careers frame HTTP ${listing.status}`)
  const f = load(listing.html), slugs = new Map()
  f('a[href]').each((i,e)=>{const u=new URL(f(e).attr('href'),listing.url);if(u.origin==='https://api.occupop.com' && /^\/(?:shared\/job|job\/application)\/[^/]+$/.test(u.pathname)) slugs.set(u.pathname.split('/').pop(),u.href)})
  const jobs = [], errors = []
  for (const [slug,advertUrl] of slugs) {
    try {
      const p = await request(`https://api.occupop.com/api/integration/job/${encodeURIComponent(slug)}`)
      if (p.status !== 200) throw new Error(`Advert API HTTP ${p.status}`)
      const j = mapOccupopJob(JSON.parse(p.html).job, name==='Carraig Donn'?`https://recruitment.cezannehr.com/shared/job/${slug}`:advertUrl)
      if (j) jobs.push({...j,sourceDetail:`${name} Careers`})
    } catch (e) { errors.push(`Carraig Donn ${slug}: ${e.message}`) }
    await sleep(100)
  }
  return { jobs, errors }
}

export async function fetchStudentEmployers({ request = getPublicPage, onProgress } = {}) {
  const jobs = [], errors = []
  for (const [name, collector] of [['Rituals',fetchRituals],['Carraig Donn',fetchCarraigDonn],['McCabes',options=>fetchCarraigDonn({...options,index:'https://www.mccabespharmacy.com/pages/careers',name:'McCabes'})],['BaxterStorey',fetchBaxterStorey],['Local employer leads',fetchCuratedLocal],['Employer indexes',fetchEmployerDiscovery]]) {
    try { const r=await collector({request});jobs.push(...r.jobs);errors.push(...r.errors);onProgress?.(`${name}: ${r.jobs.length} Irish adverts checked`) }
    catch (e) { errors.push(`${name}: ${e.message}`) }
  }
  return {jobs, errors}
}

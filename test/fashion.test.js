import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchBestseller, fetchSostreneGrene } from '../src/sources/fashion.js'
import { parseAdvert, verifyAdvert } from '../src/verification.js'
import { buildJob } from '../src/normalise.js'

const now = new Date('2026-10-12T12:00:00Z')
const micro = (title, place, description, apply = '') => `<nav>Full-time corporate jobs, 40 hours per week</nav><div itemscope itemtype="http://schema.org/JobPosting"><meta itemprop="streetAddress" content="${place}"><meta itemprop="datePosted" content="Tue Sep 15 00:00:00 UTC 2026"><meta itemprop="validThrough" content="Fri Oct 16 00:00:00 UTC 2026"><meta itemprop="hiringOrganization" content="Søstrene Grene"><span itemprop="title">${title}</span><span itemprop="description"><p>${description}</p></span>${apply}</div><footer>Unrelated roles</footer>`

test('microdata retains advert-only hours, workplace, dates and seasonal part-time contracts', () => {
  const html = micro('Seasonal Store Assistant, Limerick', 'Limerick, IE, V94 VY47', 'Various part-time contracts, up to 20 hours per week. Contract ends 31 December 2026.')
  const parsed = parseAdvert(html, 'https://career.sostrenegrene.com/job/limerick/1368345755/')
  assert.equal(parsed.hasAdvert, true)
  assert.equal(parsed.locationRaw, 'Limerick, IE, V94 VY47')
  assert.equal(parsed.closingAt, '2026-10-16T00:00:00.000Z')
  assert.equal(parsed.postedAt, '2026-09-15T00:00:00.000Z')
  const j = buildJob({ ...parsed, url: 'https://career.sostrenegrene.com/job/limerick/1368345755/' }, now.toISOString())
  assert.equal(j.employmentType, 'part_time')
  assert.equal(j.hoursMax, 20)
  assert.equal(j.hoursMin, null)
  assert.match(j.hoursEvidence[0].text, /^up to 20/)
  assert.doesNotMatch(parsed.description, /corporate|40 hours|Unrelated/)
  assert.equal(parseAdvert('<span itemprop="title">Careers</span>', 'https://example.test').hasAdvert, false)
})

test('application access failure does not erase advert evidence or claim verified open', async () => {
  const url = 'https://career.sostrenegrene.com/job/limerick/1368345755/'
  const html = micro('Seasonal Store Assistant', 'Limerick, IE', 'Part-time, 20 hours per week.', '<a href="/talentcommunity/apply/1368345755/">Apply now »</a>')
  const r = await verifyAdvert({ url }, { now, page: { url, status: 200, html }, request: async () => { throw Error('Public-page access disallowed by robots.txt') } })
  // Verification may fail, but the collector supplies the parsed advert as raw.
  const parsed = parseAdvert(html, url)
  const collected = await verifyAdvert({ ...parsed, url }, { now, page: { url, status: 200, html }, request: async () => { throw Error('Public-page access disallowed by robots.txt') } })
  assert.equal(r.verificationStatus, 'unverified')
  assert.equal(collected.verificationStatus, 'unverified')
  assert.match(collected.description, /20 hours/)
  assert.match(collected.verificationReason, /robots/)
})

test('BESTSELLER decodes its public feed, selects Ireland and reads the full VILA advert', async () => {
  const origin = 'https://bestseller.com', path = '/careers/jobs/job-detail-vila/30476'
  const calls = []
  const r = await fetchBestseller({ request: async url => {
    calls.push(url)
    if (url.includes('GetJobs')) return { url, status: 200, html: JSON.stringify(JSON.stringify([{ Url: path, JobCountry: 'Limerick, IE' }, { Url: '/careers/jobs/uk/3', JobCountry: 'London, GB' }, { Url: 'https://foreign.test/job', JobCountry: 'Ireland' }])) }
    return { url, status: 200, html: micro('VILA Seasonal Sales Assistant', 'Limerick, Ireland', 'Part-time, 8 hours a week.', '<aside-job-details applylink="https://career2.successfactors.eu/career?career_job_req_id=30476"></aside-job-details>') }
  } })
  assert.equal(r.jobs.length, 1)
  assert.equal(r.jobs[0].company, 'VILA')
  assert.equal(r.jobs[0].url, origin + path)
  assert.equal(buildJob(r.jobs[0], now.toISOString()).hoursMax, 8)
  assert.ok(!calls.some(u => u.includes('foreign.test') || u.includes('/uk/')))
  assert.equal(parseAdvert(micro('VILA Assistant', 'Limerick', '8 hours per week.', '<aside-job-details applylink="/apply/30476"></aside-job-details>'), origin + path).applicationUrl, origin + '/apply/30476')
})

test('Søstrene search pagination deduplicates cards and rejects foreign detail pages', async () => {
  const root = 'https://career.sostrenegrene.com', local = `${root}/job/Limerick/1368345755/`, foreign = `${root}/job/London/2/`
  const calls = []
  const r = await fetchSostreneGrene({ request: async url => {
    calls.push(url)
    if (url.includes('/search/')) return { url, status: 200, html: `<a href="${local}">Assistant</a><a href="${local}">Assistant</a>${url.includes('startrow') ? `<a href="${foreign}">Foreign role</a>` : '<a href="/search/?q=&amp;optionsFacetsDD_country=IE&amp;startrow=25">Next</a>'}` }
    return { url, status: 200, html: micro('Store Assistant', url === local ? 'Limerick, IE' : 'London, GB', 'Part-time, 12 hours per week.') }
  } })
  assert.equal(calls.filter(u => u.includes('/search/')).length, 2)
  assert.equal(calls.filter(u => u === local).length, 1)
  assert.equal(r.jobs.length, 1)
  assert.equal(r.jobs[0].company, 'Søstrene Grene')
})

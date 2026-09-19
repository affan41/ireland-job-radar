import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapLidl, mapMcDonalds, mapPrimark, parseBoots, parseBootsCards, parseSupermacs, fetchLidl, fetchMcDonalds } from '../src/sources/retail.js'
import { buildJob } from '../src/normalise.js'

const build = raw => buildJob(raw, '2026-09-19T20:00:00Z')
test('Lidl honours full-time contracts, expiry and actual coordinates', () => {
  const raw = { title: 'Customer Assistant', location: { country: 'IE', city: 'Limerick', latitude: 52.64, longitude: -8.61 }, jobDetailUrl: 'https://jobs.lidl.ie/jobs/test', contractType: 'Full Time', descResponsibilities: 'Customer service, weekends, standard 30 hour contract.' }
  const result = build(mapLidl(raw))
  assert.equal(result.employmentType, 'full_time')
  assert.equal(result.latitude, 52.64)
  assert.equal(mapLidl({ ...raw, onlineUntil: '2000-01-01' }), null)
  assert.equal(mapLidl({ ...raw, location: { country: 'GB' } }), null)
})
test('McDonalds uses restaurant address and contract, never search intent', () => {
  const raw = { title: 'Crew Member', country: 'Republic of Ireland', jd_url: '/job-search/restaurant-1@52.6653,-8.5535/limerick/crew/123', display_address: 'Castletroy Shopping Centre', state: 'County Limerick', contract_type: 'Full Time', description: 'Part-time options may be available in other restaurants.' }
  const job = build(mapMcDonalds(raw))
  assert.equal(job.employmentType, 'full_time')
  assert.equal(job.latitude, 52.6653)
  assert.equal(job.postedAt, null)
  assert.equal(mapMcDonalds({ ...raw, country: 'United Kingdom' }), null)
  assert.equal(mapMcDonalds({ ...raw, jd_url: 'https://example.com/job' }), null)
})
test('Primark reads full description hours and correct country', () => {
  const raw = { id: '1', name: 'Retail Assistant', location: { country: 'ie', city: 'Limerick' }, jobAd: { sections: { jobDescription: { text: 'This role is 11.5 to 14 hours per week.' } } } }
  assert.equal(build(mapPrimark(raw)).employmentType, 'part_time')
  assert.equal(mapPrimark({ ...raw, location: { country: 'gb' } }), null)
})
test('Boots reads weekly hours from the card, checks full advert and excludes expired jobs', () => {
  const card = parseBootsCards('<h3 class="job-card__title"><a href="https://www.boots.jobs/jobs/123">Customer Assistant</a></h3><ul><li class="job-card__meta-icon-work_hours">37.5 hours per week</li></ul>')[0]
  const data = { '@type': 'JobPosting', title: 'Customer Assistant', description: 'Customer service', jobLocation: { address: { streetAddress: 'Limerick, Childers Road' } } }
  const html = d => `<script type="application/ld+json">${JSON.stringify(d)}</script>`
  assert.equal(build(parseBoots(html(data), card)).employmentType, 'full_time')
  assert.equal(build(parseBoots(html(data), { ...card, hours: '16 hours per week' })).employmentType, 'part_time')
  assert.equal(parseBoots(html({ ...data, validThrough: '2000-01-01' }), card), null)
  assert.equal(parseBoots('<html>No vacancy data</html>', card), null)
})
test('Supermacs reads the vacancy body instead of generic careers content', () => {
  const html = '<h1>Part-time baker</h1><div class="wpjb wpjb-job wpjb-page-single"><div class="wpjb-row-meta-_location"><div class="wpjb-col-60">Ennis, Ireland</div></div><div class="wpjb-row-meta-_tag_type"><div class="wpjb-col-60">Part-time</div></div><div class="wpjb-text">24 hours per week</div><div class="wpjb-job-apply">'
  const job = build(parseSupermacs(html, 'https://supermacs.ie/job/example/'))
  assert.equal(job.regionKey, 'clare')
  assert.equal(job.employmentType, 'part_time')
  assert.ok(job.score >= 10)
  assert.equal(parseSupermacs('<h1>Careers</h1>', 'https://supermacs.ie/careers/'), null)
})
test('Lidl follows pagination and McDonalds refreshes public search configuration', async () => {
  const pages = []
  await fetchLidl({ json: async url => { const page = JSON.parse(new URL(url).searchParams.get('general')).page; pages.push(page); return { jobs: [{ location: { country: 'GB' } }], meta: { totalCount: 3, resultsPerPage: 2 } } } })
  assert.deepEqual(pages, [1, 2])
  let calls = 0
  const result = await fetchMcDonalds({ text: async () => 'window.AG_ID="APP123"; window.AG_KEY="public-key"; window.AG_INDEX={"default":"jobs"};', post: async (url, body, options) => {
    assert.equal(body.filters, 'country:"Republic of Ireland"')
    assert.equal(options.headers.Referer, 'https://people.mcdonalds.ie/')
    calls++; return { hits: [], nbPages: 1 }
  } })
  assert.equal(calls, 1)
  assert.deepEqual(result.jobs, [])
})

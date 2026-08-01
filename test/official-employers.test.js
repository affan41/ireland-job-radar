import test from 'node:test'
import assert from 'node:assert/strict'

import { mapAmazonJob, mapMicrosoftJob, parseAppleSearch } from '../src/sources/official-employers.js'

function applePage(search) {
  const hydration = { loaderData: { search } }
  const encoded = JSON.stringify(JSON.stringify(hydration))
  return `<html><script>window.__staticRouterHydrationData = JSON.parse(${encoded});</script></html>`
}

test('maps jobs embedded in the official Apple Ireland search page', () => {
  const result = parseAppleSearch(applePage({
    page: 1,
    totalRecords: 1,
    searchResults: [{
      reqId: '200123456-1418',
      postingTitle: 'Finance Data Analyst',
      transformedPostingTitle: 'finance-data-analyst',
      jobSummary: 'Build financial reporting and analytics.',
      locations: [{ name: 'Cork', countryName: 'Ireland' }],
      postDateInGMT: '2026-07-30T10:00:00.000Z',
      standardWeeklyHours: 39,
      postExternal: true,
      team: { teamCode: 'FIN', teamName: 'Finance' },
    }],
  }))

  assert.equal(result.total, 1)
  assert.equal(result.jobs.length, 1)
  assert.equal(result.jobs[0].company, 'Apple')
  assert.equal(result.jobs[0].locationRaw, 'Cork, Ireland')
  assert.equal(result.jobs[0].source, 'employer')
  assert.equal(result.jobs[0].sourceDetail, 'Apple Careers')
  assert.equal(result.jobs[0].url, 'https://jobs.apple.com/en-ie/details/200123456-1418/finance-data-analyst?team=FIN')
})

test('maps an official Amazon Jobs result to a direct vacancy link', () => {
  const job = mapAmazonJob({
    title: 'Business Intelligence Engineer',
    normalized_location: 'Dublin, IRL',
    job_path: '/en/jobs/123456/business-intelligence-engineer',
    posted_date: 'July 31, 2026',
    description: 'Build analytics products.',
    basic_qualifications: 'Experience with SQL.',
    job_schedule_type: 'full-time',
  })

  assert.equal(job.company, 'Amazon')
  assert.equal(job.source, 'employer')
  assert.equal(job.sourceDetail, 'Amazon Jobs')
  assert.equal(job.locationRaw, 'Dublin, IRL')
  assert.equal(job.employmentType, 'full_time')
  assert.equal(job.url, 'https://www.amazon.jobs/en/jobs/123456/business-intelligence-engineer')
})

test('maps an official Microsoft Careers result to a direct vacancy link', () => {
  const job = mapMicrosoftJob({
    id: 1970393556887861,
    name: 'Finance Manager',
    standardizedLocations: ['Dublin, D, IE'],
    postedTs: 1783420107,
    department: 'Finance',
    workLocationOption: 'hybrid',
    positionUrl: '/careers/job/1970393556887861',
  })

  assert.equal(job.company, 'Microsoft')
  assert.equal(job.source, 'employer')
  assert.equal(job.sourceDetail, 'Microsoft Careers')
  assert.equal(job.locationRaw, 'Dublin, D, IE')
  assert.equal(job.workMode, 'hybrid')
  assert.equal(job.url, 'https://apply.careers.microsoft.com/careers/job/1970393556887861')
})

test('uses the portal work-mode value for an onsite Microsoft role', () => {
  const job = mapMicrosoftJob({
    id: 1,
    name: 'Accountant',
    locations: ['Ireland'],
    workLocationOption: 'onsite',
  })

  assert.equal(job.workMode, 'onsite')
})

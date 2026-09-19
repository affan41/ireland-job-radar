import test from 'node:test'
import assert from 'node:assert/strict'
import { irelandRemoteLocation } from '../src/remote-student.js'
import { buildJob } from '../src/normalise.js'
import { fetchRemote } from '../src/sources/remote.js'
import { mapRecruiteeJob } from '../src/sources/recruitee.js'
import { localSearches } from '../src/sources/local.js'

const raw = {title: 'Customer Support Assistant', description: 'Part time employee, 16 hours per week.', locationRaw: 'Remote, Ireland', workMode: 'remote', source: 'remote', url: 'https://example.test/job'}
const build = changes => buildJob({...raw, ...changes}, '2026-09-19T00:00:00Z')

test('remote locations require positive Ireland eligibility, not a generic remote label', () => {
  for (const place of ['Ireland', 'Dublin, Ireland', 'Europe', 'Remote - EMEA', 'Worldwide']) assert.equal(irelandRemoteLocation(place), true, place)
  for (const place of ['', 'Remote', 'United Kingdom', 'Northern Ireland', 'Belfast', 'Dublin, Ohio', 'Europe: Germany only', 'Europe excluding Ireland', 'Ireland, UK only']) assert.equal(irelandRemoteLocation(place), false, place)
})

test('remote student leads require part-time hours, suitable role and remote Ireland hiring', () => {
  assert.match(build({}).remoteStudentNote, /16 hours\/week/)
  assert.match(build({description: 'Part time employee'}).remoteStudentNote, /Weekly hours not stated/)
  for (const change of [
    {description: 'Full time'}, {description: 'Flexible hours'},
    {description: 'Part time, 25 hours per week'}, {description: 'Part time, 10-25 hours/week'},
    {title: 'Customer Support Assistant - 24 hours'},
    {workMode: 'hybrid'}, {locationRaw: 'Malta'}, {locationRaw: 'UK only'},
    {title: 'Senior Customer Support Manager'}, {title: 'Dentist'},
    {description: 'Part time freelancer'}, {description: 'Part time independent contractor'},
    {employmentType: 'contract'}, {locationRaw: 'Worldwide', description: 'Part time. Must reside in the US.'},
    {description: 'Part time paid survey panel'}, {description: 'Part time hybrid position'},
  ]) assert.equal(build(change).remoteStudentNote, null, JSON.stringify(change))
})

test('student checks inspect restrictions beyond the stored description excerpt', () => {
  assert.equal(build({description: `Part time, 16 hours/week. ${'Details. '.repeat(150)} This is an independent contractor role.`}).remoteStudentNote, null)
  assert.match(build({description: 'Part time fixed term employee, 16 hours/week. 2+ years experience.'}).remoteStudentNote, /2\+ years/)
})

test('remote feeds retain structured hours and full descriptions without inferring country from a title', async () => {
  const request = async url => {
    if (url.includes('remotive')) return {jobs: [
      {title: raw.title, candidate_required_location: 'Ireland', job_type: 'part_time', url: raw.url},
      {title: 'Ireland Customer Support', candidate_required_location: 'USA', job_type: 'part_time'},
    ]}
    if (url.includes('himalayas')) return {jobs: [
      {title: raw.title, locationRestrictions: ['Ireland'], employmentType: 'Part Time', applicationLink: raw.url, excerpt: 'Part time', description: 'Full time, 40 hours per week'},
      {title: raw.title, locationRestrictions: [], employmentType: 'Part Time'},
    ]}
    if (url.includes('jobicy')) return {jobs: [{jobTitle: raw.title, jobGeo: 'Europe', jobType: ['part-time'], url: raw.url, jobExcerpt: 'Part time', jobDescription: 'Part time freelance role'}]}
    return {data: []}
  }
  const r = await fetchRemote({request, himalayasPages: 1})
  assert.equal(r.errors.length, 0)
  assert.equal(r.jobs.length, 3)
  assert.equal(buildJob(r.jobs[0], 'now').employmentType, 'part_time')
  assert.equal(buildJob(r.jobs[1], 'now').employmentType, 'full_time')
  assert.equal(buildJob(r.jobs[2], 'now').remoteStudentNote, null)
})

test('Recruitee preserves remote country and distinguishes hybrid from remote', () => {
  const job = {title: raw.title, status: 'published', country_code: 'IE', country: 'Ireland', location: 'Remote job', locations: [{city: 'Dublin/Remote', country: 'Ireland'}], employment_type_code: 'parttime_fixed_term', remote: true, hybrid: false, slug: 'support', description: 'Part-time weekend support, 16 hours per week'}
  const company = {name: 'Distilled', slug: 'distilled'}
  assert.ok(buildJob(mapRecruiteeJob(job, company), 'now').remoteStudentNote)
  assert.equal(buildJob(mapRecruiteeJob(job, company), 'now').sponsorship, 'unknown')
  assert.equal(buildJob(mapRecruiteeJob({...job, hybrid: true}, company), 'now').remoteStudentNote, null)
})

test('expanded searches cover student remote roles and brands without asserting hours or work mode', () => {
  const searches = localSearches({cities: [], brands: [], includeRemote: true, remoteLocation: 'Ireland'})
  assert.ok(searches.length >= 30)
  for (const term of ['chat support', 'online tutor', 'Capita', 'Cpl', 'Distilled']) assert.ok(searches.some(s => s.q.includes(term)))
  assert.ok(searches.every(s => s.location === 'Ireland' && !s.employmentType && !s.workMode))
})

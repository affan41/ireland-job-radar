import test from 'node:test'
import assert from 'node:assert/strict'
import { detectEmploymentType } from '../src/employment.js'
import { buildJob } from '../src/normalise.js'

for (const [title, body, expected] of [
  ['Retail Assistant', 'Full-time role, 39 hours per week. Part-time benefits available across our stores.', 'full_time'],
  ['Weekend staff', 'Permanent 40 hours per week', 'full_time'],
  ['Evening shift cleaner', 'Join our team', 'unspecified'],
  ['Temporary Administrator', 'Fixed-term maternity cover', 'temporary'],
  ['Paraplanner', 'Working Model: Part - Time, fully remote.', 'part_time'],
  ['Sales Assistant – Part–Time', '', 'part_time'],
  ['Retail Assistant', '16 hours per week', 'part_time'],
  ['Retail Assistant', '20–40 hours per week', 'full_time'],
  ['Retail Assistant', '37.5 hours per week; part-time benefits available', 'full_time'],
  ['Part-time Assistant 40 Hours', '', 'full_time'],
  ['Part-time Assistant', '39 hours per week', 'full_time'],
  ['Shop Assistant Full & Part-Time', '', 'full_time'],
  ['Part-Time Retail Assistant', 'We offer both full-time and part-time positions across our stores.', 'part_time'],
  ['Customer Assistant', 'Full time and part time roles available.', 'full_time'],
]) {
  test(`employment evidence: ${title} / ${body}`, () => {
    assert.equal(detectEmploymentType(title, body), expected)
  })
}

test('full-time source metadata overrides incidental part-time text and search intent', () => {
  const job = buildJob({ title: 'Retail Assistant', description: 'Part-time opportunities across our stores',
    employmentType: 'full_time', intentProfiles: ['studentretail'], url: 'https://example.test/job', locationRaw: 'Limerick' }, 'now')
  assert.equal(job.employmentType, 'full_time')
  assert.ok(!job.groups.includes('student'))
})

test('classification reads hours after the displayed snippet ends', () => {
  const job = buildJob({ title: 'Retail Assistant', description: 'Our store team. '.repeat(100) + 'Full-time: 39 hours per week. Part-time benefits elsewhere.',
    intentProfiles: ['studentretail'], url: 'https://example.test/job', locationRaw: 'Limerick' }, 'now')
  assert.equal(job.employmentType, 'full_time')
  assert.ok(!job.groups.includes('student'))
})

test('source-confirmed part-time hours can qualify a plain retail title', () => {
  const job = buildJob({ title: 'Retail Assistant', employmentType: 'part_time', url: 'https://example.test/job', locationRaw: 'Limerick' }, 'now')
  assert.equal(job.employmentType, 'part_time')
  assert.ok(job.groups.includes('student'))
})

test('reads NEXT weekly shifts while keeping 35-hour shifts out of part-time', () => {
  assert.equal(detectEmploymentType('Team Member', 'SHIFTS YOU ARE APPLYING FOR: 5.50hrs p/w; Wed 10:00 - 16:00'), 'part_time')
  assert.equal(detectEmploymentType('Team Member', 'SHIFTS YOU ARE APPLYING FOR: 35hrs p/w; Monday to Friday'), 'full_time')
})

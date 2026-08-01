import test from 'node:test'
import assert from 'node:assert/strict'

import { mapJobsIrelandJob } from '../src/sources/jobsireland.js'

test('maps a JobsIreland part-time vacancy to the radar format', () => {
  const job = mapJobsIrelandJob({
    JobId: 2461152,
    JobTitle: 'Barista',
    EmployerName: 'Example Cafe',
    Location: 'Bray, Co. Wicklow',
    Description: 'Weekend shifts',
    StartDate: '2026-08-01T00:19:18',
  }, 'part_time')

  assert.equal(job.source, 'jobsireland')
  assert.equal(job.sourceDetail, 'Department of Social Protection')
  assert.equal(job.employmentType, 'part_time')
  assert.equal(job.url, 'https://api.jobsireland.ie/#id=2461152')
})

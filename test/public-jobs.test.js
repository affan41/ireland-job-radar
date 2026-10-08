import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { PUBLIC_JOB_FIELDS, publicJobSnapshot, seedPublicJobs } from '../src/public-jobs.js'

function database() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE jobs (${PUBLIC_JOB_FIELDS.map((f) => `${f} ${f === 'id' ? 'TEXT PRIMARY KEY' : 'TEXT'}`).join(',')}, merged_into TEXT, title_needs_review INTEGER, note TEXT, latitude REAL);
    CREATE TABLE job_sources (job_id TEXT, source TEXT, source_detail TEXT, url TEXT, last_seen TEXT, PRIMARY KEY(job_id,source,source_detail));
    CREATE TABLE job_identity (alias TEXT PRIMARY KEY, job_id TEXT);
    CREATE TABLE saved (job_id TEXT, note TEXT); CREATE TABLE hidden (job_id TEXT);`)
  return db
}
const row = (id, extra = {}) => ({ id, title: 'Assistant', country: 'ie', region_key: 'limerick', source: 'employer', url: `https://example.test/jobs/${id}`, first_seen: '2025-01-01', last_seen: '2026-10-01', verification_status: 'unverified', ...extra })

test('the public seed contains full advert history and excludes personal fields and ineligible rows', () => {
  const db = database()
  for (const j of [row('old'), row('closed', { verification_status: 'closed' }), row('abroad', { country: 'mt' })]) {
    db.prepare('INSERT INTO jobs (id,title,country,region_key,source,url,first_seen,last_seen,verification_status,note,latitude) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(j.id,j.title,j.country,j.region_key,j.source,j.url,j.first_seen,j.last_seen,j.verification_status,'private note',52)
  }
  db.exec("INSERT INTO saved VALUES ('old','private saved note'); INSERT INTO hidden VALUES ('old'); UPDATE jobs SET title_needs_review=1 WHERE id='abroad'")
  const snapshot = publicJobSnapshot(db)
  assert.deepEqual(snapshot.jobs.map((j) => j.id), ['closed','old'])
  assert.equal(JSON.stringify(snapshot).includes('private'), false)
  assert.equal('latitude' in snapshot.jobs[0], false)
  assert.equal('saved' in snapshot, false)
  db.close()
})

test('seeding fills missing records without reopening jobs, duplicating known aliases or overwriting evidence', () => {
  const db = database()
  seedPublicJobs(db, { version: 1, jobs: [row('current', { verification_status: 'closed', verification_reason: 'Employer closed advert' })], identities: [{job_id:'current',alias:'url:https://example.test/jobs/shared'}] })
  const snapshot = {version: 1, jobs:[row('legacy'),row('new')],
    identities:[{job_id:'legacy',alias:'url:https://example.test/jobs/shared'}],
    sources:[{job_id:'legacy',source:'careerjet',source_detail:'',url:'https://example.test/jobs/shared',last_seen:'2026-09-01'}]}
  assert.equal(seedPublicJobs(db, snapshot), 1)
  assert.equal(seedPublicJobs(db, snapshot), 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 2)
  assert.equal(db.prepare("SELECT verification_status FROM jobs WHERE id='current'").get().verification_status, 'closed')
  assert.equal(db.prepare("SELECT job_id FROM job_sources WHERE source='careerjet'").get().job_id, 'current')
  db.close()
})

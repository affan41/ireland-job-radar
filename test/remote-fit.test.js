import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { assessRemoteFit, irelandEvidence, roleMatch, remoteFitList, profileSummary, normaliseStamp, PUBLIC_PROFILE, isRemoteCandidate, fitRow, remoteFromIreland } from '../src/remote-fit.js'
import { queryJobs } from '../src/db.js'
import { VIEW_BY_KEY } from '../src/views.js'

// A made-up profile. Real details live only in the git-ignored private/ folder.
const base = {
  roles: [
    { id: 'books', name: 'Bookkeeping', titleTerms: ['bookkeeper', 'accounts assistant'] },
    { id: 'data', name: 'Data', titleTerms: ['data analyst'] },
  ],
  skills: ['Xero', 'SQL'],
  seniorTitleTerms: ['senior'],
  excludeTitleTerms: ['head of', 'engineer'],
  permission: { stamp: null, expires: null, additionalConditions: [], confirmedByMe: false },
}
const withStamp = (stamp, extra = {}) => ({ ...base, permission: { ...base.permission, stamp, expires: '2099-01-01', confirmedByMe: true, ...extra } })
const NOW = Date.parse('2026-11-04T12:00:00Z')

const good = {
  id: 'a1', title: 'Part-time Bookkeeper', company: 'Example Ltd', location_raw: 'Remote, Ireland', work_mode: 'remote',
  employment_type: 'part_time', url: 'https://example.test/job',
  full_description: 'Permanent part-time role, 15 hours per week. Work remotely from anywhere in Ireland. You will be paid through PAYE on our Irish payroll. Stamp 2 holders are welcome to apply. Xero experience preferred.',
}
const fit = (changes = {}, profile = withStamp('2')) => assessRemoteFit({ ...good, ...changes }, profile, { now: NOW })
const statusOf = (result, key) => result.checks.find((c) => c.key === key).status

test('Ireland must be stated or broad; remote for another country is excluded', () => {
  const where = (location_raw, extra = {}) => irelandEvidence({ title: 'Bookkeeper', location_raw, ...extra }).status
  assert.equal(where('Remote, Ireland'), 'stated')
  assert.equal(where('Dublin'), 'stated')
  assert.equal(where('Bulgaria, Cyprus, Ireland, UK'), 'stated')
  assert.equal(where('Europe'), 'region')
  assert.equal(where('Worldwide'), 'region')
  assert.equal(where('Remote, no location restriction'), 'unknown')
  for (const place of ['United Kingdom', 'Europe, Netherlands', 'Northern Ireland', 'Belfast, Northern Ireland']) assert.equal(where(place), 'excluded', place)
  assert.equal(where('Remote, Ireland', { title: 'Bookkeeper - Remote UK' }), 'excluded')
  assert.equal(where('Dublin', { full_description: 'Candidates must be based in the United States.' }), 'excluded')
  assert.equal(where('Europe', { full_description: 'You must be based in Ireland or the UK.' }), 'stated')
  assert.equal(where('Worldwide', { full_description: 'Open to everyone, excluding Ireland.' }), 'excluded')
  assert.equal(where('Ireland', { full_description: 'Contact us only by email.' }), 'stated')
})

test('role families match job titles and skip excluded or unrelated titles', () => {
  const m = roleMatch(good, base)
  assert.deepEqual(m.families.map((f) => f.id), ['books'])
  assert.deepEqual(m.skills, ['Xero'])
  assert.equal(roleMatch({ ...good, title: 'Senior Bookkeeper' }, base).senior, 'senior')
  assert.equal(roleMatch({ ...good, title: 'Head of Bookkeeping' }, base), null)
  assert.equal(roleMatch({ ...good, title: 'Data Engineer' }, base), null)
  assert.equal(roleMatch({ ...good, title: 'Barista' }, base), null)
})

test('without recorded permission details nothing is labelled compatible', () => {
  const r = fit({}, base)
  assert.equal(r.label, 'needs_verification')
  assert.equal(statusOf(r, 'permission'), 'needs_verification')
  assert.equal(statusOf(r, 'hours'), 'needs_verification')
  // Unconfirmed details also stay unverified.
  assert.equal(fit({}, withStamp('2', { confirmedByMe: false })).label, 'needs_verification')
  assert.equal(fit({}, withStamp('2', { additionalConditions: ['Extra condition from letter'] })).label, 'needs_verification')
  assert.equal(fit({}, withStamp('7Z')).label, 'needs_verification')
  assert.equal(fit({}, withStamp('2', { expires: null })).label, 'needs_verification')
})

test('remote and part-time alone are not enough: missing details need verification', () => {
  const r = fit({ full_description: 'Part-time remote role, work from home in Ireland.' })
  assert.equal(r.label, 'needs_verification')
  assert.equal(statusOf(r, 'location'), 'ok')
  for (const key of ['employment', 'hours', 'rtw', 'payroll']) assert.equal(statusOf(r, key), 'needs_verification', key)
  assert.equal(r.checks.find((c) => c.key === 'rtw').evidence, null)
})

test('every check must be supported by advert evidence before no conflict is found', () => {
  const r = fit()
  assert.equal(r.label, 'no_conflict_found')
  assert.notEqual(r.labelText.toLowerCase().includes('compatible'), true)
  assert.match(r.checks.find((c) => c.key === 'hours').evidence, /15 hours per week/)
  assert.match(r.checks.find((c) => c.key === 'rtw').evidence, /Stamp 2 holders are welcome/)
  assert.match(r.checks.find((c) => c.key === 'payroll').evidence, /PAYE/)
})

test('Stamp 2 conflicts come from hours, self-employment and right-to-work wording', () => {
  const desc = good.full_description
  assert.equal(statusOf(fit({ employment_type: 'full_time', title: 'Full-time Bookkeeper' }), 'hours'), 'conflict')
  assert.equal(statusOf(fit({ full_description: desc.replace('15 hours', '25 hours') }), 'hours'), 'conflict')
  assert.equal(statusOf(fit({ full_description: `${desc} This is a freelance position.` }), 'employment'), 'conflict')
  assert.equal(statusOf(fit({ full_description: `${desc} Applicants must hold Stamp 4.` }), 'rtw'), 'conflict')
  assert.equal(statusOf(fit({ full_description: `${desc} You must have unrestricted right to work.` }), 'rtw'), 'conflict')
  assert.equal(statusOf(fit({ full_description: `${desc} You need the right to work in the UK.` }), 'rtw'), 'conflict')
  assert.equal(statusOf(fit({ employment_type: 'contract', full_description: 'Remote in Ireland, 12-month contract.' }), 'employment'), 'needs_verification')
  assert.equal(fit({ full_description: `${desc} This is a freelance position.` }).label, 'conflict')
})

test('Stamp 1G allows full-time hours but not self-employment; Stamp 2A allows no work', () => {
  const full = { employment_type: 'full_time', full_description: good.full_description.replace('15 hours', '39 hours') }
  assert.equal(statusOf(fit(full, withStamp('1G')), 'hours'), 'ok')
  assert.equal(statusOf(fit({ full_description: `${good.full_description} Self-employed contractors only.` }, withStamp('1G')), 'employment'), 'conflict')
  assert.equal(fit({}, withStamp('Stamp 2A')).label, 'conflict')
  assert.equal(fit({}, withStamp('2', { expires: '2026-01-01' })).label, 'conflict')
  assert.equal(normaliseStamp('stamp 1g'), '1G')
})

test('the list leaves out other-country and hybrid adverts and honours the location option', () => {
  const jobs = [
    { ...good, id: 'ie' },
    { ...good, id: 'eu', location_raw: 'Europe', full_description: 'Part-time.' },
    { ...good, id: 'none', location_raw: 'Remote', full_description: 'Part-time.' },
    { ...good, id: 'uk', location_raw: 'United Kingdom', full_description: 'Part-time.' },
    { ...good, id: 'hybrid', work_mode: 'hybrid' },
    { ...good, id: 'off', title: 'Chef' },
  ]
  const ids = (opts) => remoteFitList(jobs, withStamp('2'), { now: NOW, ...opts }).rows.map((r) => r.job.id)
  assert.deepEqual(ids({ scope: 'ireland' }), ['ie'])
  assert.deepEqual(ids({ scope: 'region' }), ['ie', 'eu'])
  assert.deepEqual(ids({ scope: 'all' }), ['ie', 'eu', 'none'])
  const { counts } = remoteFitList(jobs, withStamp('2'), { now: NOW, scope: 'region' })
  assert.equal(counts.otherCountry, 1)
  assert.deepEqual(ids({ scope: 'all', label: 'no_conflict_found' }), ['ie'])
})

test('profile summary exposes status only and survives a missing or broken file', () => {
  assert.deepEqual(profileSummary(null), { configured: false })
  assert.equal(profileSummary({ error: 'bad json' }).configured, false)
  const s = profileSummary(withStamp('2'))
  assert.equal(s.permission.stamp, 'Stamp 2')
  assert.equal('skills' in s, false)
})

test('public remote page uses standard Stamp 2 rules and never says no conflict found', () => {
  const r = assessRemoteFit(good, PUBLIC_PROFILE, { now: NOW })
  assert.equal(r.label, 'needs_verification')
  assert.match(r.checks[0].rule, /Your own permission may differ/)
  assert.equal(statusOf(r, 'hours'), 'ok')
  assert.equal(assessRemoteFit({ ...good, employment_type: 'full_time', title: 'Full-time Bookkeeper' }, PUBLIC_PROFILE, { now: NOW }).label, 'conflict')
  assert.equal('expires' in PUBLIC_PROFILE.permission, false)
  // Shortlist flags are personal and stay out of exported rows.
  assert.equal('is_saved' in fitRow({ job: { ...good, is_saved: 1 }, fit: r }), false)
  assert.equal(fitRow({ job: { ...good, is_saved: 1 }, fit: r }, { includeSaved: true }).is_saved, 1)
  assert.equal(isRemoteCandidate({ ...good }), true)
  assert.equal(isRemoteCandidate({ ...good, work_mode: 'hybrid' }), false)
  assert.equal(isRemoteCandidate({ ...good, verification_status: 'closed' }), false)
  assert.equal(isRemoteCandidate({ ...good, work_mode: 'onsite', location_raw: 'Cork', title: 'Bookkeeper' }), false)
})

test('private profile stays out of git and the hosted build', () => {
  const ignored = spawnSync('git', ['check-ignore', '-q', 'private/profile.json'])
  assert.equal(ignored.status, 0, 'private/profile.json must be git-ignored')
  assert.match(readFileSync('.dockerignore', 'utf8'), /^private$/m)
  const build = readFileSync('scripts/build-site.js', 'utf8')
  assert.match(build, /PUBLIC_PROFILE/)
  assert.doesNotMatch(build, /loadProfile|PROFILE_FILE|private\//)
  for (const file of ['site/api.js', 'site/static-core.js', 'public/remote-fit.js']) assert.doesNotMatch(readFileSync(file, 'utf8'), /profile\.json'|loadProfile/)
  const example = JSON.parse(readFileSync('profile.example.json', 'utf8'))
  assert.equal(example.permission.stamp, null)
})

test('Remote part time tab keeps Ireland-workable employee adverts only', () => {
  assert.equal(remoteFromIreland('Part-time Bookkeeper', 'Remote, Ireland', 'Part-time employee.'), 1)
  assert.equal(remoteFromIreland('Customer Support (Part-time)', 'Europe', 'Part-time.'), 1)
  for (const [title, location, text] of [
    ['Customer Support (Part-time)', 'United Kingdom', 'Part-time.'],
    ['Customer Support (Part-time)', 'Remote', 'Part-time.'],
    ['External Contractor - Mentor', 'Anywhere', 'Part-time.'],
    ['Tutor (Part-time)', 'Ireland', 'This is a freelance position.'],
    ['Support Agent - Remote US', 'Ireland', 'Part-time.'],
  ]) assert.equal(remoteFromIreland(title, location, text), 0, title)
  assert.ok(VIEW_BY_KEY['remote-pt'])
  // The view runs through SQL, including the registered advert-wording function.
  const result = queryJobs({ view: 'remote-pt', countries: ['ie'], limit: 300 })
  for (const j of result.rows) {
    assert.equal(j.work_mode, 'remote')
    assert.ok(['part_time', 'full_or_part_time'].includes(j.employment_type), j.title)
  }
})

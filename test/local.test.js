import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LOCAL_SEARCH } from '../src/sources/local.js'
import { buildJob } from '../src/normalise.js'

test('the local search is pointed at Limerick and its commuter towns', () => {
  assert.equal(DEFAULT_LOCAL_SEARCH.cities[0], 'Limerick')
  for (const town of ['Castletroy', 'Shannon', 'Ennis']) {
    assert.ok(DEFAULT_LOCAL_SEARCH.cities.includes(town), `${town} should be searched`)
  }
})

test('search intent rescues a student job whose title never says part time', () => {
  const raw = {
    url: 'https://example.test/1',
    source: 'local',
    title: 'Retail Assistant',
    description: 'Join our Limerick store team',
    locationRaw: 'Limerick',
  }
  // Without intent the partTimeOnly guard drops it, which is what kept the
  // Limerick part-time list nearly empty.
  assert.equal(buildJob(raw, 'now').score, 0)

  const kept = buildJob({ ...raw, intentProfiles: ['studentretail'] }, 'now')
  assert.ok(kept.score > 0)
  assert.ok(kept.groups.includes('student'))
  assert.ok(kept.profiles.includes('studentretail'))
})

test('intent never invents a profile that does not exist', () => {
  const j = buildJob({
    url: 'https://example.test/2', source: 'local', title: 'Retail Assistant', locationRaw: 'Limerick',
    intentProfiles: ['notarealprofile'],
  }, 'now')
  assert.equal(j.score, 0)
})

test('search intent does not vouch for a career role that happens to match', () => {
  // A Careerjet search for "part time" in Limerick returns senior roles too.
  // Those must not be filed as student work on the strength of the search alone.
  for (const title of ['Locum Pharmacist', 'Demand Planner', 'Senior Software Engineer', 'Client Relationship Manager']) {
    const j = buildJob({
      url: 'https://example.test/x', source: 'local', title,
      locationRaw: 'Limerick', intentProfiles: ['studentgeneral'],
    }, 'now')
    assert.ok(!j || !j.groups.includes('student'), `${title} should not be student work`)
  }
})

test('intent still rescues the genuinely casual titles', () => {
  for (const title of ['Retail Assistant', 'Kitchen Porter', 'Cleaner', 'Barista',
    'Sales Associate', 'Security Officer', 'Customer Service Advisor', 'Warehouse Operative']) {
    const j = buildJob({
      url: 'https://example.test/y', source: 'local', title,
      locationRaw: 'Limerick', intentProfiles: ['studentgeneral'],
    }, 'now')
    assert.ok(j.groups.includes('student'), `${title} should be student work`)
  }
})

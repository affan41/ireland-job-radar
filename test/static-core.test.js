import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, parseFilters } from '../site/static-core.js'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const job = (id, extra = {}) => ({ id, title: id, country: 'ie', region_key: 'limerick', employment_type: 'part_time', work_mode: 'onsite',
  score: 10, groups: 'student', available_sources: 'employer', first_seen: '2026-10-03T12:00:00.000Z', verification_status: 'unverified', ...extra })
const VIEWS = [{ key: 'limerick-pt', unstatedHours: true }]
const titles = (store, query) => store.query(parseFilters(query)).rows.map((r) => r.id).sort()

test('hosted filtering applies hours, dates, score and the hidden list', () => {
  const store = createStore({
    now: () => NOW,
    views: VIEWS,
    hidden: new Set(['hidden']),
    jobs: [
      job('short', { hours_max: 15 }), job('long', { hours_max: 35 }), job('unknown-hours'),
      job('old', { first_seen: '2026-09-01T00:00:00.000Z' }), job('weak', { score: 2 }), job('hidden'),
      job('scheme', { scheme: 'ce' }), job('abroad', { country: 'mt' }),
    ],
  })
  assert.deepEqual(titles(store, 'days=14&minScore=10'), ['long', 'short', 'unknown-hours'])
  assert.deepEqual(titles(store, 'days=14&minScore=10&maxHours=20'), ['short'])
  assert.deepEqual(titles(store, 'minScore=10'), ['long', 'old', 'short', 'unknown-hours'])
  assert.deepEqual(titles(store, 'days=14&scheme=schemes'), ['scheme'])
})

test('a view uses the membership bit for the chosen options, and lets title-only jobs past the score', () => {
  const store = createStore({
    now: () => NOW,
    views: VIEWS,
    jobs: [
      job('always', { views: { 'limerick-pt': 0b1111 } }),
      job('nearby-only', { views: { 'limerick-pt': 0b1010 } }),
      job('unstated-only', { views: { 'limerick-pt': 0b1100 }, score: 2, student_role: 1, employment_type: 'unspecified' }),
      job('elsewhere'),
    ],
  })
  assert.deepEqual(titles(store, 'view=limerick-pt&minScore=10'), ['always'])
  assert.deepEqual(titles(store, 'view=limerick-pt&minScore=10&nearby=1'), ['always', 'nearby-only'])
  assert.deepEqual(titles(store, 'view=limerick-pt&minScore=10&unstated=1'), ['always', 'unstated-only'])
  const f = store.facets(parseFilters('view=limerick-pt&minScore=10&nearby=1&unstated=1'))
  assert.equal(f.byView['limerick-pt'], 3)
  assert.deepEqual(f.byEmploymentType, { part_time: 2, unspecified: 1 })
  // The low-scoring title-only job does not leak into the all-Ireland count.
  assert.equal(f.byCountry.ie, 3)
})

test('the shortlist lives with the visitor', () => {
  const saved = new Set(['b'])
  const store = createStore({ now: () => NOW, saved, jobs: [job('a'), job('b')] })
  assert.deepEqual(titles(store, 'saved=1'), ['b'])
  assert.equal(store.query(parseFilters('')).rows.find((r) => r.id === 'b').is_saved, 1)
  assert.equal(store.stats().saved, 1)
})

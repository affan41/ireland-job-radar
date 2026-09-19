import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { VIEWS, VIEW_BY_KEY, viewClause } from '../src/views.js'

test('every view has the fields the UI and the query builder need', () => {
  for (const v of VIEWS) {
    assert.ok(v.key)
    assert.ok(v.name)
    assert.ok(v.note)
    assert.equal(VIEW_BY_KEY[v.key], v)
  }
})

test('Limerick part-time view requires part-time evidence regardless of category or seniority', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE jobs (title TEXT, region_key TEXT, work_mode TEXT, employment_type TEXT, career_role INTEGER, groups TEXT)')
    const insert = db.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)')
    for (const [title, region, mode, type, career, groups] of [
      ['Part-time shop assistant', 'limerick', 'onsite', 'part_time', 0, 'student'],
      ['Part-time accountant', 'limerick', 'onsite', 'part_time', 1, 'practice'],
      ['Remote part-time assistant', 'remote', 'remote', 'part_time', 0, 'student'],
      ['Full-time retailer', 'limerick', 'onsite', 'full_time', 0, 'student'],
      ['Unknown hours retailer', 'limerick', 'onsite', 'unspecified', 0, 'student'],
      ['Seasonal retailer', 'limerick', 'onsite', 'temporary', 0, 'student'],
      ['Temporary accountant', 'limerick', 'onsite', 'temporary', 1, 'practice'],
      ['Contract assistant', 'limerick', 'onsite', 'contract', 0, 'student'],
      ['Dublin onsite part-time', 'dublin', 'onsite', 'part_time', 0, 'student'],
    ]) insert.run(title, region, mode, type, career, groups)
    const c = viewClause('limerick-pt')
    assert.deepEqual(db.prepare(`SELECT title FROM jobs j WHERE ${c.sql} ORDER BY title`).all(...c.params).map(r => r.title),
      ['Part-time accountant', 'Part-time shop assistant', 'Remote part-time assistant'])
  } finally { db.close() }
})

test('an unknown view produces no clause rather than an empty filter', () => {
  assert.equal(viewClause('nope'), null)
  assert.equal(viewClause(''), null)
  assert.equal(viewClause(undefined), null)
})

test('nearby option includes named towns while preserving employment and county boundaries', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE jobs (location_raw TEXT, region_key TEXT, work_mode TEXT, employment_type TEXT, career_role INTEGER, groups TEXT)')
    const insert = db.prepare('INSERT INTO jobs VALUES (?,?,\'onsite\',?,0,\'student\')')
    for (const [location, region, type = 'part_time'] of [
      ['Limerick', 'limerick'], ['Shannon, Co. Clare', 'clare'], ['Ennis', 'clare'], ['Nenagh, Tipperary', 'tipperary'],
      ['Kilrush', 'clare'], ['Clonmel', 'tipperary'], ['Carrick-on-Shannon', 'leitrim'], ['Enniscorthy', 'wexford'],
      ['Ennis full-time', 'clare', 'full_time'], ['Shannon unknown hours', 'clare', 'unspecified'],
    ]) insert.run(location, region, type)
    const count = includeNearby => { const c = viewClause('limerick-pt', { includeNearby }); return db.prepare(`SELECT location_raw FROM jobs j WHERE ${c.sql}`).all(...c.params).map(j => j.location_raw).sort() }
    assert.deepEqual(count(false), ['Limerick'])
    assert.deepEqual(count(true), ['Ennis', 'Limerick', 'Nenagh, Tipperary', 'Shannon, Co. Clare'])
  } finally { db.close() }
})

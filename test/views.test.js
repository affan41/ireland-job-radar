import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VIEWS, VIEW_BY_KEY, viewClause } from '../src/views.js'

test('every view has the fields the UI and the query builder need', () => {
  for (const v of VIEWS) {
    assert.ok(v.key, 'view needs a key')
    assert.ok(v.name, `${v.key} needs a name`)
    assert.ok(v.note, `${v.key} needs a note explaining what it is`)
    assert.equal(VIEW_BY_KEY[v.key], v)
  }
})

test('the Limerick view covers Limerick and remote work, and rules out full-time', () => {
  const c = viewClause('limerick-pt')
  assert.ok(c, 'clause should be produced')
  assert.match(c.sql, /region_key IN \(\?\)/)
  assert.match(c.sql, /work_mode = 'remote' OR j\.region_key = 'remote'/)
  assert.match(c.sql, /NOT IN \(\?,\?\)/)
})

// Excluding full-time on its own is not enough, because most adverts never state
// their hours, so every senior role would qualify by silence.
test('the Limerick view also demands the work actually suit a student', () => {
  const c = viewClause('limerick-pt')
  assert.match(c.sql, /employment_type IN \(\?,\?\)/)
  assert.match(c.sql, /groups \|\| ','\) LIKE \?/)
  assert.deepEqual(c.params, [
    'limerick',
    'full_time', 'contract',
    'part_time', 'temporary',
    'part_time', 'temporary', '%,student,%',
  ])
})

test('an unknown view produces no clause rather than an empty filter', () => {
  assert.equal(viewClause('nope'), null)
  assert.equal(viewClause(''), null)
  assert.equal(viewClause(undefined), null)
})

// A title heuristic must never overrule an advert that states its own hours.
test('a career title is allowed back when the advert says it is part-time', () => {
  const c = viewClause('limerick-pt')
  assert.match(c.sql, /career_role, 0\) = 0 OR j\.employment_type IN \(\?,\?\)/)
})

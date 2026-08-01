import test from 'node:test'
import assert from 'node:assert/strict'

import { classify } from '../src/profiles.js'
import { detectEmploymentType } from '../src/employment.js'

test('keeps an explicitly part-time student retail role', () => {
  const match = classify('Part-Time Retail Assistant', 'Weekend shifts available')
  assert.ok(match.groups.includes('student'))
  assert.ok(match.profiles.includes('studentretail'))
  assert.equal(detectEmploymentType('Part-Time Retail Assistant'), 'part_time')
})

test('does not classify a full-time retail role as a student part-time role', () => {
  const match = classify('Retail Assistant', 'This is a permanent full-time role')
  assert.ok(!match.groups.includes('student'))
  assert.equal(detectEmploymentType('Retail Assistant', 'Permanent full-time role'), 'full_time')
})

test('recognises a common student job when part-time is stated in the advert body', () => {
  const match = classify('Barista', 'Part time role, 16 hours per week')
  assert.ok(match.profiles.includes('studenthospitality'))
  assert.ok(match.score >= 10)
})

test('does not label an unrelated specialist role as student-friendly merely because it is part-time', () => {
  const match = classify('General Practitioner (Part-Time)', 'Weekend medical clinic')
  assert.ok(!match.groups.includes('student'))
})

test('prefers the specific full-time hours in a title over mixed boilerplate', () => {
  const title = 'Customer Delivery Driver (Permanent 30-35 Hours)'
  const body = 'We offer both part time and full time contracts across our stores.'
  assert.equal(detectEmploymentType(title, body), 'full_time')
  assert.ok(!classify(title, body).groups.includes('student'))
})

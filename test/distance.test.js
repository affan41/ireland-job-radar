import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateDistance, kilometresBetween, TROY_VILLAGE } from '../src/distance.js'

const job = (location, extra = {}) => ({ title: 'Sales assistant', location_raw: location, country: 'ie', region_key: 'limerick', ...extra })
test('city-only locations do not invent a distance', () => {
  assert.equal(kilometresBetween(TROY_VILLAGE,TROY_VILLAGE),0)
  const d=estimateDistance(job('Limerick'));assert.equal(d.kind,'unknown');assert.equal(d.km,null);assert.equal(d.label,'Exact workplace unknown')
})
test('specific shopping centre takes precedence over city', () => {
  const d = estimateDistance(job('Crescent Shopping Centre, Dooradoyle, Limerick'))
  assert.equal(d.place, 'Crescent Shopping Centre')
  assert.ok(d.km > 4 && d.km < 6)
})
test('street names do not turn a local location into a distant town', () => {
  const d = estimateDistance(job('Tesco Coonagh, Coonagh Cross, Ennis Road, Limerick'))
  assert.equal(d.kind, 'unknown')
})
test('remote is not shown as a zero kilometre workplace and hybrid retains distance', () => {
  assert.equal(estimateDistance(job('Dublin', { work_mode: 'remote' })).kind, 'remote')
  assert.equal(estimateDistance(job('Limerick', { work_mode: 'hybrid' })).kind, 'unknown')
})
test('unknown, county-only, foreign and multiple distant locations do not invent a commute', () => {
  for (const location of ['', 'County Limerick', 'Co. Limerick', 'Ireland', 'Multiple locations', 'Limerick / Dublin']) {
    assert.equal(estimateDistance(job(location)).kind, 'unknown', location)
  }
  assert.equal(estimateDistance(job('Limerick', { country: 'mt' })).kind, 'unknown')
  assert.equal(estimateDistance(job('Unknown', { description: 'Head office in Limerick' })).kind, 'unknown')
})
test('advertised coordinates take priority and invalid coordinates fall back safely', () => {
  const d = estimateDistance(job('Limerick', { latitude: TROY_VILLAGE.latitude, longitude: TROY_VILLAGE.longitude, location_precision: 'workplace' }))
  assert.equal(d.kind, 'workplace')
  assert.equal(d.label, '<0.5 km')
  assert.equal(estimateDistance(job('Limerick', { latitude: 0, longitude: 0 })).kind, 'unknown')
  assert.equal(estimateDistance(job('Limerick', { latitude: 500, longitude: 9 })).kind, 'unknown')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {assessSponsorship} from '../src/sponsorship.js'
import {resolveRegion,isInCountry,countryFallback,detectCountry} from '../src/regions.js'
test('only explicit offers establish sponsorship, preserving the evidence source',()=>{
 const r=assessSponsorship({description:'Visa sponsorship is available for this role.',url:'https://employer.test/1'})
 assert.equal(r.level,'explicit');assert.match(r.evidence,/Visa sponsorship/);assert.equal(r.source,'https://employer.test/1')
})
test('employers, relocation packages, permit eligibility and mentions are not offers',()=>{
 for(const description of ['Relocation package available.','Eligible for the Key Employee Initiative.','Role qualifies for a Critical Skills Employment Permit.','Do you need visa sponsorship?','Must already hold the right to work in Ireland.','']){
  assert.equal(assessSponsorship({description,company:'KPMG',source:'employer'}).level,'unknown',description)
 }
})
test('explicit refusal takes priority over sponsorship keywords',()=>{
 assert.equal(assessSponsorship({description:'Visa sponsorship is not available.'}).level,'unlikely')
 assert.equal(assessSponsorship({description:'We are unable to sponsor visas.'}).level,'unlikely')
})

/* ------------------------------------------------------------- Countries */

test('places Cyprus and Malta listings in the right country', () => {
  assert.equal(resolveRegion('Limassol').country, 'cy')
  assert.equal(resolveRegion('Nicosia, Cyprus').regionKey, 'nicosia')
  assert.equal(resolveRegion('Valletta, Malta Island').country, 'mt')
  assert.equal(resolveRegion('Sliema').regionKey, 'malta-northern-harbour')
  assert.equal(resolveRegion('Gozo').regionKey, 'malta-gozo')
})

test('keeps Irish resolution untouched now that other countries share the gazetteer', () => {
  assert.equal(resolveRegion('Dublin 2').regionKey, 'dublin')
  assert.equal(resolveRegion('Cork, Ireland').regionKey, 'cork')
  assert.equal(resolveRegion('Belfast').province, 'Northern Ireland')
  assert.equal(resolveRegion('Dublin, OH').regionKey, 'unknown')
  assert.equal(resolveRegion('Ireland').regionKey, 'nationwide')
})

test('only claims an ambiguous town when the advert names the country', () => {
  assert.equal(resolveRegion('Victoria, Australia').regionKey, 'unknown')
  assert.equal(resolveRegion('Victoria, Gozo, Malta').regionKey, 'malta-gozo')
  assert.equal(resolveRegion('Rabat, Morocco').regionKey, 'unknown')
  assert.equal(resolveRegion('Rabat, Malta').country, 'mt')
})

test('does not let a town from one country win in an advert that names another', () => {
  assert.equal(resolveRegion('Cork, Ireland').country, 'ie')
  assert.equal(resolveRegion('Larnaca, Cyprus').country, 'cy')
  assert.equal(detectCountry('Msida, Malta'), 'mt')
})

test('files an unrecognised town under the country the feed searched', () => {
  assert.equal(countryFallback('mt').regionKey, 'malta-any')
  assert.equal(countryFallback('cy').regionKey, 'cyprus-any')
  assert.equal(countryFallback('ie').regionKey, 'nationwide')
})

test('answers which country a location belongs to', () => {
  assert.equal(isInCountry('Sliema', 'mt'), true)
  assert.equal(isInCountry('Sliema', 'ie'), false)
  assert.equal(isInCountry('Limassol', 'cy'), true)
  assert.equal(isInCountry('Dublin', 'ie'), true)
  assert.equal(isInCountry('Bangalore', 'mt'), false)
})

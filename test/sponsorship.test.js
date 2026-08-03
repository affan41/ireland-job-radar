import test from 'node:test'
import assert from 'node:assert/strict'

import { assessSponsorship } from '../src/sponsorship.js'
import { resolveRegion, isInCountry, countryFallback, detectCountry } from '../src/regions.js'

/* --------------------------------------------------------- Sponsorship read */

test('picks up an advert that offers visa sponsorship outright', () => {
  const r = assessSponsorship({
    title: 'Senior Accountant',
    description: 'Visa sponsorship is available for the right candidate.',
    company: 'Some Ltd',
  })

  assert.equal(r.level, 'explicit')
  assert.ok(r.reasons.length)
})

test('treats a relocation package as an offer to move someone', () => {
  const r = assessSponsorship({
    title: 'Tax Consultant',
    description: 'We offer a generous relocation package and help you settle in Malta.',
    company: 'Nobody Ltd',
  })

  assert.equal(r.level, 'explicit')
})

test('reads the Maltese and Irish permit routes by name', () => {
  assert.equal(assessSponsorship({ description: 'Eligible for the Key Employee Initiative.' }).level, 'explicit')
  assert.equal(assessSponsorship({ description: 'Role qualifies for a Critical Skills Employment Permit.' }).level, 'explicit')
  assert.equal(assessSponsorship({ description: 'We apply for your Single Permit.' }).level, 'explicit')
})

test('believes an advert that rules sponsorship out, even alongside perks', () => {
  const r = assessSponsorship({
    title: 'Financial Accountant',
    description: 'Great benefits and a relocation package. Please note we are unable to sponsor visas.',
    company: 'PwC',
  })

  assert.equal(r.level, 'unlikely')
  assert.match(r.reasons.join(' '), /cannot sponsor/)
})

test('treats a demand for existing right to work as a no', () => {
  for (const text of [
    'Applicants must already hold the right to work in Ireland.',
    'Open to EU citizens only.',
    'You will need a Stamp 4 to apply.',
    'No visa sponsorship is offered for this position.',
  ]) {
    assert.equal(assessSponsorship({ description: text }).level, 'unlikely', text)
  }
})

test('rates a Big Four employer as a likely sponsor when the advert is silent', () => {
  const r = assessSponsorship({
    title: 'Tax Senior',
    description: 'Join our corporate tax team in Dublin.',
    company: 'KPMG Ireland',
  })

  assert.equal(r.level, 'likely')
  assert.match(r.reasons.join(' '), /practice firm/)
})

test('rates the Malta and Cyprus employers that relocate people as likely', () => {
  assert.equal(assessSponsorship({ title: 'Finance Manager', company: 'Betsson Group' }).level, 'likely')
  assert.equal(assessSponsorship({ title: 'Accountant', company: 'Exness' }).level, 'likely')
  assert.equal(assessSponsorship({ title: 'Fund Accountant', company: 'Alter Domus' }).level, 'likely')
})

test('credits the island relocation agencies only in Cyprus and Malta', () => {
  const role = { title: 'Senior Accountant', company: 'GRS Recruitment', source: 'careerjet' }

  assert.equal(assessSponsorship({ ...role, country: 'mt' }).level, 'likely')
  assert.equal(assessSponsorship({ ...role, country: 'cy' }).level, 'likely')
  // The same agency name in Ireland is an ordinary recruiter and proves nothing.
  assert.equal(assessSponsorship({ ...role, country: 'ie' }).level, 'unknown')
})

test('still believes an outright no from an island agency', () => {
  const r = assessSponsorship({
    title: 'Accountant',
    description: 'Candidates must already hold the right to work in Malta.',
    company: 'Konnekt',
    country: 'mt',
  })

  assert.equal(r.level, 'unlikely')
})

test('counts a listing read straight from an employer careers site as likely', () => {
  const r = assessSponsorship({ title: 'Analyst', company: 'A Small Firm', source: 'employer' })

  assert.equal(r.level, 'likely')
  assert.match(r.reasons.join(' '), /own careers site/)
})

test('says nothing rather than guessing for an unknown employer on an aggregator', () => {
  const r = assessSponsorship({
    title: 'Bookkeeper',
    description: 'Small practice seeks a bookkeeper.',
    company: 'Murphy & Co',
    source: 'careerjet',
  })

  assert.equal(r.level, 'unknown')
  assert.deepEqual(r.reasons, [])
})

test('does not read a marketing sponsorship deal as a visa offer', () => {
  const r = assessSponsorship({
    title: 'Marketing Executive',
    description: 'Manage our stadium sponsorship deals and partner activations.',
    company: 'Murphy & Co',
    source: 'careerjet',
  })

  assert.equal(r.level, 'unknown')
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

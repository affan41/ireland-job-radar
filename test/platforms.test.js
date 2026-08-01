import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findWorkdayCountryFacet,
  mapEightfoldJob,
  mapOracleJob,
  mapWorkdayJob,
  parseAvatureSearch,
  parseSuccessFactorsSearch,
  workdayLocation,
} from '../src/sources/platforms.js'
import { relativeToISO, toDateISO } from '../src/normalise.js'
import { isIrishLocation } from '../src/regions.js'

/* --------------------------------------------------------- Workday facets */

test('finds Ireland in the standard nested Workday country facet', () => {
  const facet = findWorkdayCountryFacet([
    { facetParameter: 'timeType', descriptor: 'Time Type', values: [{ descriptor: 'Full time', id: 'ft' }] },
    {
      facetParameter: 'locationMainGroup',
      values: [
        {
          facetParameter: 'locationCountry',
          descriptor: 'Country',
          values: [
            { descriptor: 'United States of America', id: 'us', count: 900 },
            { descriptor: 'Ireland', id: '04a05835925f45b3a59406a2a6b72c8a', count: 72 },
          ],
        },
      ],
    },
  ])

  assert.equal(facet.facetParameter, 'locationCountry')
  assert.deepEqual(facet.ids, ['04a05835925f45b3a59406a2a6b72c8a'])
})

test('finds Ireland in a tenant-specific country facet such as State Street uses', () => {
  const facet = findWorkdayCountryFacet([
    {
      facetParameter: 'Location_Country',
      descriptor: 'Location Country',
      values: [{ descriptor: 'India', id: 'in' }, { descriptor: 'Ireland', id: 'ie' }],
    },
  ])

  assert.equal(facet.facetParameter, 'Location_Country')
  assert.deepEqual(facet.ids, ['ie'])
})

test('prefers a real country facet over an office list that also names Ireland', () => {
  const facet = findWorkdayCountryFacet([
    {
      facetParameter: 'locationMainGroup',
      values: [
        { facetParameter: 'locationCountry', descriptor: 'Country', values: [{ descriptor: 'Ireland', id: 'country-ie' }] },
        { facetParameter: 'locations', descriptor: 'Sites', values: [{ descriptor: 'Ireland, Cork', id: 'site-cork' }] },
      ],
    },
  ])

  assert.deepEqual(facet.ids, ['country-ie'])
})

test('falls back to every Irish office when the site has no country level', () => {
  const facet = findWorkdayCountryFacet([
    {
      facetParameter: 'locationMainGroup',
      values: [
        {
          facetParameter: 'locations',
          descriptor: 'Sites',
          values: [
            { descriptor: 'Dublin-Dublin-Ireland', id: 'dub' },
            { descriptor: 'Cork, Ireland', id: 'cork' },
            { descriptor: 'Dublin, OH', id: 'ohio' },
            { descriptor: 'Bangalore', id: 'blr' },
          ],
        },
      ],
    },
  ])

  assert.equal(facet.facetParameter, 'locations')
  assert.deepEqual(facet.ids, ['dub', 'cork'])
})

test('reports no Ireland vacancies rather than an error when a site lists places but none are Irish', () => {
  const facet = findWorkdayCountryFacet([
    {
      facetParameter: 'locationMainGroup',
      values: [{ facetParameter: 'locationCountry', descriptor: 'Country', values: [{ descriptor: 'Japan', id: 'jp' }] }],
    },
  ])

  assert.equal(facet.facetParameter, null)
  assert.equal(facet.noIrelandJobs, true)
})

test('flags a site with no location facets at all as unusable rather than empty', () => {
  const facet = findWorkdayCountryFacet([
    { facetParameter: 'jobFamilyGroup', descriptor: 'Area of Work', values: [{ descriptor: 'Finance', id: 'fin' }] },
  ])

  assert.equal(facet.facetParameter, null)
  assert.equal(facet.noIrelandJobs, false)
})

/* -------------------------------------------------------- Workday mapping */

test('reads the office out of the bullet fields when Workday omits the location text', () => {
  assert.equal(workdayLocation({ bulletFields: ['R00345688', 'Dublin'], externalPath: '/job/Dublin/x_R1' }), 'Dublin')
})

test('falls back to the vacancy path when Workday gives no location at all', () => {
  assert.equal(workdayLocation({ bulletFields: ['R00345688'], externalPath: '/job/IRL---Cork---Model-Farm-Road/Tax_R1' }), 'IRL Cork Model Farm Road')
})

test('maps a Workday posting to a direct application link and a resolvable location', () => {
  const job = mapWorkdayJob({
    title: 'Financial Analyst',
    externalPath: '/job/Dublin/Financial-Analyst_R123',
    postedOn: 'Posted 3 Days Ago',
    bulletFields: ['R123', 'Dublin'],
    timeType: 'Full time',
  }, {
    company: 'Accenture',
    host: 'accenture.wd103.myworkdayjobs.com',
    site: 'AccentureCareers',
    sourceDetail: 'Accenture Careers',
  })

  assert.equal(job.company, 'Accenture')
  assert.equal(job.locationRaw, 'Dublin')
  assert.equal(job.employmentType, 'full_time')
  assert.equal(job.url, 'https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Dublin/Financial-Analyst_R123')
})

test('names the country when a Workday location would not otherwise resolve to Ireland', () => {
  const job = mapWorkdayJob({
    title: 'Tax Senior',
    externalPath: '/job/Grange-Castle/Tax-Senior_R9',
    bulletFields: ['R9', 'Grange Castle'],
  }, { company: 'Pfizer', host: 'pfizer.wd1.myworkdayjobs.com', site: 'PfizerCareers', sourceDetail: 'Pfizer Careers' })

  assert.equal(job.locationRaw, 'Grange Castle, Ireland')
})

/* ------------------------------------------------------- SAP SuccessFactors */

test('reads Ireland rows from a SuccessFactors results table', () => {
  const html = `
    <span class="paginationLabel">Results <b>1 - 2</b> of <b>1,204</b></span>
    <tr class="data-row clickable">
      <td><a class="jobTitle-link" href="/job/Dublin-Tax-Manager/900/">Tax Manager</a></td>
      <td><span class="jobLocation">Dublin, D, IE</span></td>
      <td><span class="jobDepartment">Tax</span></td>
    </tr>
    <tr class="data-row">
      <td><a href="/job/London-Tax-Manager/901/" class="jobTitle-link">Tax Manager</a></td>
      <td><span class="jobLocation">London, GB</span></td>
    </tr>
  `
  const result = parseSuccessFactorsSearch(html, { company: 'Vodafone', origin: 'https://careers.vodafone.com' })

  assert.equal(result.total, 1204)
  assert.equal(result.jobs.length, 1)
  assert.equal(result.jobs[0].title, 'Tax Manager')
  assert.equal(result.jobs[0].locationRaw, 'Dublin, D, IE')
  assert.equal(result.jobs[0].description, 'Tax')
  assert.equal(result.jobs[0].sourceDetail, 'Vodafone Careers')
  assert.equal(result.jobs[0].url, 'https://careers.vodafone.com/job/Dublin-Tax-Manager/900/')
})

/* ------------------------------------------------------- Oracle Recruiting */

test('maps an Oracle Recruiting requisition to its public vacancy page', () => {
  const job = mapOracleJob({
    Id: '12345',
    Title: 'Financial Accountant',
    PrimaryLocation: 'Dublin, Ireland',
    secondaryLocations: [{ Name: 'Cork, Ireland' }],
    PostedDate: '2026-07-20',
    ShortDescriptionStr: 'Own the monthly close.',
    JobFamily: 'Finance',
    WorkplaceType: 'Hybrid',
    JobSchedule: 'Full time',
  }, { company: 'Dell', host: 'dell.wd1.oraclecloud.com', site: 'CX_1', sourceDetail: 'Dell Careers' })

  assert.equal(job.locationRaw, 'Dublin, Ireland; Cork, Ireland')
  assert.equal(job.workMode, 'hybrid')
  assert.equal(job.employmentType, 'full_time')
  assert.equal(job.url, 'https://dell.wd1.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/12345')
})

/* ---------------------------------------------------------------- Eightfold */

test('maps an Eightfold position to its canonical posting', () => {
  const job = mapEightfoldJob({
    id: 55,
    name: 'Risk Analyst',
    locations: ['Dublin, Ireland'],
    t_create: 1785000000,
    job_description: 'Assess merchant risk.',
    canonicalPositionUrl: 'https://paypal.eightfold.ai/careers/job/55',
    work_location_option: 'hybrid',
  }, { company: 'PayPal', tenant: 'paypal', sourceDetail: 'PayPal Careers' })

  assert.equal(job.company, 'PayPal')
  assert.equal(job.locationRaw, 'Dublin, Ireland')
  assert.equal(job.workMode, 'hybrid')
  assert.equal(job.url, 'https://paypal.eightfold.ai/careers/job/55')
})

/* ------------------------------------------------------------------ Avature */

test('reads a vacancy from an Avature careers portal', () => {
  const html = `
    <div class="list-controls__legend">Displaying 1 - 1 of 1 results</div>
    <div class="list__item__text__title"><a href="/portal/FolderDetail/Audit-Senior/77">Audit Senior</a></div>
    <div class="list__item__text__subtitle"><span>Dublin - </span></div>
    <div class="list__item__description">Lead statutory audits.</div>
  `
  const result = parseAvatureSearch(html, { company: 'Grant Thornton', origin: 'https://gt.avature.net' })

  assert.equal(result.total, 1)
  assert.equal(result.jobs[0].url, 'https://gt.avature.net/portal/FolderDetail/Audit-Senior/77')
  assert.equal(result.jobs[0].sourceDetail, 'Grant Thornton Careers')
})

/* ------------------------------------------------------------ Shared pieces */

test('turns a relative posting date into a real one', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z')
  assert.equal(relativeToISO('Posted 3 Days Ago', now), '2026-07-29T12:00:00.000Z')
  assert.equal(relativeToISO('Posted 30+ Days Ago', now), '2026-07-02T12:00:00.000Z')
  assert.equal(relativeToISO('Posted Today', now), '2026-08-01T12:00:00.000Z')
  assert.equal(relativeToISO('Posted Yesterday', now), '2026-07-31T12:00:00.000Z')
  assert.equal(relativeToISO('2026-07-01'), null)
  assert.equal(toDateISO('Posted 1 Week Ago', now), '2026-07-25T12:00:00.000Z')
  assert.equal(toDateISO('2026-07-01T00:00:00.000Z'), '2026-07-01T00:00:00.000Z')
})

test('keeps the Ireland location test honest about lookalike places', () => {
  assert.equal(isIrishLocation('Dublin, Ireland'), true)
  assert.equal(isIrishLocation('Cork'), true)
  assert.equal(isIrishLocation('Belfast'), true)
  assert.equal(isIrishLocation('Belfast', { includeNorthernIreland: false }), false)
  assert.equal(isIrishLocation('Dublin, OH'), false)
  assert.equal(isIrishLocation('Limerick, PA'), false)
  assert.equal(isIrishLocation('Bangalore'), false)
  assert.equal(isIrishLocation(''), false)
})

// Searches aimed at one place rather than a whole country.
//
// The national Careerjet sweep is sorted by date, so a city the size of Limerick
// never surfaces more than a handful of its own listings before the pages run out.
// Asking Careerjet directly for "part time" in Limerick returns several hundred.
// This module does that, for the town you live in and everywhere in commuting
// distance, plus a set of work-from-home searches for the days you cannot travel.
//
// Every search here declares its intent, so a result plainly titled "Retail
// Assistant" is kept on the strength of what was asked for rather than being
// dropped because the title does not repeat the words "part time".

import { getJSON, sleep } from './http.js'

const ENDPOINT = 'http://public.api.careerjet.net/search'
const PAGE_SIZE = 99

// Query text paired with the profile it is standing in for.
const CITY_QUERIES = [
  ['part time', 'studentgeneral'],
  ['weekend', 'studentgeneral'],
  ['evening', 'studentgeneral'],
  ['student', 'studentgeneral'],
  ['casual', 'studentgeneral'],
  ['temporary', 'studentgeneral'],
  ['seasonal', 'studentgeneral'],
  ['event staff', 'studentgeneral'],

  ['retail assistant', 'studentretail'],
  ['sales assistant', 'studentretail'],
  ['shop assistant', 'studentretail'],
  ['store assistant', 'studentretail'],
  ['deli assistant', 'studentretail'],
  ['checkout', 'studentretail'],
  ['stock assistant', 'studentretail'],

  ['barista', 'studenthospitality'],
  ['waiter', 'studenthospitality'],
  ['bar staff', 'studenthospitality'],
  ['kitchen porter', 'studenthospitality'],
  ['catering assistant', 'studenthospitality'],
  ['chef', 'studenthospitality'],
  ['housekeeping', 'studenthospitality'],
  ['food and beverage', 'studenthospitality'],
  ['crew member', 'studenthospitality'],

  ['customer service', 'studentsupport'],
  ['receptionist', 'studentsupport'],
  ['admin assistant', 'studentsupport'],
  ['data entry', 'studentsupport'],
  ['tutor', 'studentsupport'],
  ['call centre', 'studentsupport'],

  ['cleaner', 'studentoperations'],
  ['warehouse', 'studentoperations'],
  ['general operative', 'studentoperations'],
  ['delivery driver', 'studentoperations'],
  ['security officer', 'studentoperations'],
  ['care assistant', 'studentoperations'],
  ['healthcare assistant', 'studentoperations'],
]

// Run against the whole country, because work you do from home has no address.
const REMOTE_QUERIES = [
  ['remote part time', 'studentgeneral'],
  ['work from home', 'studentgeneral'],
  ['remote customer service', 'studentsupport'],
  ['customer support remote', 'studentsupport'],
  ['virtual assistant', 'studentsupport'],
  ['remote data entry', 'studentsupport'],
  ['online tutor', 'studentsupport'],
  ['remote administrator', 'studentsupport'],
  ['transcription', 'studentsupport'],
  ['social media assistant', 'studentsupport'],
  ['remote moderator', 'studentsupport'],
  ['data annotation', 'studentsupport'],
]

export const DEFAULT_LOCAL_SEARCH = {
  enabled: true,
  country: 'ie',
  locale: 'en_IE',
  // Limerick city, the university side of it, and the towns within a commute.
  cities: [
    'Limerick', 'Castletroy', 'Raheen', 'Annacotty', 'Newcastle West',
    'Shannon', 'Ennis', 'Nenagh', 'Adare',
  ],
  // Work-from-home searches are run once against the country, not per city.
  remoteLocation: 'Ireland',
  maxPages: 4,
  concurrency: 5,
  delayMs: 120,
}

export async function fetchLocal({
  cities = DEFAULT_LOCAL_SEARCH.cities,
  country = 'ie',
  locale = 'en_IE',
  remoteLocation = 'Ireland',
  includeRemote = true,
  maxPages = 4,
  concurrency = 5,
  delayMs = 120,
  affid,
  onProgress,
} = {}) {
  const out = []
  const errors = []

  const searches = [
    ...cities.flatMap((city) => CITY_QUERIES.map(([q, intent]) => ({ q, intent, location: city, remote: false }))),
    ...(includeRemote ? REMOTE_QUERIES.map(([q, intent]) => ({ q, intent, location: remoteLocation, remote: true })) : []),
  ]

  let cursor = 0
  let done = 0

  const worker = async () => {
    while (cursor < searches.length) {
      const { q, intent, location, remote } = searches[cursor++]

      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          keywords: q,
          location,
          locale_code: locale,
          pagesize: String(PAGE_SIZE),
          page: String(page),
          sort: 'date',
          user_ip: '87.44.1.1',
          user_agent: 'Mozilla/5.0',
        })
        if (affid) params.set('affid', affid)

        let data
        try {
          data = await getJSON(`${ENDPOINT}?${params}`, { headers: { Referer: 'http://localhost/job-radar' } })
        } catch (err) {
          errors.push(`local ${location} "${q}" p${page}: ${err.message}`)
          break
        }

        if (data?.type !== 'JOBS' || !Array.isArray(data.jobs) || data.jobs.length === 0) break

        for (const j of data.jobs) {
          out.push({
            source: 'local',
            sourceDetail: remote ? `remote:${q}` : `${location}:${q}`,
            country,
            // Naming the city helps the gazetteer when a board gives a bare street
            // address, but never overrides a location the advert states itself.
            regionHint: remote ? undefined : `${location}, Ireland`,
            intentProfiles: [intent],
            title: j.title,
            company: j.company,
            locationRaw: j.locations,
            url: j.url,
            description: j.description,
            postedAt: j.date,
            salaryText: j.salary,
            salaryMin: numOrNull(j.salary_min),
            salaryMax: numOrNull(j.salary_max),
            salaryCurrency: j.salary_currency_code || null,
            salaryPeriod: periodFromCode(j.salary_type),
          })
        }

        if (page >= (data.pages || 1)) break
        await sleep(delayMs)
      }

      done++
      if (done % 20 === 0 || done === searches.length) {
        onProgress?.(`local: ${done}/${searches.length} searches, ${out.length} listings`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  return { jobs: out, errors }
}

const numOrNull = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const periodFromCode = (c) => ({ Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour' }[c] || null)

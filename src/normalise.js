import { createHash } from 'node:crypto'
import { resolveRegion, detectWorkMode, countryFallback } from './regions.js'
import { classify, PROFILE_BY_ID } from './profiles.js'
import { detectEmploymentType } from './employment.js'
import { assessSponsorship } from './sponsorship.js'

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&euro;': '€', '&pound;': '£', '&dollar;': '$', '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '-',
}

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')

// Some feeds hand back HTML, some hand back HTML that has itself been entity
// encoded, so strip and decode twice before giving up.
export function clean(html, maxLen = 900) {
  if (!html) return ''
  let s = decode(String(html).replace(/<[^>]*>/g, ' '))
  s = decode(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > maxLen) s = `${s.slice(0, maxLen).trimEnd()}...`
  return s
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Titles that mean a career role rather than something you fit around lectures.
export const SENIOR_TITLE = /\b(senior|lead|principal|head of|director|manager|management|consultant|engineer|developer|architect|analyst|scientist|accountant|solicitor|pharmacist|physiotherapist|nurse|doctor|surveyor|planner|controller|auditor|specialist)\b/i

// Same role posted by the same employer in the same place is one job, no matter
// how many boards it came through.
export function jobId(title, company, locationRaw) {
  return createHash('sha1')
    .update(`${norm(title)}|${norm(company)}|${norm(locationRaw).slice(0, 24)}`)
    .digest('hex')
    .slice(0, 20)
}

const PERIODS = [
  [/per\s*(year|annum|yr)|\bp\.?a\.?\b|annual/i, 'year'],
  [/per\s*(month|mth)|monthly/i, 'month'],
  [/per\s*(week|wk)|weekly/i, 'week'],
  [/per\s*(day)|daily|\bdaily rate\b/i, 'day'],
  [/per\s*(hour|hr)|hourly|\ban hour\b/i, 'hour'],
]

export function parseSalary(text, hints = {}) {
  const out = {
    salaryText: hints.salaryText || (text ? clean(text, 120) : null),
    salaryMin: hints.salaryMin ?? null,
    salaryMax: hints.salaryMax ?? null,
    salaryCurrency: hints.salaryCurrency ?? null,
    salaryPeriod: hints.salaryPeriod ?? null,
  }

  const s = clean(text || '', 200)
  if (!s) return out

  if (!out.salaryCurrency) {
    if (/€|eur/i.test(s)) out.salaryCurrency = 'EUR'
    else if (/£|gbp/i.test(s)) out.salaryCurrency = 'GBP'
    else if (/\$|usd/i.test(s)) out.salaryCurrency = 'USD'
  }
  if (!out.salaryPeriod) {
    for (const [re, p] of PERIODS) if (re.test(s)) { out.salaryPeriod = p; break }
  }

  if (out.salaryMin == null && out.salaryMax == null) {
    const nums = [...s.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi)]
      .map((m) => {
        let v = Number(m[1].replace(/,/g, ''))
        if (m[2]) v *= 1000
        return v
      })
      .filter((v) => Number.isFinite(v) && v >= 5)
    if (nums.length === 1) out.salaryMin = nums[0]
    if (nums.length >= 2) { out.salaryMin = Math.min(nums[0], nums[1]); out.salaryMax = Math.max(nums[0], nums[1]) }
  }

  // Normalise everything to an annual figure so sorting and filtering compare like with like.
  const mult = { year: 1, month: 12, week: 52, day: 230, hour: 1800 }[out.salaryPeriod]
  if (mult && mult !== 1) {
    if (out.salaryMin != null) out.salaryMin = Math.round(out.salaryMin * mult)
    if (out.salaryMax != null) out.salaryMax = Math.round(out.salaryMax * mult)
  }
  // A "salary" under 5k a year is a parse artefact, not a wage.
  if (out.salaryMin != null && out.salaryMin < 5000) { out.salaryMin = null; out.salaryMax = null }

  return out
}

// Workday and several employer portals only say how long ago a job went up
// ("Posted 3 Days Ago"), so turn that back into a date rather than losing it.
const AGO_MS = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 }
const AGO_RE = /(\d+)\s*\+?\s*(minute|hour|day|week|month)s?\s+ago/i
const TODAY_RE = /\b(today|just posted|posted today)\b/i
const YESTERDAY_RE = /\byesterday\b/i

export function relativeToISO(text, now = Date.now()) {
  const s = String(text || '')
  if (!s) return null
  if (TODAY_RE.test(s)) return new Date(now).toISOString()
  if (YESTERDAY_RE.test(s)) return new Date(now - AGO_MS.day).toISOString()
  const m = s.match(AGO_RE)
  if (!m) return null
  return new Date(now - Number(m[1]) * AGO_MS[m[2].toLowerCase()]).toISOString()
}

export function toDateISO(v, now = Date.now()) {
  if (!v) return null
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString()
  const relative = relativeToISO(v, now)
  if (relative) return relative
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Turns whatever a source hands back into the one shape the database stores.
export function buildJob(raw, seenAt) {
  const title = clean(raw.title, 200)
  if (!title || !raw.url) return null

  const company = clean(raw.company, 120) || null
  const description = clean(raw.description, 900)
  const locationRaw = clean(raw.locationRaw, 140)

  let region = resolveRegion(locationRaw, raw.regionHint)
  // A Cyprus or Malta feed knows its own country even when the town is one the
  // gazetteer has never heard of, so keep the listing rather than losing it.
  if (region.regionKey === 'unknown' && raw.country) region = countryFallback(raw.country)

  let { profiles, groups, score } = classify(title, description)

  // Some searches are their own evidence. When the collector asked Careerjet for
  // part-time retail work in Limerick, a result titled plainly "Retail Assistant"
  // is exactly what was wanted, even though the title never says "part time" and
  // the partTimeOnly guard would otherwise throw it away.
  const intent = (raw.intentProfiles || []).filter((id) => PROFILE_BY_ID[id])
  // The search intent is blunt: a Careerjet search for "part time" in Limerick
  // returns senior roles too. Do not let it vouch for a job that reads as a career
  // position, or the student categories fill up with pharmacists and planners.
  if (intent.length && !SENIOR_TITLE.test(title)) {
    profiles = [...new Set([...profiles, ...intent])]
    groups = [...new Set([...groups, ...intent.map((id) => PROFILE_BY_ID[id].group)])]
    score = Math.max(score, raw.intentScore ?? 10)
  }
  const salary = parseSalary(raw.salaryText, raw)
  const country = region.country ?? raw.country ?? null
  const sponsorship = assessSponsorship({ title, description, company, source: raw.source, country })

  return {
    id: jobId(title, company, locationRaw),
    title,
    company,
    locationRaw,
    ...region,
    country,
    sponsorship: sponsorship.level,
    sponsorshipReasons: sponsorship.reasons,
    url: raw.url,
    source: raw.source,
    sourceDetail: raw.sourceDetail ?? null,
    description,
    ...salary,
    postedAt: toDateISO(raw.postedAt),
    workMode: raw.workMode || detectWorkMode(title, description, locationRaw),
    employmentType: raw.employmentType || detectEmploymentType(title, description),
    // Whether the title reads as a career position rather than casual work.
    careerRole: SENIOR_TITLE.test(title) ? 1 : 0,
    profiles,
    groups,
    score,
    seenAt,
  }
}

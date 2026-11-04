// Remote matches: role fit from a profile, plus the
// advert's own wording compared with the immigration conditions that person
// recorded. Nothing here decides eligibility. A fact the advert or the profile
// does not supply stays "needs verification", and remote or part-time work is
// never treated as permission-compatible on its own.
//
// A personal profile lives in private/profile.json, which git and Docker ignore.
// Only the local server reads it (loadProfile). The hosted build uses
// PUBLIC_PROFILE below, which holds general role groups and the standard
// Stamp 2 conditions, and never reads the private file.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIrishLocation } from './regions.js'
import { scheduleEvidence } from './job-evidence.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PROFILE_FILE = process.env.ONELESS_PROFILE || join(ROOT, 'private', 'profile.json')

// Official guidance, read on the date below. Re-check these pages if the rules
// change; the wording quoted here is what the checks compare adverts against.
export const GUIDANCE = {
  checked: '2026-11-04',
  sources: [
    { label: 'ISD: Immigration permission / stamps', href: 'https://www.irishimmigration.ie/registering-your-immigration-permission/information-on-registering/immigration-permission-stamps/' },
    { label: 'ISD: Frequently asked questions for students', href: 'https://www.irishimmigration.ie/coming-to-study-in-ireland/frequently-asked-questions-for-students/' },
  ],
  holidayPeriods: 'June, July, August and September, and 15 December to 15 January',
  silentOn: 'ISD guidance does not say whether a student may work remotely for an employer based outside Ireland.',
}

const STAMPS = {
  '2': {
    label: 'Stamp 2',
    work: true,
    termHours: 20,
    holidayHours: 40,
    employment: 'Stamp 2 allows casual employment only and no other business or trade.',
    hours: 'Stamp 2 allows up to 20 hours a week in term and 40 a week only in the holiday periods.',
  },
  '2A': { label: 'Stamp 2A', work: false, employment: 'Stamp 2A: you must not work or engage in any business, trade or profession.' },
  '1G': {
    label: 'Stamp 1G',
    work: true,
    fullTime: true,
    employment: 'Stamp 1G allows full-time employment but not operating a business or self-employment.',
    hours: 'Stamp 1G allows full-time work in line with employment law.',
  },
}

export function normaliseStamp(value) {
  const s = String(value || '').toUpperCase().replace(/\bSTAMP\b|\s+/g, '')
  return s || null
}

export function loadProfile(file = PROFILE_FILE) {
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (err) { return { error: `private profile is not valid JSON: ${err.message}` } }
}

// Text helpers

const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termRe = (term) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'iu')

// The sentence around a match, short enough to show as a quote.
function sentence(text, re) {
  const m = re.exec(text)
  if (!m) return null
  const start = Math.max(text.lastIndexOf('. ', m.index) + 1, m.index - 160, 0)
  const stops = ['. ', '; ', ' • '].map((s) => text.indexOf(s, m.index + m[0].length)).filter((i) => i >= 0)
  const end = Math.min(stops.length ? Math.min(...stops) + 1 : text.length, m.index + m[0].length + 160)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

const textOf = (job) => clean(job.full_description || job.description || '')

// Ireland as a place you can work from

const BROAD = /^(?:worldwide|anywhere|global(?:ly)?|europe|european union|eu|eea|emea|remote|work from home|fully remote|latam|latin america|apac|americas|north america)$/i
const BROAD_INCLUDING_IRELAND = /^(?:worldwide|anywhere|global(?:ly)?|europe|european union|eu|eea|emea)$/i
const RESTRICTION = /\b(?:must|should|need to|needs to|required to|have to|has to)\s+(?:be\s+)?(?:currently\s+|permanently\s+)?(?:based|reside|resident|located|living|live)\s+(?:in|within)\s+([^.;\n]{2,60})/gi
// Case-sensitive on purpose, so "join us only" is not read as the United States.
const OTHER_ONLY = /\b(?:US|USA|UK|United States|United Kingdom|Great Britain|Canada|Australia|India|Germany|Spain|Poland|Portugal|Netherlands|France|Italy|Philippines)[- ](?:[Oo]nly|[Bb]ased only)\b|\b(?:[Rr]emote|REMOTE|[Ww]ork from home)\s*[(:-]?\s*(?:US|USA|UK|United States|United Kingdom|Canada|Australia|India|LATAM|Latin America|APAC|North America)\s*(?:[Oo]nly)?\)?(?=[\s,.;)]|$)/
const NOT_IRELAND = /\b(?:excluding|except|not (?:available|open|hiring) (?:in|to candidates in))\s+(?:the\s+)?(?:republic of\s+)?ireland\b/i
const IRELAND_REMOTE_TEXT = /\b(?:remote(?:ly)?|work(?:ing)? from home|wfh|home[- ]based)\b[^.]{0,60}\b(?:in|from|across|within|anywhere in|throughout)\s+(?:the\s+)?(?:republic of\s+)?ireland\b|\bireland\b\s*[(-]?\s*(?:fully\s+)?remote\b/i
const IRELAND_WORDS = /\b(?:ireland|irish|dublin|cork|galway|limerick|waterford)\b/i
const REGION_WORDS = /\b(?:europe|eu|eea|emea|anywhere|worldwide)\b/i

const withoutNorthernIreland = (s) => String(s || '').replace(/\bnorthern ireland\b/gi, 'Northern UK')

export function irelandEvidence(job) {
  const location = clean(job.location_raw)
  const title = clean(job.title)
  const text = withoutNorthernIreland(`${title}. ${textOf(job)}`)

  // Wording that limits the role to somewhere else wins over any location label.
  if (NOT_IRELAND.test(text)) return { status: 'excluded', evidence: sentence(text, NOT_IRELAND), note: 'The advert excludes Ireland.' }
  for (const m of text.matchAll(RESTRICTION)) {
    const where = m[1]
    if (IRELAND_WORDS.test(where)) return { status: 'stated', evidence: sentence(text, new RegExp(escapeRe(m[0]))), note: 'The advert says where you must be based, including Ireland.' }
    if (!REGION_WORDS.test(where)) return { status: 'excluded', evidence: sentence(text, new RegExp(escapeRe(m[0]))), note: 'The advert requires you to be based in another country.' }
  }
  if (OTHER_ONLY.test(`${location}. ${text}`)) return { status: 'excluded', evidence: sentence(`${location}. ${text}`, OTHER_ONLY), note: 'The advert limits remote work to another country.' }

  if (IRELAND_REMOTE_TEXT.test(text)) return { status: 'stated', evidence: sentence(text, IRELAND_REMOTE_TEXT), note: 'The advert says the remote work can be done from Ireland.' }

  const parts = withoutNorthernIreland(location).split(/\s*(?:[,;/|]|\s-\s|\bor\b|\band\b)\s*/i)
    .map((p) => p.replace(/\b(?:fully remote|remote|work from home|hybrid|on-?site)\b/gi, '').replace(/[()]/g, '').trim())
  const named = parts.filter(Boolean)
  if (named.some((p) => /\bireland\b/i.test(p) || isIrishLocation(p, { includeNorthernIreland: false, includeNationwide: true }))) {
    return { status: 'stated', evidence: `Advert location: ${location}`, note: 'The advert location is in Ireland.' }
  }
  const broad = named.filter((p) => BROAD_INCLUDING_IRELAND.test(p))
  const others = named.filter((p) => !BROAD.test(p) && !/^no location restriction$/i.test(p))
  // "Europe, Netherlands" reads as the Netherlands; "Europe, UK, US" as a wide list.
  if (broad.length && others.length !== 1) return { status: 'region', evidence: `Advert location: ${location}`, note: 'Ireland is not named. A Europe-wide or worldwide label does not show the employer can employ someone living in Ireland.' }
  if (others.length) return { status: 'excluded', evidence: `Advert location: ${location}`, note: 'The advert location names only other countries.' }
  return { status: 'unknown', evidence: location ? `Advert location: ${location}` : null, note: 'The advert does not say where the remote work can be done from.' }
}

// Role fit

export function roleMatch(job, profile) {
  const title = clean(job.title)
  const text = textOf(job)
  if ((profile.excludeTitleTerms || []).some((t) => termRe(t).test(title))) return null
  const families = []
  for (const role of profile.roles || []) {
    const inTitle = (role.titleTerms || []).filter((t) => termRe(t).test(title))
    if (inTitle.length) families.push({ id: role.id, name: role.name, terms: inTitle })
  }
  if (!families.length) return null
  const skills = (profile.skills || []).filter((t) => termRe(t).test(`${title} ${text}`))
  const senior = (profile.seniorTitleTerms || []).find((t) => termRe(t).test(title))
  return {
    families,
    skills,
    senior: senior || null,
    score: families.reduce((n, f) => n + 5 * f.terms.length, 0) + Math.min(skills.length, 8),
  }
}

// Advert evidence compared with the recorded permission

const SELF_EMPLOYED = /\b(?:freelanc\w*|self[\s-]?employ\w*|independent contractor|(?:as an?|on an?) (?:independent\s+)?contractor|contractor (?:role|position|basis|agreement)|b2b (?:contract|basis)|day rate|daily rate|invoice (?:us|monthly|the company)|commission[- ]only|1099|(?:own|your) (?:limited|ltd) company|umbrella company)\b/i
const EMPLOYEE = /\b(?:permanent(?: (?:role|position|contract|part[\s-]?time|full[\s-]?time))?|as an employee|(?:full|part)[\s-]?time employee|employee (?:benefits|assistance|share|stock|discount|wellbeing)|paye|on (?:our|the) payroll|employment contract|contract of employment|fixed[- ]term (?:employment )?contract)\b/i
const RTW_ANY = /\b(?:right to work|eligib\w* to work|work(?:ing)? (?:authori[sz]ation|permit|visa)|visa sponsorship|sponsor(?:ship)?|stamp\s*[0-9]\w*|citizens?(?:hip)?|eu passport|eea nationals?|without (?:any )?(?:restriction|sponsorship)|unrestricted|full working rights|legally (?:able|authori[sz]ed|entitled) to work)\b/i
const RTW_OTHER_COUNTRY = /\b(?:right to work|authori[sz]ed to work|eligib\w* to work|work authori[sz]ation)\s+in\s+(?:the\s+)?(?:US|USA|United States|UK|United Kingdom|Canada|Australia)\b|\b(?:US|UK) (?:citizens?|work authori[sz]ation)\b/i
const RTW_STAMP4_OR_CITIZEN = /\bstamp\s*4\b|\b(?:EU|EEA|EU\/EEA|Irish) (?:citizens?|nationals?|passport holders?) only\b|\bmust (?:be|hold) (?:an? )?(?:EU|EEA|Irish) (?:citizen|passport|national)/i
const RTW_UNRESTRICTED = /\b(?:unrestricted|full (?:working )?rights|without (?:any )?(?:work )?restrictions?|no (?:visa|work) restrictions?|full[- ]time (?:right|permission) to work)\b/i
const RTW_SPONSOR_NO = /\b(?:no|not|unable to|cannot|can't|do not|does not|will not) (?:offer |provide )?(?:visa )?sponsor/i
const IRISH_PAYROLL = /\b(?:paye|irish payroll|payroll in ireland|irish (?:entity|subsidiary|company)|employed in ireland|our (?:dublin|cork|galway|limerick|irish) (?:office|team|entity))\b/i
const EOR = /\b(?:employer of record|eor|deel|remote\.com|oyster hr|papaya global)\b/i

function check(key, name, status, evidence, rule) {
  return { key, name, status, evidence: evidence || null, rule }
}

function permissionCheck(profile, now) {
  const p = profile.permission || {}
  const stamp = normaliseStamp(p.stamp)
  const rules = STAMPS[stamp]
  if (p.standard) return check('permission', 'Your permission', 'needs_verification', `Standard ${rules?.label || `Stamp ${stamp}`} conditions`, 'Compared with the standard conditions only. Your own permission may differ: check your IRP card and permission letter.')
  if (!stamp) return check('permission', 'Your permission', 'needs_verification', null, 'Your stamp is not recorded. Add your stamp, IRP card expiry and any extra conditions to private/profile.json.')
  if (!rules) return check('permission', 'Your permission', 'needs_verification', `Recorded: Stamp ${stamp}`, `OneLess has no built-in rules for Stamp ${stamp}. Compare each advert with your permission conditions yourself.`)
  if (!rules.work) return check('permission', 'Your permission', 'conflict', `Recorded: ${rules.label}`, rules.employment)
  if (p.expires && Date.parse(p.expires) < now) return check('permission', 'Your permission', 'conflict', `Recorded expiry: ${p.expires}`, 'Your recorded permission has expired. Renew or update it before relying on these checks.')
  const extra = (p.additionalConditions || []).filter(Boolean)
  if (extra.length) return check('permission', 'Your permission', 'needs_verification', `Extra conditions recorded: ${extra.join('; ')}`, 'Your permission carries extra conditions. Compare them with this advert yourself.')
  if (!p.expires) return check('permission', 'Your permission', 'needs_verification', `Recorded: ${rules.label}`, 'Your IRP card expiry is not recorded. Add it as "expires": "YYYY-MM-DD".')
  if (p.confirmedByMe !== true) return check('permission', 'Your permission', 'needs_verification', `Recorded: ${rules.label}${p.expires ? `, expires ${p.expires}` : ''}`, 'Set "confirmedByMe": true once you have checked these details against your IRP card and permission letter.')
  return check('permission', 'Your permission', 'ok', `Recorded: ${rules.label}${p.expires ? `, expires ${p.expires}` : ''}`, 'Details confirmed by you. No extra conditions recorded.')
}

function locationCheck(ireland) {
  const rule = 'The employer must allow you to do the work while living in Ireland.'
  if (ireland.status === 'stated') return check('location', 'Working from Ireland', 'ok', ireland.evidence, `${ireland.note} ${rule}`)
  if (ireland.status === 'excluded') return check('location', 'Working from Ireland', 'conflict', ireland.evidence, `${ireland.note} ${rule}`)
  return check('location', 'Working from Ireland', 'needs_verification', ireland.evidence, `${ireland.note} ${rule}`)
}

function employmentCheck(job, text, rules) {
  const self = sentence(text, SELF_EMPLOYED)
  const employee = sentence(text, EMPLOYEE)
  const rule = rules?.employment || 'Confirm the role is employment allowed by your permission.'
  if (self) return check('employment', 'Employee, not self-employed', rules ? 'conflict' : 'needs_verification', self, rule)
  const unpaid = sentence(text, /\b(?:unpaid|no salary|without pay|voluntary|volunteer)\b/i)
  if (unpaid) return check('employment', 'Employee, not self-employed', 'needs_verification', unpaid, `Unpaid or voluntary work is not clearly employment. ${rule}`)
  if (job.employment_type === 'contract') return check('employment', 'Employee, not self-employed', 'needs_verification', `Listed as a contract role${employee ? `: ${employee}` : ''}`, `${rule} Confirm you would be an employee on payroll, not a contractor.`)
  if (employee && rules) return check('employment', 'Employee, not self-employed', 'ok', employee, rule)
  return check('employment', 'Employee, not self-employed', 'needs_verification', employee, `The advert does not clearly say you would be an employee. ${rule}`)
}

function hoursCheck(job, text, rules) {
  const ev = scheduleEvidence(job.title, text, job.source_metadata || '')
  const max = ev.hoursMax ?? job.hours_max ?? null
  const fullTime = job.employment_type === 'full_time' || /\bfull[\s-]?time\b/i.test(clean(job.title))
  const quoted = ev.hoursEvidence[0]?.text
  const shown = quoted ? `Advert states ${quoted}` : fullTime ? 'Advert says full-time' : job.employment_type === 'part_time' ? 'Advert says part-time, no weekly hours' : null
  if (!rules) return check('hours', 'Weekly hours', 'needs_verification', shown, 'Compare the hours with your own permission conditions.')
  if (rules.fullTime) return check('hours', 'Weekly hours', shown ? 'ok' : 'needs_verification', shown, rules.hours)
  const conflicts = ev.conflicts.length ? ` The advert's hours details disagree: ${ev.conflicts.join(' ')}` : ''
  if (fullTime || (max != null && max > rules.termHours)) {
    return check('hours', 'Weekly hours', 'conflict', shown, `${rules.hours} Holidays: ${GUIDANCE.holidayPeriods}.${conflicts}`)
  }
  if (max != null && max <= rules.termHours) return check('hours', 'Weekly hours', conflicts ? 'needs_verification' : 'ok', shown, `${rules.hours}${conflicts}`)
  if (job.employment_type === 'full_or_part_time') return check('hours', 'Weekly hours', 'needs_verification', 'Advert offers full-time or part-time contracts', `${rules.hours} Confirm a contract of ${rules.termHours} hours or fewer in term.`)
  return check('hours', 'Weekly hours', 'needs_verification', shown, `${rules.hours} The advert does not state weekly hours.`)
}

function rightToWorkCheck(text, stamp, rules) {
  const any = sentence(text, RTW_ANY)
  const other = sentence(text, RTW_OTHER_COUNTRY)
  const name = 'Right-to-work wording'
  if (other) return check('rtw', name, 'conflict', other, 'The advert asks for the right to work in another country.')
  const strict = sentence(text, RTW_STAMP4_OR_CITIZEN)
  if (strict) return check('rtw', name, rules ? 'conflict' : 'needs_verification', strict, `The advert asks for a permission ${rules ? `that ${rules.label} is not` : 'you need to compare with your own'}.`)
  const unrestricted = sentence(text, RTW_UNRESTRICTED)
  if (unrestricted) return check('rtw', name, stamp === '2' ? 'conflict' : 'needs_verification', unrestricted, stamp === '2' ? 'The advert asks for unrestricted working rights; Stamp 2 work is limited in hours and type.' : 'The advert asks for unrestricted working rights. Confirm your permission meets this.')
  const welcome = stamp && sentence(text, new RegExp(`\\bstamp\\s*${escapeRe(stamp)}\\b[^.]{0,50}\\b(?:welcome|accepted|considered|eligible)`, 'i'))
  if (welcome) return check('rtw', name, 'ok', welcome, `The advert says ${rules?.label || `Stamp ${stamp}`} holders are accepted.`)
  const noSponsor = sentence(text, RTW_SPONSOR_NO)
  if (noSponsor) return check('rtw', name, 'needs_verification', noSponsor, 'The employer does not sponsor permits. Confirm it accepts your current permission.')
  if (any) return check('rtw', name, 'needs_verification', any, 'Confirm the employer accepts your permission and its conditions.')
  return check('rtw', name, 'needs_verification', null, 'The advert says nothing about right to work. Confirm with the employer.')
}

function payrollCheck(text) {
  const name = 'Employer and payroll in Ireland'
  const irish = sentence(text, IRISH_PAYROLL)
  if (irish) return check('payroll', name, 'ok', irish, 'The advert indicates employment in Ireland. Confirm you would be on an Irish payroll.')
  const eor = sentence(text, EOR)
  if (eor) return check('payroll', name, 'needs_verification', eor, 'Hiring goes through an employer-of-record service. Confirm it would employ you in Ireland, as an employee.')
  return check('payroll', name, 'needs_verification', null, `${GUIDANCE.silentOn} Confirm the employer would employ you in Ireland, on an Irish payroll.`)
}

// For the Remote part time tab, which filters in SQL: 1 when the advert names
// Ireland or a Europe-wide / worldwide area and is not self-employed work.
export function remoteFromIreland(title, location, text) {
  const job = { title, location_raw: location, full_description: text }
  if (!['stated', 'region'].includes(irelandEvidence(job).status)) return 0
  if (/\b(?:contractor|freelanc\w*|self[\s-]?employ\w*)\b/i.test(title)) return 0
  return SELF_EMPLOYED.test(clean(`${title}. ${text || ''}`)) ? 0 : 1
}

export const LABELS = {
  conflict: 'Conflicts with your recorded conditions',
  needs_verification: 'Needs verification',
  no_conflict_found: 'No conflict found in advert',
}

// Returns null for jobs outside the profile's roles. Everything else gets a
// label and every check that led to it, with the advert sentence it relied on.
export function assessRemoteFit(job, profile, { now = Date.now() } = {}) {
  if (!profile || profile.error) return null
  if (job.work_mode === 'hybrid') return null
  const roles = roleMatch(job, profile)
  if (!roles) return null
  const text = clean(`${job.title}. ${textOf(job)}`)
  const ireland = irelandEvidence(job)
  const stamp = normaliseStamp(profile.permission?.stamp)
  const rules = STAMPS[stamp]?.work ? STAMPS[stamp] : null
  const checks = [
    permissionCheck(profile, now),
    locationCheck(ireland),
    employmentCheck(job, text, rules),
    hoursCheck(job, text, rules),
    rightToWorkCheck(text, stamp, rules),
    payrollCheck(text),
  ]
  const label = checks.some((c) => c.status === 'conflict') ? 'conflict'
    : checks.every((c) => c.status === 'ok') ? 'no_conflict_found' : 'needs_verification'
  // Visa fit: how far the advert's own wording supports the permission
  // conditions. Conflicts sink, then more supported checks rise.
  // Hours and employee status matter most for Stamp 2, so they weigh most.
  const WEIGHT = { hours: 30, employment: 15, location: 15, rtw: 10, payroll: 10, permission: 5 }
  const ok = checks.reduce((n, c) => n + (c.status === 'ok' ? WEIGHT[c.key] : 0), 0)
  // Unknown hours: a stated part-time contract is a good sign, anything else is not.
  const hoursUnknown = checks.find((c) => c.key === 'hours').status === 'needs_verification'
  const partTimeNoHours = !hoursUnknown ? 0 : ({ part_time: 15, full_or_part_time: 5 }[job.employment_type] ?? -10)
  const conflicts = checks.filter((c) => c.status === 'conflict').length
  const visaScore = (label === 'conflict' ? 0 : label === 'needs_verification' ? 100 : 200) + ok + partTimeNoHours - conflicts * 5
  return { label, labelText: LABELS[label], ireland: ireland.status, roles, checks, visaScore }
}

export const IRELAND_SCOPES = { ireland: ['stated'], region: ['stated', 'region'], all: ['stated', 'region', 'unknown'] }

// Filters and orders assessed jobs. Adverts tied to another country are counted
// and left out: "remote" there does not mean remote from Ireland.
export const FIT_SORTS = {
  visa: (a, b) => b.fit.visaScore - a.fit.visaScore || b.fit.roles.score - a.fit.roles.score || newest(a, b),
  role: (a, b) => b.fit.roles.score - a.fit.roles.score || b.fit.visaScore - a.fit.visaScore || newest(a, b),
  newest: (a, b) => newest(a, b),
}
function newest(a, b) {
  const when = (r) => String((r.job || r).posted_at || (r.job || r).first_seen || '')
  return when(b).localeCompare(when(a))
}

export function remoteFitList(jobs, profile, { scope = 'region', label = '', savedOnly = false, q = '', sort = 'visa', now = Date.now() } = {}) {
  const allowed = IRELAND_SCOPES[scope] || IRELAND_SCOPES.region
  const counts = { matched: 0, otherCountry: 0, outOfScope: 0, byLabel: { no_conflict_found: 0, needs_verification: 0, conflict: 0 } }
  const rows = []
  const needle = q.trim().toLowerCase()
  for (const job of jobs) {
    const fit = assessRemoteFit(job, profile, { now })
    if (!fit) continue
    counts.matched++
    if (fit.ireland === 'excluded') { counts.otherCountry++; continue }
    if (!allowed.includes(fit.ireland)) { counts.outOfScope++; continue }
    if (savedOnly && !job.is_saved) continue
    if (needle && !`${job.title} ${job.company} ${job.location_raw}`.toLowerCase().includes(needle)) continue
    counts.byLabel[fit.label]++
    if (label && fit.label !== label) continue
    rows.push({ job, fit })
  }
  rows.sort(FIT_SORTS[sort] || FIT_SORTS.visa)
  return { rows, counts }
}

// The hosted page's profile: general role groups and the standard Stamp 2
// student conditions. Nothing personal. The permission check always asks
// readers to compare with their own permission, so nothing public is ever
// labelled "No conflict found".
export const PUBLIC_PROFILE = {
  public: true,
  roles: [
    { id: 'analytics', name: 'Business analytics and data', titleTerms: ["data analyst", "data analytics", "analytics", "business analyst", "business analytics", "BI analyst", "business intelligence", "Power BI", "Tableau", "reporting analyst", "insights analyst", "product analyst", "operations analyst", "marketing analyst", "research analyst", "statistician", "statistics", "data science", "data scientist", "data engineer", "data quality", "data entry", "database", "SQL", "research assistant"] },
    { id: 'ai', name: 'AI roles', titleTerms: ["AI", "artificial intelligence", "machine learning", "ML", "LLM", "GenAI", "generative AI", "prompt", "AI trainer", "AI tutor", "annotation", "annotator", "data labelling", "data labeling", "model evaluation", "evaluator", "NLP", "deep learning"] },
    { id: 'intern', name: 'Internships and graduate roles', titleTerms: ["intern", "internship", "placement", "graduate programme", "graduate program", "graduate analyst", "trainee", "summer analyst", "junior analyst"] },
    { id: 'projects', name: 'Project coordination', titleTerms: ["project coordinator", "project co-ordinator", "project administrator", "project assistant", "project support", "PMO", "project analyst", "project controls"] },
    { id: 'finance', name: 'Finance and accounts', titleTerms: ["bookkeeper", "bookkeeping", "accounts assistant", "accounts payable", "accounts receivable", "purchase ledger", "credit control", "accounting assistant", "accounting technician", "accounts technician", "finance assistant", "finance officer", "junior accountant", "assistant accountant", "accountant", "reconciliation", "payroll assistant", "financial analyst", "finance analyst", "FP&A", "management accountant", "financial reporting", "VAT", "tax assistant", "finance operations", "commercial analyst", "Xero", "QuickBooks", "ERP", "finance systems", "accounting software"] },
  ],
  skills: ["SQL", "Python", "Power BI", "Tableau", "Excel", "statistics", "statistical", "regression", "machine learning", "database", "databases", "analytics", "dashboard", "dashboards", "data visualisation", "data visualization", "project management", "AI", "LLM", "prompt", "Xero", "QuickBooks", "VAT", "reconciliation", "IFRS", "forecasting"],
  seniorTitleTerms: ['senior', 'lead', 'manager'],
  excludeTitleTerms: ["head of", "director", "vice president", "VP", "chief", "principal", "partner", "account executive", "sales"],
  permission: { stamp: '2', standard: true },
}

// The same selection as remoteCandidates() in db.js, for rows already loaded:
// remote, not hybrid, still open, and advertised as part-time.
export function isRemoteCandidate(job, today = new Date().toISOString().slice(0, 10)) {
  if (job.work_mode === 'hybrid' || job.verification_status === 'closed') return false
  if (!['part_time', 'full_or_part_time'].includes(job.employment_type)) return false
  if (job.closing_at && job.closing_at.slice(0, 10) < today) return false
  const text = `${job.title} ${job.location_raw || ''}`.toLowerCase()
  return job.work_mode === 'remote' || job.region_key === 'remote' || text.includes('remote') || text.includes('work from home')
}

// What a list row carries. The shortlist flag is personal, so it is optional.
export function fitRow({ job, fit }, { includeSaved = false } = {}) {
  const row = {
    id: job.id, title: job.title, company: job.company, location_raw: job.location_raw, url: job.url,
    application_url: job.application_url, posted_at: job.posted_at, first_seen: job.first_seen,
    employment_type: job.employment_type, work_mode: job.work_mode, salary_text: job.salary_text,
    verification_status: job.verification_status, available_sources: job.available_sources || job.source, fit,
  }
  if (includeSaved) row.is_saved = job.is_saved
  return row
}

// What the page may show about the profile: names and status, nothing more.
export function profileSummary(profile) {
  if (!profile) return { configured: false }
  if (profile.error) return { configured: false, error: profile.error }
  const p = profile.permission || {}
  const stamp = normaliseStamp(p.stamp)
  return {
    configured: true,
    roleFamilies: (profile.roles || []).map((r) => r.name),
    programme: profile.studies?.programme || null,
    programmeConfirmed: profile.studies?.programmeConfirmed === true,
    permission: {
      stamp: stamp ? (STAMPS[stamp]?.label || `Stamp ${stamp}`) : null,
      expires: p.expires || null,
      confirmed: p.confirmedByMe === true,
      extraConditions: (p.additionalConditions || []).filter(Boolean).length,
      knownRules: Boolean(STAMPS[stamp]),
    },
  }
}

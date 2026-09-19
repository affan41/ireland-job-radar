const PART_TIME_RE = /\bpart[\s-]*time\b/i
const FULL_TIME_RE = /\bfull[\s-]*time\b|\bfull\s*(?:&|and|or|\/)\s*part[\s-]*time\b/i
const TEMPORARY_RE = /\b(temporary|seasonal|fixed[\s-]?term|summer job|christmas staff)\b/i
const CONTRACT_RE = /\b(contract(?:or)?|freelance|self[\s-]?employed)\b/i

const normalise = (value) => String(value || '').replace(/[\u2010-\u2015\u2212]/g, '-')

function signals(text, heading = false) {
  // Benefits about study or a willingness to discuss a different contract are
  // not evidence that this vacancy itself offers part-time employment.
  const employmentText = heading ? text : text
    .replace(/\bpart[\s-]*time\s+(?:training|study|studies|education|courses?|qualifications?)\b/gi, '')
    .replace(/\b(?:open to|happy to|willing to)\s+(?:discussing|discuss|considering|consider)\s+part[\s-]*time\b/gi, '')
  // Weekly hours are evidence; weekend/evening shifts and temporary contracts
  // say nothing about how many hours the vacancy requires.
  const hours = [...text.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d+)?)\s*)?(?:hours?|hrs?)(?:\s*(?:(?:per|a|each|\/)\s*(?:week|wk)|p\s*\/\s*w|weekly))?\b/gi)]
    .filter((m) => heading || /week|\bwk\b|p\s*\/\s*w/i.test(m[0]))
    .map((m) => Math.max(Number(m[1]), Number(m[2] || m[1])))
  return {
    part: PART_TIME_RE.test(employmentText) || hours.some((h) => h > 0 && h < 30),
    full: FULL_TIME_RE.test(text) || hours.some((h) => h >= 30),
    fullHours: hours.some((h) => h >= 30),
  }
}

export function isPartTime(...fields) {
  return detectEmploymentType('', fields.filter(Boolean).join(' ')) === 'part_time'
}

export function detectEmploymentType(title, description = '', statedType) {
  const heading = normalise(title)
  const body = normalise(description)
  const hay = `${heading} ${body}`
  const titleSignals = signals(heading, true)
  const bodySignals = signals(body)
  if (statedType === 'full_time' || titleSignals.full || bodySignals.fullHours) return 'full_time'
  // The title is the strongest signal. Some broad descriptions say the employer
  // has both part-time and full-time contracts even when this specific vacancy is
  // explicitly a 35-hour/full-time role.
  if (titleSignals.part) return 'part_time'
  // In an untitled/mixed advert, do not let a generic part-time mention hide
  // explicit full-time work. Conservatively exclude it from the part-time tab.
  if (bodySignals.full) return 'full_time'
  if (statedType === 'part_time' || bodySignals.part) return 'part_time'
  if (statedType && statedType !== 'unspecified') return statedType
  if (TEMPORARY_RE.test(hay)) return 'temporary'
  if (CONTRACT_RE.test(hay)) return 'contract'
  return 'unspecified'
}

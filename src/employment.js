const PART_TIME_RE = /\b(part[\s-]?time|weekend (?:job|work|role|shift|staff)|evening (?:job|work|role|shift)|casual (?:job|work|role|position|staff)|student (?:job|work|role)|zero[\s-]?hours?)\b|\b(?:[1-9]|1\d|2[0-4])\s*(?:-|to)\s*(?:[1-9]|1\d|2[0-4])?\s*hours?\s*(?:per|a)\s*week\b/i
const FULL_TIME_RE = /\b(full[\s-]?time|permanent full[\s-]?time|(?:3\d|4\d)(?:\s*(?:-|to)\s*(?:3\d|4\d))?\s*hours?(?:\s*(?:per|a)\s*week)?)\b/i
const TEMPORARY_RE = /\b(temporary|seasonal|fixed[\s-]?term|summer job|christmas staff)\b/i
const CONTRACT_RE = /\b(contract(?:or)?|freelance|self[\s-]?employed)\b/i

export function isPartTime(...fields) {
  return PART_TIME_RE.test(fields.filter(Boolean).join(' '))
}

export function detectEmploymentType(title, description = '') {
  const heading = String(title || '')
  const hay = `${heading} ${description || ''}`
  // The title is the strongest signal. Some broad descriptions say the employer
  // has both part-time and full-time contracts even when this specific vacancy is
  // explicitly a 35-hour/full-time role.
  if (isPartTime(heading)) return 'part_time'
  if (FULL_TIME_RE.test(heading)) return 'full_time'
  if (isPartTime(hay)) return 'part_time'
  if (FULL_TIME_RE.test(hay)) return 'full_time'
  if (TEMPORARY_RE.test(hay)) return 'temporary'
  if (CONTRACT_RE.test(hay)) return 'contract'
  return 'unspecified'
}

import { isIrishLocation } from './regions.js'

// Eligibility comes from the advertised hiring location, never a search query,
// headquarters address in the description, or a missing location restriction.
export function irelandRemoteLocation(location = '') {
  const text = String(location)
  if (/\b(?:excluding|except|not available in|not hiring in)\s+(?:the\s+)?(?:republic of\s+)?ireland\b/i.test(text)) return false
  if (/\b(?:US|USA|UK|United States|United Kingdom|Great Britain)[- ]only\b/i.test(text)) return false
  const geography = text.replace(/\bnorthern ireland\b/gi, 'Northern UK')
    .replace(/\b(?:fully remote|remote|work from home|worldwide)\b/gi, '')
  if (isIrishLocation(geography, { includeNorthernIreland: false, includeNationwide: true })) return true
  // Only unqualified region-wide labels establish broad eligibility. "Europe:
  // Germany only" and "EMEA (UK)" are not Europe-wide hiring.
  return /^(?:(?:fully )?remote\s*[-,:/]?\s*)?(?:worldwide|anywhere|global|europe|european union|eu|eea|emea)(?:\s*[-,:/]?\s*(?:remote|only))?$/i.test(text.trim())
}

const STUDENT_ROLE = /\b(?:customer (?:service|support)|support (?:agent|advisor|assistant|representative)|call cent(?:re|er)|contact cent(?:re|er)|chat (?:support|agent)|email support|virtual assistant|admin(?:istrative)? assistant|administrator|data entry|tutor|transcri(?:ber|ption)|moderator|social media assistant|research assistant|student|intern|appointment setter|receptionist|bookkeeper|accounts assistant)\b/i
const GIG = /\b(?:freelanc(?:e|er|ing)|self[\s-]?employ(?:ed|ment)|independent contractor|contractor role|employment type:\s*contractor|paid surveys?|survey panel|market research panel|commission[- ]only|unpaid)\b/i

export function assessRemoteStudent({ title, description = '', locationRaw, workMode, employmentType, statedEmploymentType, careerRole = 0 }) {
  if (workMode !== 'remote' || employmentType !== 'part_time' || careerRole || !irelandRemoteLocation(locationRaw)) return null
  if (['contract', 'freelance'].includes(statedEmploymentType)) return null
  const text = `${title} ${description}`.replace(/[\u2010-\u2015\u2212]/g, '-')
  if (/\b(?:must|only)\s+(?:be\s+)?(?:based|reside|located|live)\s+in\s+(?:the\s+)?(?:US|USA|UK|United States|United Kingdom|Canada|Australia|Germany)\b/i.test(text)) return null
  if (!STUDENT_ROLE.test(title) || GIG.test(text) || /\bhybrid\b|\b(?:office|onsite|on-site)\s+(?:attendance|based|required)\b/i.test(text)) return null
  const hours = [...text.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d+)?)\s*)?(?:hours?|hrs?)\s*(?:(?:per|a|each|\/)\s*(?:week|wk)|p\s*\/\s*w|weekly)\b/gi)]
    .map(m => Math.max(Number(m[1]), Number(m[2] || m[1])))
  // Also accept hours in a job title, where "16 hours" is a schedule.
  for (const m of title.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d+)?)\s*)?(?:hours?|hrs?)\b/gi)) hours.push(Math.max(Number(m[1]), Number(m[2] || m[1])))
  if (hours.some(h => h > 20)) return null
  const schedule = hours.length ? `Advertised up to ${Math.max(...hours)} hours/week.` : 'Weekly hours not stated: confirm 20 or fewer during term.'
  const experience = text.match(/\b(\d+)\+?\s*years?['’]?\s*(?:of\s+)?experience\b/i)
  return `${schedule} Confirm employee status, work permission and study timetable with the employer.${experience ? ` Advert asks for ${experience[1]}+ years of experience.` : ''}`
}

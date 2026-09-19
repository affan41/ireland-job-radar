import { getText } from './http.js'
import { clean } from '../normalise.js'

const OLD_QUARTER = 'https://theoldquartergroup.ie'
export function parseLocalVacancy(html, url) {
  const description = html.match(/<meta\b[^>]*property="og:description"[^>]*content="([^"]*)"/i)?.[1]
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean)
  const title = headings.at(-1)
  if (!title || !description || !/Employment type:/i.test(description)) return null
  const body = clean(description, Infinity)
  if (/vacancy (?:is|has) (?:now )?(?:closed|expired)/i.test(body)) return null
  const location = clean(html.match(/<p><strong>Location:\s*<\/strong>([\s\S]*?)<\/p>/i)?.[1])
  if (!/limerick/i.test(location || body)) return null
  return {
    title, company: /Fordes/i.test(body) ? 'Fordes Courtyard' : /Top House/i.test(body) ? 'The Top House' : 'The Old Quarter',
    locationRaw: location || 'Limerick, Ireland', description: body, url,
    source: 'employer', sourceDetail: 'The Old Quarter Group Careers', country: 'ie', postedAt: null,
  }
}

export async function fetchLocalSites({request = getText, onProgress} = {}) {
  const jobs = [], errors = []
  try {
    const html = await request(`${OLD_QUARTER}/apply-now/`)
    const links = [...new Set([...html.matchAll(/href="(https:\/\/theoldquartergroup\.ie\/apply-now\/[^"/]+\/)"/g)].map(m => m[1]))]
    if (!links.length) throw new Error('No vacancy links found on careers index')
    for (const url of links) {
      try { const job = parseLocalVacancy(await request(url), url); if (job) jobs.push(job) }
      catch (error) { errors.push(`Old Quarter vacancy: ${error.message}`) }
    }
    onProgress?.(`The Old Quarter Group: ${jobs.length} adverts checked`)
  } catch (error) { errors.push(`Old Quarter: ${error.message}`) }
  return {jobs, errors}
}

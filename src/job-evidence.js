// Advert facts are kept independently of the displayed employment-type label.
export function scheduleEvidence(title = '', description = '', metadata = '') {
  const normal = s => String(s || '').replace(/[\u2010-\u2015\u2212]/g, '-')
  const hours = []
  for (const [source, value] of [['title', title], ['metadata', metadata], ['description', description]]) {
    const text = normal(value)
    for (const m of text.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d+)?)\s*)?(?:hours?|hrs?)\s*(?:(?:per|a|each|\/)\s*(?:week|wk)|p\s*\/\s*w|weekly)?\b/gi)) {
      if (source === 'description' && !/week|\bwk\b|p\s*\/\s*w/i.test(m[0])) continue
      hours.push({source, min: Number(m[1]), max: Number(m[2] || m[1]), text: m[0]})
    }
  }
  const shifts = []
  const dayNames={mon:'Monday',tue:'Tuesday',tues:'Tuesday',wed:'Wednesday',thu:'Thursday',thur:'Thursday',thurs:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'}
  const text = normal(description).replace(/\b(mon|tues?|wed|thurs?|thu|fri|sat|sun)\b/gi,m=>dayNames[m.toLowerCase()]||m)
  for (const segment of text.split(/\n|[.!?](?:\s|$)/)) {
    if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekends?|evenings?|mornings?|night shifts?|rotat(?:ing|ional)|shift pattern|shift details|during the week)\b|\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*-/i.test(segment)) {
      if (!/benefits|GP|assistance programme|pension/i.test(segment)) shifts.push(segment.trim().slice(0,350))
    }
  }
  const conflicts = []
  const types = [['title',title],['metadata',metadata],['description',description]].map(([source,s])=>({source,part:/part[\s_-]*time/i.test(s),full:/full[\s_-]*time|whole[\s_-]*time/i.test(s)}))
  if (types.some(t=>t.part) && types.some(t=>t.full)) conflicts.push('Part-time and full-time statements disagree or offer multiple contracts.')
  if (hours.length && new Set(hours.map(h=>`${h.min}-${h.max}`)).size > 1) conflicts.push('Different weekly hours are stated; confirm the actual contract.')
  if (types.some(t=>t.part) && hours.some(h=>h.max>=30)) conflicts.push('Part-time label conflicts with a schedule of 30+ hours/week.')
  const patterns=[]
  const shiftText=shifts.join(' ')
  if (/weekend|saturday|sunday/i.test(shiftText)) patterns.push('weekends')
  if (/evening/i.test(shiftText)) patterns.push('evenings')
  if (/monday|tuesday|wednesday|thursday|friday|weekday|during the week/i.test(shiftText)) patterns.push('weekdays')
  if (/morning/i.test(shiftText)) patterns.push('mornings')
  if (/night/i.test(shiftText)) patterns.push('nights')
  if (/flexib|rotat|var(?:y|ied|ious)|shift pattern.*confirm/i.test(shiftText)) patterns.push('variable')
  return { hoursMin: hours.length ? Math.min(...hours.map(h=>h.min)) : null,
    hoursMax: hours.length ? Math.max(...hours.map(h=>h.max)) : null,
    hoursEvidence: hours, shifts: [...new Set(shifts)].slice(0,8), availability: patterns, conflicts }
}

export function schemeType(title = '', description = '') {
  const text=`${title} ${description}`
  if (/\bWPEP\b|work placement experience programme/i.test(text)) return 'wpep'
  if (/\bCE\s+(?:scheme|supervisor|programme)|community employment|\bCE Scheme\b/i.test(text)) return 'ce'
  return 'ordinary'
}

export function canonicalJobUrl(value) {
  try {
    const u = new URL(value)
    if (!['http:','https:'].includes(u.protocol)) return null
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^(?:ref|source|tracking|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k)
    u.searchParams.sort(); if(!/^#(?:id=|job|vacancy)/i.test(u.hash)) u.hash = ''
    return u.href.replace(/\/$/,'')
  } catch { return null }
}

export function employerJobKey(value) {
  try {
    const u=new URL(value)
    const id=u.searchParams.get('record') || u.searchParams.get('VacancyID') || u.pathname.match(/\/vacancies\/(\d+)\//i)?.[1]
      || (/sallyeurope/.test(u.hostname) ? u.pathname.match(/\/job\/[^/]+\/(\d+)/)?.[1] : null)
    return id ? `${u.hostname.toLowerCase()}:${id}` : null
  } catch {return null}
}

export function recoveredTitle(title, description = '') {
  if(/[\p{L}]/u.test(title))return null
  const explicit=description.match(/\bJob title\s*:\s*([^.;\n]{4,100})/i)?.[1]
  const recruited=description.match(/\bcurrently recruiting\s+(?:a\s*)?(?:part[\s-]*time[\s,]*)?(?:temporary[\s,]*)?([^.;\n]{4,100}?)\s+based\b/i)?.[1]
  const candidate=(explicit||recruited||'').trim()
  return candidate && /[\p{L}]/u.test(candidate) ? candidate : null
}

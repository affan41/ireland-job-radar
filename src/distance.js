import places from './places.json' with { type: 'json' }

// Troy Village residential site, OpenStreetMap way 375923751, checked 2026-09-19.
export const TROY_VILLAGE = { name: 'Troy Village', latitude: 52.66382, longitude: -8.57677 }
export function kilometresBetween(a, b) {
  const rad = x => x * Math.PI / 180
  const dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude)
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const contains = (text, name) => {
  const term = normalize(name)
  // Ennis Road is a street in Limerick, not a workplace in Ennis.
  const withoutRoads = text.replace(new RegExp(`\\b${term}\\s+(?:road|rd|street|st|avenue|ave|drive)\\b`, 'g'), '')
  return ` ${withoutRoads} `.includes(` ${term} `)
}
const validPoint = (lat, lon) => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)

export function estimateDistance(job) {
  if (job.work_mode === 'remote') return { kind: 'remote', label: 'Remote', detail: 'No regular commute stated', km: null }
  const unavailable = { kind: 'unknown', label: 'Distance unavailable', detail: 'A specific workplace location is needed', km: null }
  let point, kind, place
  if (validPoint(job.latitude, job.longitude)) {
    point = { latitude: job.latitude, longitude: job.longitude }
    kind = 'workplace'; place = job.location_raw || 'Advertised workplace'
  } else {
    if (job.country && job.country !== 'ie') return unavailable
    // County-only locations are too broad. Never use the description: it may
    // mention a head office, customers or branches unrelated to this vacancy.
    const location = normalize(job.location_raw).replace(/\b(?:county|co)\s+[a-z]+\b/g, '').trim()
    if (!location || /\b(?:nationwide|multiple locations|various locations)\b/.test(location)) return unavailable
    const text = `${location} ${normalize(job.title)}`
    const matches = places.filter(p => (!p.region || !job.region_key || p.region === job.region_key)
      && (p.aliases || [p.name]).some(name => contains(text, name)))
    if (!matches.length) return unavailable
    // A list of distant towns is not a single workplace. Nearby nested labels
    // such as Dooradoyle, Limerick are fine; choose the most specific one.
    if (matches.some(p => kilometresBetween(matches[0], p) > 15)) return { ...unavailable, detail: 'Multiple workplace areas are listed' }
    point = matches[0]; kind = 'area'; place = point.name
  }
  const actualKm = kilometresBetween(TROY_VILLAGE, point)
  const step = actualKm < 10 ? 0.5 : actualKm < 100 ? 1 : 5
  const km = Math.round(actualKm / step) * step
  const route = new URL('https://www.google.com/maps/dir/')
  route.searchParams.set('api', '1')
  route.searchParams.set('origin', `${TROY_VILLAGE.latitude},${TROY_VILLAGE.longitude}`)
  route.searchParams.set('destination', kind === 'workplace' ? `${point.latitude},${point.longitude}` : `${place}, Ireland`)
  return { kind, km, label: km < 0.5 ? '<0.5 km' : `~${km} km`, place,
    detail: kind === 'workplace' ? 'Straight line to advertised workplace' : `Straight line to ${place} area; exact workplace may differ`,
    routeUrl: route.href }
}

// The hosted site has no server. This is the query layer from src/db.js, run in
// the browser over the exported job list. Keep the two in step: buildWhere,
// queryJobs and facets there are the reference.

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

// Mirrors filtersFrom in server.js.
export function parseFilters(query) {
  const p = new URLSearchParams(query)
  return {
    view: p.get('view') || '',
    maxHours: Number(p.get('maxHours')) || 0,
    availability: p.get('availability') || '',
    status: p.get('status') || '',
    scheme: p.get('scheme') || 'ordinary',
    noConflicts: p.get('noConflicts') === '1',
    includeNearby: p.get('nearby') === '1',
    includeUnstated: p.get('unstated') === '1',
    sponsorship: list(p.get('sponsorship')),
    regions: list(p.get('regions')),
    groups: list(p.get('groups')),
    sources: list(p.get('sources')),
    workModes: list(p.get('modes')),
    employmentTypes: list(p.get('types')),
    q: p.get('q')?.trim() || '',
    salaryMin: Number(p.get('salaryMin')) || 0,
    days: Number(p.get('days')) || 0,
    minScore: Number(p.get('minScore')) || 0,
    savedOnly: p.get('saved') === '1',
    sort: p.get('sort') || 'newest',
    limit: Math.min(Number(p.get('limit')) || 60, 300),
    offset: Math.max(Number(p.get('offset')) || 0, 0),
  }
}

const UNAVAILABLE = { weekends: ['weekdays', 'variable'], evenings: ['mornings', 'nights', 'variable'], weekdays: ['weekends', 'variable'] }
const posted = (r) => r.posted_at || r.first_seen
const inIreland = (r) => r.country === 'ie' || (r.country == null && r.region_key === 'remote')
const unstatedHours = (r) => r.student_role === 1 && r.employment_type === 'unspecified'

// Each view's membership is worked out when the site is built, once for every
// combination of its two options, and stored as one bit each.
const viewBit = (f) => 1 << ((f.includeNearby ? 1 : 0) + (f.includeUnstated ? 2 : 0))
const inView = (r, key, f) => Boolean((r.views?.[key] || 0) & viewBit(f))
const dublinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' })

export function createStore({ jobs, views = [], saved = new Set(), hidden = new Set(), now = () => Date.now() }) {
  const viewByKey = Object.fromEntries(views.map((v) => [v.key, v]))
  const rows = jobs.map((r) => ({
    ...r,
    _groups: list(r.groups),
    _sources: list(r.available_sources),
    _availability: list(r.availability),
    _text: `${r.title || ''}\n${r.company || ''}\n${r.description || ''}`.toLowerCase(),
  }))

  // Every filter the sidebar counts do not vary. `relax` lets jobs taken for their
  // title alone past the match score, as buildWhere does.
  function base(r, f, relax) {
    if (hidden.has(r.id)) return false
    const status = advertStatus(r)
    if (['open', 'unverified', 'closed'].includes(f.status)) { if (status !== f.status) return false }
    else if (status === 'closed') return false
    if (f.scheme === 'schemes') { if (r.scheme !== 'ce' && r.scheme !== 'wpep') return false } else if ((r.scheme || 'ordinary') !== 'ordinary') return false
    if (f.maxHours > 0 && !(r.hours_max != null && r.hours_max <= f.maxHours)) return false
    if (f.availability) {
      if (!r._availability.includes(f.availability)) return false
      if ((UNAVAILABLE[f.availability] || []).some((x) => r._availability.includes(x))) return false
    }
    if (f.noConflicts && (r.conflicts || '[]') !== '[]') return false
    if (f.q && !r._text.includes(f.q.toLowerCase())) return false
    if (f.salaryMin > 0 && !((r.salary_max ?? r.salary_min) >= f.salaryMin)) return false
    if (f.days > 0 && !(posted(r) >= new Date(now() - f.days * 86400000).toISOString())) return false
    if (f.minScore > 0 && !(r.score >= f.minScore || (relax && unstatedHours(r)))) return false
    if (f.savedOnly && !saved.has(r.id)) return false
    return true
  }

  function advertStatus(r) {
    const today = dublinDate.format(new Date(now()))
    if (r.verification_status === 'closed' || (r.closing_at && r.closing_at.slice(0, 10) < today)) return 'closed'
    return r.verification_status === 'open' && Date.parse(r.verified_at) >= now() - 7 * 86400000 ? 'open' : 'unverified'
  }

  const chosen = (values) => (values?.length ? new Set(values) : null)
  function dimensions(f) {
    const want = {
      sponsorship: chosen(f.sponsorship), regions: chosen(f.regions), groups: chosen(f.groups),
      sources: chosen(f.sources), modes: chosen(f.workModes), types: chosen(f.employmentTypes),
    }
    return (r) => ({
      sponsorship: !want.sponsorship || want.sponsorship.has(r.sponsorship || 'unknown'),
      region: !want.regions || want.regions.has(r.region_key),
      group: !want.groups || r._groups.some((g) => want.groups.has(g)),
      source: !want.sources || r._sources.some((s) => want.sources.has(s)),
      mode: !want.modes || want.modes.has(r.work_mode),
      type: !want.types || want.types.has(r.employment_type),
    })
  }

  const SORTS = {
    newest: (a, b) => (posted(b) > posted(a) ? 1 : posted(b) < posted(a) ? -1 : 0),
    found: (a, b) => (b.first_seen > a.first_seen ? 1 : b.first_seen < a.first_seen ? -1 : 0),
    salary: (a, b) => (b.salary_max ?? b.salary_min ?? 0) - (a.salary_max ?? a.salary_min ?? 0) || SORTS.newest(a, b),
    relevance: (a, b) => b.score - a.score || SORTS.newest(a, b),
    company: (a, b) => (a.company || '').localeCompare(b.company || '', 'en', { sensitivity: 'base' }),
  }

  function matching(f) {
    const relax = f.includeUnstated && Boolean(viewByKey[f.view]?.unstatedHours)
    const pass = dimensions(f)
    return rows.filter((r) => base(r, f, relax) && inIreland(r) && (!viewByKey[f.view] || inView(r, f.view, f))
      && Object.values(pass(r)).every(Boolean))
  }

  function query(f) {
    const found = matching(f).sort(SORTS[f.sort] || SORTS.newest)
    return {
      total: found.length,
      rows: found.slice(f.offset, f.offset + f.limit).map((r) => ({ ...r, verification_status: advertStatus(r), is_saved: saved.has(r.id) ? 1 : 0 })),
      limit: f.limit,
      offset: f.offset,
    }
  }

  // Counts for every filter option. Each dimension ignores its own filter, so the
  // menus show what you would get by changing only that one thing.
  function facets(f) {
    const pass = dimensions(f)
    const current = viewByKey[f.view] ? f.view : ''
    const out = { byView: {}, byRegion: {}, byGroup: {}, bySource: {}, byCountry: {}, byMode: {}, byEmploymentType: {}, bySponsorship: {} }
    for (const v of views) out.byView[v.key] = 0
    const bump = (bucket, key) => { bucket[key] = (bucket[key] || 0) + 1 }

    for (const r of rows) {
      if (!base(r, f, f.includeUnstated)) continue
      const p = pass(r)
      const failed = Object.keys(p).filter((k) => !p[k])
      if (failed.length > 1) continue
      const all = failed.length === 0
      const only = failed[0]
      // Only a view that takes unstated hours may count a row below the match score.
      const scored = r.score >= f.minScore

      if (all) {
        if (scored && inIreland(r)) bump(out.byCountry, r.country ?? 'unknown')
        for (const v of views) if (inView(r, v.key, f) && (scored || v.unstatedHours)) out.byView[v.key]++
      }
      if (!inIreland(r) || (current && !inView(r, current, f))) continue
      if (!scored && !viewByKey[current]?.unstatedHours) continue
      if (all || only === 'region') bump(out.byRegion, r.region_key ?? 'unspecified')
      if (all || only === 'group') for (const g of r._groups) bump(out.byGroup, g)
      if (all || only === 'source') for (const s of r._sources) bump(out.bySource, s)
      if (all || only === 'mode') bump(out.byMode, r.work_mode ?? 'unspecified')
      if (all || only === 'type') bump(out.byEmploymentType, r.employment_type ?? 'unspecified')
      if (all || only === 'sponsorship') bump(out.bySponsorship, r.sponsorship || 'unknown')
    }
    return out
  }

  function stats() {
    const since = new Date(now() - 86400000).toISOString()
    return {
      total: rows.length,
      saved: rows.filter((r) => saved.has(r.id)).length,
      newLast24h: rows.filter((r) => r.first_seen >= since).length,
    }
  }

  return { query, matching, facets, stats }
}

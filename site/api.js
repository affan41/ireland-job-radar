// Data layer for the hosted site: everything is read from exported files and
// filtered in the browser. Shortlist and hidden jobs stay on this device.
import { parseFilters, createStore } from './static-core.js'

const stored = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() } }
const persist = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])) } catch {} }
const saved = stored('oneless.saved')
const hidden = stored('oneless.hidden')

const ready = Promise.all([
  fetch('data/jobs.json').then((r) => r.json()),
  fetch('data/meta.json').then((r) => r.json()),
]).then(([jobs, meta]) => ({ meta, store: createStore({ jobs, views: meta.views, saved, hidden }) }))

const buckets = new Map()
const bucket = (prefix) => {
  if (!buckets.has(prefix)) buckets.set(prefix, fetch(`data/detail/${prefix}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})))
  return buckets.get(prefix)
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

window.api = {
  static: true,

  async jobs(query) { return (await ready).store.query(parseFilters(query)) },

  async meta(query) {
    const { meta, store } = await ready
    return { ...meta, facets: store.facets(parseFilters(query)), stats: store.stats() }
  },

  async job(id) { return (await bucket(id.slice(0, 2)))[id] || null },

  async save(id, on) { if (on) saved.add(id); else saved.delete(id); persist('oneless.saved', saved) },
  async hide(id) { hidden.add(id); persist('oneless.hidden', hidden) },

  async exportCsv(query) {
    const { store } = await ready
    const head = ['Title', 'Company', 'Location', 'Region', 'Work mode', 'Job type', 'Salary', 'Posted', 'Source', 'Link',
      'Status', 'Closing date', 'Weekly hours min', 'Weekly hours max', 'Required shifts', 'Conflicts']
    const lines = store.matching(parseFilters(query)).slice(0, 300).map((r) => [
      r.title, r.company, r.location_raw, r.county_name, r.work_mode, r.employment_type, r.salary_text, (r.posted_at || '').slice(0, 10),
      r.available_sources || r.source, r.url, r.verification_status, r.closing_at, r.hours_min, r.hours_max, r.shifts, r.conflicts,
    ].map(csvCell).join(','))
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })),
      download: `oneless-${new Date().toISOString().slice(0, 10)}.csv`,
    })
    link.click()
    URL.revokeObjectURL(link.href)
  },
}

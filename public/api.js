// Data layer for the local app: every call goes to the server in server.js.
// The hosted site swaps this file for site/api.js, which answers from exported files.
const json = (url, options) => fetch(url, options).then((r) => r.json())
const post = (url, body) => json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

window.api = {
  static: false,
  jobs: (query) => json(`/api/jobs?${query}`),
  meta: (query) => json(`/api/meta?${query}`),
  job: (id) => fetch(`/api/jobs/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  save: (id, on) => post(`/api/jobs/${id}/save`, { saved: on }),
  hide: (id) => post(`/api/jobs/${id}/hide`, { hidden: true }),
  exportCsv: (query) => { location.href = `/api/export.csv?${query}` },
  refresh: () => fetch('/api/refresh', { method: 'POST' }),
  refreshStatus: () => json('/api/refresh/status').catch(() => null),
}

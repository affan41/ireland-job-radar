// All data comes through window.api: the local server (public/api.js) or, on the
// hosted site, exported files filtered in the browser (site/api.js).
const api = window.api

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const DEFAULTS = {
  days: '14', minScore: '10', salaryMin: '0', maxHours: '0', availability: '', status: '', scheme: 'ordinary',
}
const SETS = ['sponsorship', 'regions', 'groups', 'modes', 'types', 'sources']

const state = {
  country: 'ie',
  view: '',
  includeNearby: true,
  includeUnstated: true,
  sponsorship: new Set(),
  regions: new Set(),
  groups: new Set(),
  modes: new Set(),
  types: new Set(),
  sources: new Set(),
  q: '',
  ...DEFAULTS,
  noConflicts: false,
  savedOnly: false,
  sort: 'newest',
  page: 0,
  limit: 50,
}

let meta = null
let jobs = new Map()
let selectedId = null
let allRegions = false

const wide = matchMedia('(min-width: 900px)')

const STORE_KEY = 'ireland-job-radar.filters'
const FILTER_VERSION = 3

function saveState() {
  const plain = { ...state, _version: FILTER_VERSION }
  for (const k of SETS) plain[k] = [...state[k]]
  delete plain.page
  try { localStorage.setItem(STORE_KEY, JSON.stringify(plain)) } catch {}
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    for (const k of SETS) if (Array.isArray(raw[k])) state[k] = new Set(raw[k])
    for (const k of ['q', 'sort', 'view', ...Object.keys(DEFAULTS)]) if (raw[k] != null) state[k] = raw[k]
    for (const k of ['noConflicts', 'savedOnly', 'includeNearby', 'includeUnstated']) if (typeof raw[k] === 'boolean') state[k] = raw[k]
    // Existing users had a narrower seven-day default. Widen it once without
    // disturbing their chosen regions, categories or shortlist preference.
    if ((raw._version || 1) < 2 && raw.days === '7') state.days = '14'
    // The remote tab was folded into the part-time tab, which looks back 30 days.
    if (state.view === 'ireland-remote-pt') state.view = 'limerick-pt'
    if ((raw._version || 1) < 3 && state.view && state.days === '14') state.days = '30'
  } catch {}
}

function params(extra = {}) {
  const p = new URLSearchParams()
  // A view pins its own geography, remote work included, so it replaces the
  // country switch rather than sitting alongside it.
  if (state.view) p.set('view', state.view)
  else p.set('countries', state.country)
  if (state.includeNearby) p.set('nearby', '1')
  if (state.includeUnstated) p.set('unstated', '1')
  for (const k of SETS) if (state[k].size) p.set(k, [...state[k]].join(','))
  if (state.q) p.set('q', state.q)
  for (const k of ['days', 'minScore', 'salaryMin']) if (state[k] !== '0') p.set(k, state[k])
  for (const k of ['maxHours', 'availability', 'status', 'scheme']) if (state[k]) p.set(k, state[k])
  if (state.noConflicts) p.set('noConflicts', '1')
  if (state.savedOnly) p.set('saved', '1')
  p.set('sort', state.sort)
  p.set('limit', String(state.limit))
  p.set('offset', String(state.page * state.limit))
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p
}

// Formatting

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (n) => Number(n || 0).toLocaleString('en-IE')
const shortDate = (value) => new Date(value).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
const parseList = (s) => { try { return JSON.parse(s || '[]') } catch { return [] } }

function timeAgo(iso, short = false) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(mins)) return ''
  const unit = (n, s, long) => (short ? `${n}${s}` : `${n} ${long}${n === 1 ? '' : 's'} ago`)
  if (mins < 60) return unit(Math.max(mins, 0), 'm', 'minute')
  const h = Math.round(mins / 60)
  if (h < 24) return unit(h, 'h', 'hour')
  const d = Math.round(h / 24)
  if (d < 31) return unit(d, 'd', 'day')
  return shortDate(iso)
}

function money(min, max, currency) {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€'
  const f = (n) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${Math.round(n)}`)
  if (min && max && min !== max) return `${f(min)} to ${f(max)}`
  return f(max || min)
}

const MODE_LABELS = { hybrid: 'Hybrid', remote: 'Remote', onsite: 'On site', unspecified: 'Not stated' }
const TYPE_LABELS = { part_time: 'Part-time', full_time: 'Full-time', temporary: 'Temporary / seasonal', contract: 'Contract', unspecified: 'Not stated' }
const SPONSOR_LABELS = { explicit: 'Sponsorship offered', likely: 'Sponsorship not stated', unlikely: 'No sponsorship' }
const SOURCE_LABELS = {
  jobalert: 'JobAlert.ie',
  local: 'Local and brand searches',
  careerjet: 'Careerjet / aggregated boards',
  acca: 'ACCA Careers',
  jobsireland: 'JobsIreland (government)',
  adzuna: 'Adzuna',
  employer: 'Direct from employer',
  remote: 'Remote boards',
}

const place = (j) => j.location_raw || j.county_name || ''
const hoursText = (j) => `${j.hours_min == null || j.hours_min === j.hours_max ? j.hours_max : `${j.hours_min}–${j.hours_max}`} h/week`
const isNew = (j) => j.first_seen && Date.now() - new Date(j.first_seen).getTime() < 86400000
const hoursUnstated = (j) => j.hours_max == null && j.student_role && j.employment_type === 'unspecified'

// A company gets the same colour every time, so the list is scannable by eye.
function avatar(j, big = false) {
  const name = (j.company || j.title || '?').trim()
  let h = 0
  for (const c of name) h = (h * 31 + c.codePointAt(0)) % 360
  return `<span class="avatar${big ? ' big' : ''}" style="--h:${h}">${esc(name[0].toUpperCase())}</span>`
}

// Tags state what the advert says. Anything it leaves out is simply absent.
function tags(j) {
  const out = []
  if (j.employment_type && j.employment_type !== 'unspecified') out.push(`<span class="tag ${j.employment_type}">${TYPE_LABELS[j.employment_type] || esc(j.employment_type)}</span>`)
  if (hoursUnstated(j)) out.push('<span class="tag outline" title="The advert gives no hours. Confirm they suit before applying.">Hours not stated</span>')
  if (j.hours_max != null) out.push(`<span class="tag">${hoursText(j)}</span>`)
  // Do not print "Remote" twice when the location already says it.
  if (j.work_mode && j.work_mode !== 'unspecified' && !(j.work_mode === 'remote' && /remote/i.test(place(j)))) out.push(`<span class="tag ${j.work_mode}">${MODE_LABELS[j.work_mode] || esc(j.work_mode)}</span>`)
  if (j.distance?.routeUrl) out.push(`<span class="tag good" title="${esc(j.distance.detail)}">${esc(j.distance.label)}</span>`)
  if (j.salary_min || j.salary_max) out.push(`<span class="tag good">${money(j.salary_min, j.salary_max, j.salary_currency)}</span>`)
  if (j.sponsorship && j.sponsorship !== 'unknown' && SPONSOR_LABELS[j.sponsorship]) out.push(`<span class="tag ${j.sponsorship === 'explicit' ? 'good' : j.sponsorship === 'unlikely' ? 'bad' : ''}">${SPONSOR_LABELS[j.sponsorship]}</span>`)
  if (j.scheme && j.scheme !== 'ordinary') out.push(`<span class="tag">${esc(j.scheme.toUpperCase())} scheme</span>`)
  if (j.verification_status === 'closed') out.push('<span class="tag bad">Closed</span>')
  else if (j.closing_at) out.push(`<span class="tag">Closes ${shortDate(j.closing_at)}</span>`)
  if (j.verification_status === 'open') out.push('<span class="tag good">Verified open</span>')
  if (parseList(j.conflicts).length) out.push('<span class="tag bad">Conflicting details</span>')
  return out
}

// Filter bar

function checks(id, items, showEmpty = false) {
  const selected = state[id]
  $(`#${id}`).innerHTML = items
    // An option that would return nothing is noise until it is selected.
    .filter((it) => it.head || showEmpty || it.count > 0 || selected.has(it.key))
    .map((it) => (it.head
      ? `<div class="checks-head">${esc(it.head)}</div>`
      : `<label class="check${it.count === 0 ? ' dim' : ''}"><input type="checkbox" data-set="${id}" value="${esc(it.key)}"${selected.has(it.key) ? ' checked' : ''}>
          <span>${esc(it.name)}</span><span class="n">${it.count}</span></label>`))
    .join('') || '<p class="pop-empty">Nothing to choose from with the current filters.</p>'
}

function renderRegions() {
  const counts = meta.facets.byRegion || {}
  const items = []
  let hidden = 0
  for (const province of meta.provinceOrder) {
    const inProvince = meta.regions
      .filter((r) => r.province === province)
      .map((r) => ({ key: r.key, name: r.name, count: counts[r.key] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    // Empty counties are noise until you go looking for them.
    const shown = allRegions ? inProvince : inProvince.filter((r) => r.count > 0 || state.regions.has(r.key))
    hidden += inProvince.length - shown.length
    if (shown.length) items.push({ head: province }, ...shown)
  }
  checks('regions', items, true)
  if (hidden || allRegions) {
    $('#regions').insertAdjacentHTML('beforeend', `<button class="pop-link" id="moreRegions">${allRegions ? 'Hide empty counties' : `Show ${hidden} empty counties`}</button>`)
  }
}

function renderTabs() {
  const f = meta.facets
  const tabs = [
    ...meta.countries.map((c) => ({ view: '', name: `All ${c.name}`, count: f.byCountry?.[c.code] || 0 })),
    ...(meta.views || []).map((v) => ({ view: v.key, name: v.name, count: f.byView?.[v.key] || 0 })),
  ]
  $('#tabs').innerHTML = tabs.map((t) =>
    `<button class="tab${state.view === t.view ? ' on' : ''}" data-view="${esc(t.view)}">${esc(t.name)}<span>${num(t.count)}</span></button>`).join('')
}

function renderFilters() {
  const f = meta.facets
  renderTabs()
  renderRegions()
  checks('types', Object.entries(TYPE_LABELS).map(([key, name]) => ({ key, name, count: f.byEmploymentType[key] || 0 })))
  checks('modes', Object.entries(MODE_LABELS).map(([key, name]) => ({ key, name, count: f.byMode[key] || 0 })))
  checks('groups', meta.groups.map((g) => ({ key: g.key, name: g.name, count: f.byGroup[g.key] || 0 })))
  checks('sponsorship', (meta.sponsorshipLevels || []).map((l) => ({ key: l.key, name: l.label, count: f.bySponsorship?.[l.key] || 0 })))
  checks('sources', Object.entries(SOURCE_LABELS).map(([key, name]) => ({ key, name, count: f.bySource[key] || 0 })))

  const view = (meta.views || []).find((v) => v.key === state.view)
  $('#viewOptions').hidden = !view

  // Each chip says how many things it is filtering by.
  const active = {
    types: state.types.size, modes: state.modes.size, regions: state.regions.size, groups: state.groups.size,
    hours: (state.maxHours !== '0') + Boolean(state.availability) + state.noConflicts,
    more: (state.minScore !== DEFAULTS.minScore) + (state.salaryMin !== '0') + Boolean(state.status)
      + (state.scheme !== 'ordinary') + state.sponsorship.size + state.sources.size,
  }
  for (const chip of $$('.chip[data-chip]')) {
    const n = active[chip.dataset.chip]
    chip.classList.toggle('active', n > 0)
    $('.badge', chip).textContent = n || ''
  }
  $('#savedOnly').classList.toggle('active', state.savedOnly)
  $('#savedOnly').setAttribute('aria-pressed', state.savedOnly)
  $('.badge', $('#savedOnly')).textContent = meta.stats.saved || ''
  $('#resetAll').hidden = !(Object.values(active).some(Boolean) || state.q || state.savedOnly)

  const permit = (meta.permitNotes || {})[state.country]
  const note = view?.note
    ? `<strong>${esc(view.name)}.</strong> ${esc(view.note)}${view.noteLink ? ` <a href="${esc(view.noteLink.href)}" target="_blank" rel="noopener">${esc(view.noteLink.text)}</a>` : ''}`
    : permit ? `<strong>Working in ${esc(permit.name)} on a permit.</strong> ${esc(permit.note)} <a href="${esc(permit.link)}" target="_blank" rel="noopener">Official guidance</a>` : ''
  $('#viewNote').innerHTML = note
  $('#viewNote').hidden = !note
}

// List

function rowHtml(j) {
  const sub = [j.company, place(j)].filter(Boolean).map(esc).join(' · ')
  return `<li class="row${j.id === selectedId ? ' sel' : ''}${j.is_saved ? ' saved' : ''}" data-id="${esc(j.id)}" tabindex="0">
    ${avatar(j)}
    <div class="row-main">
      <div class="row-title">${esc(j.title)}</div>
      <div class="row-sub">${sub}</div>
      <div class="row-tags">${tags(j).slice(0, 3).join('')}</div>
    </div>
    <div class="row-side">
      <time>${timeAgo(j.posted_at || j.first_seen, true)}</time>
      ${isNew(j) ? '<span class="dot" title="Found in the last 24 hours"></span>' : ''}
      <span class="heart" title="Shortlisted">♥</span>
    </div>
  </li>`
}

const countFor = (qs) => api.jobs(`${qs}&limit=1`).then((d) => d.total).catch(() => 0)

// An empty list is nearly always one filter doing the damage rather than an empty
// database. Work out which one, say so plainly, and offer to undo it.
async function renderEmptyState(host) {
  const requested = params().toString()
  const [ignoringDate, ignoringEverything] = await Promise.all([
    countFor(params({ days: 0 })),
    countFor(`countries=${state.country}&days=0&minScore=0`),
  ])
  if (requested !== params().toString()) return

  if (ignoringEverything === 0) {
    host.innerHTML = `<li class="empty"><h3>No jobs stored yet</h3>
      <p>${api.static ? 'The next collection run will fill this in. Check back shortly.' : 'Press Refresh in the top right to collect some. The first run takes a few minutes.'}</p></li>`
  } else if (ignoringDate > 0 && Number(state.days) > 0) {
    const label = $('#days').selectedOptions[0]?.textContent.toLowerCase() || `${state.days} days`
    host.innerHTML = `<li class="empty"><h3>Nothing posted in the last ${esc(label)}</h3>
      <p>Your other filters match ${num(ignoringDate)} older listings.</p>
      <button class="btn" id="widenDate">Show them</button></li>`
    $('#widenDate').addEventListener('click', () => setFilter('days', '0'))
  } else {
    host.innerHTML = `<li class="empty"><h3>Nothing matches those filters</h3>
      <p>There are ${num(ignoringEverything)} jobs stored. Try a lower match strength under More, or fewer filters.</p>
      <button class="btn" id="resetFromEmpty">Reset filters</button></li>`
    $('#resetFromEmpty').addEventListener('click', resetAll)
  }
}

async function loadJobs() {
  const requested = params().toString()
  const { total, rows, limit, offset } = await api.jobs(requested)
  if (requested !== params().toString()) return

  jobs = new Map(rows.map((j) => [j.id, j]))
  const host = $('#results')
  $('#pager').innerHTML = ''

  if (!rows.length) {
    $('#count').textContent = 'No jobs'
    host.innerHTML = ''
    select(null)
    await renderEmptyState(host)
    return
  }

  // Keep the open advert if it is still in the list; otherwise open the first.
  if (!jobs.has(selectedId)) selectedId = wide.matches ? rows[0].id : null
  host.innerHTML = rows.map(rowHtml).join('')
  renderDetail()

  $('#count').innerHTML = total > limit
    ? `<strong>${offset + 1}–${Math.min(offset + limit, total)}</strong> of ${num(total)} jobs`
    : `<strong>${num(total)}</strong> ${total === 1 ? 'job' : 'jobs'}`

  const pages = Math.ceil(total / limit)
  if (pages > 1) {
    $('#pager').innerHTML = `<button class="btn ghost" data-step="-1"${state.page === 0 ? ' disabled' : ''}>Previous</button>
      <span>Page ${state.page + 1} of ${pages}</span>
      <button class="btn ghost" data-step="1"${state.page + 1 >= pages ? ' disabled' : ''}>Next</button>`
  }
}

// Reading pane

function select(id, { open = false } = {}) {
  selectedId = id
  for (const row of $$('.row')) row.classList.toggle('sel', row.dataset.id === id)
  if (open) document.body.classList.add('reading')
  renderDetail()
}

// Splits stored advert text into headings, bullet lists and paragraphs.
function proseHtml(text) {
  const out = []
  let list = []
  const flush = () => { if (list.length) { out.push(`<ul>${list.join('')}</ul>`); list = [] } }
  for (const line of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const bullet = line.match(/^[•·▪◦*\-–]\s+(.*)/)
    if (bullet) { list.push(`<li>${esc(bullet[1])}</li>`); continue }
    flush()
    const heading = line.length <= 70 && (/:$/.test(line) || (line === line.toUpperCase() && /[A-Z]{3}/.test(line)))
    out.push(heading ? `<h4>${esc(line.replace(/:$/, ''))}</h4>` : `<p>${esc(line)}</p>`)
  }
  flush()
  return out.join('')
}

function detailHtml(j, full) {
  const posted = j.posted_at || j.first_seen
  const d = j.distance
  const sources = String(j.available_sources || j.source || '').split(',').filter(Boolean)
  const facts = [
    ['Hours', j.hours_max != null ? hoursText(j) : hoursUnstated(j) ? 'Not stated in the advert' : ''],
    ['Closes', j.closing_at ? shortDate(j.closing_at) : ''],
    [j.posted_at ? 'Posted' : 'First found', posted ? timeAgo(posted) : ''],
    ['Distance', d?.routeUrl ? `<a href="${esc(d.routeUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(d.detail)}">${esc(d.label)} from home ↗</a>` : '', true],
    ['Salary', j.salary_text || ''],
    ['Source', [j.source_detail || SOURCE_LABELS[j.source] || j.source, sources.length > 1 ? `+ ${sources.length - 1} more` : ''].filter(Boolean).join(' ')],
    ['Checked', j.verification_status === 'open' ? `Open on ${shortDate(j.verified_at)}` : j.verification_status === 'closed' ? (j.verification_reason || 'Closed') : ''],
  ].filter(([, v]) => v)

  const text = (full?.full_description || '').trim() || j.description || ''
  const thin = text.length < 40 || !/\s/.test(text)
  const conflicts = parseList(j.conflicts)
  const shifts = parseList(j.shifts)
  const applyUrl = full?.application_url && full.application_url !== j.url ? full.application_url : ''

  return `<div class="detail">
    <button class="back" id="backBtn">← Back to list</button>
    <header class="d-head">
      ${avatar(j, true)}
      <div>
        <h2>${esc(j.title)}</h2>
        <p class="d-sub">${[j.company, place(j)].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </header>
    <div class="d-tags">${tags(j).join('')}${isNew(j) ? '<span class="tag new">New</span>' : ''}</div>
    <div class="d-actions">
      <a class="btn primary" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Open advert ↗</a>
      ${applyUrl ? `<a class="btn" href="${esc(applyUrl)}" target="_blank" rel="noopener noreferrer">Apply ↗</a>` : ''}
      <button class="btn${j.is_saved ? ' on' : ''}" id="saveBtn">${j.is_saved ? '♥ Shortlisted' : '♡ Shortlist'}</button>
      <button class="btn ghost" id="hideBtn" title="Remove this listing from your results">Hide</button>
    </div>
    ${conflicts.length ? `<div class="callout bad"><strong>Check before applying.</strong> ${conflicts.map(esc).join(' ')}</div>` : ''}
    ${j.remote_student_note ? `<div class="callout"><strong>Before applying.</strong> ${esc(j.remote_student_note)}</div>` : ''}
    ${facts.length ? `<dl class="facts">${facts.map(([k, v, raw]) => `<div><dt>${k}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${shifts.length ? `<section><h3>Shifts and availability</h3>${shifts.map((s) => `<p>${esc(s)}</p>`).join('')}</section>` : ''}
    ${j.sponsorship_evidence ? `<section><h3>Sponsorship</h3><p>${esc(j.sponsorship_evidence)} <a href="${esc(j.sponsorship_source || j.url)}" target="_blank" rel="noopener">Source advert</a></p></section>` : ''}
    <section class="prose"><h3>About the job</h3>
      ${thin ? '<p class="muted">The source gave no description. Open the advert to read it.</p>' : proseHtml(text)}
    </section>
    ${j.title_repair_note ? `<p class="muted">${esc(j.title_repair_note)} · Original reference: ${esc(j.original_title)}</p>` : ''}
  </div>`
}

const fullJobs = new Map()

async function renderDetail() {
  const host = $('#detail')
  const j = jobs.get(selectedId)
  if (!j) {
    document.body.classList.remove('reading')
    host.innerHTML = '<div class="detail-empty">Select a job to read the advert.</div>'
    return
  }
  // Show what the list already knows at once, then fill in the full advert.
  host.innerHTML = detailHtml(j, fullJobs.get(j.id))
  host.scrollTop = 0
  if (fullJobs.has(j.id)) return
  const full = await api.job(j.id)
  if (!full) return
  fullJobs.set(j.id, full)
  if (selectedId === j.id) host.innerHTML = detailHtml(j, full)
}

async function toggleSaved() {
  const j = jobs.get(selectedId)
  if (!j) return
  j.is_saved = j.is_saved ? 0 : 1
  $(`.row[data-id="${j.id}"]`)?.classList.toggle('saved', Boolean(j.is_saved))
  const btn = $('#saveBtn')
  btn.classList.toggle('on', Boolean(j.is_saved))
  btn.textContent = j.is_saved ? '♥ Shortlisted' : '♡ Shortlist'
  meta.stats.saved += j.is_saved ? 1 : -1
  $('.badge', $('#savedOnly')).textContent = meta.stats.saved || ''
  await api.save(j.id, Boolean(j.is_saved))
}

async function hideSelected() {
  const row = $(`.row[data-id="${selectedId}"]`)
  if (!row) return
  const id = selectedId
  const next = row.nextElementSibling || row.previousElementSibling
  row.remove()
  jobs.delete(id)
  select(wide.matches && next ? next.dataset.id : null)
  await api.hide(id)
}

// Loading

async function loadMeta() {
  const requested = params().toString()
  const nextMeta = await api.meta(requested)
  if (requested !== params().toString()) return
  meta = nextMeta
  renderFilters()
  const when = meta.lastRun?.finished_at
  $('#tagline').textContent = `${num(meta.stats.newLast24h)} new today${when ? ` · updated ${timeAgo(when)}` : ''}`
}

async function refreshAll() {
  saveState()
  await Promise.all([loadMeta(), loadJobs()])
}

function setFilter(key, value) {
  state[key] = value
  state.page = 0
  syncControls()
  refreshAll()
}

function resetAll() {
  for (const k of SETS) state[k].clear()
  Object.assign(state, DEFAULTS, { q: '', noConflicts: false, savedOnly: false, includeNearby: true, includeUnstated: true, page: 0 })
  const view = (meta?.views || []).find((v) => v.key === state.view)
  if (view?.defaultDays) state.days = String(view.defaultDays)
  syncControls()
  refreshAll()
}

function switchView(key) {
  if (state.view === key) return
  const views = meta.views || []
  // A view may look further back than the ordinary default; undo that on leaving.
  const leaving = views.find((v) => v.key === state.view)
  if (leaving?.defaultDays && state.days === String(leaving.defaultDays)) state.days = DEFAULTS.days
  const entering = views.find((v) => v.key === key)
  if (entering?.defaultDays && state.days === DEFAULTS.days) state.days = String(entering.defaultDays)
  state.view = key
  // The view decides the geography, so a leftover county filter would fight it.
  state.regions.clear()
  state.page = 0
  syncControls()
  refreshAll()
}

// Refresh polling

let pollTimer = null
async function pollRefresh() {
  const st = await api.refreshStatus()
  const el = $('#runState')
  if (st?.active) {
    el.textContent = st.step || 'Working'
    document.body.classList.add('refreshing')
    $('#refreshBtn').disabled = true
    if (!pollTimer) pollTimer = setInterval(pollRefresh, 2500)
  } else {
    document.body.classList.remove('refreshing')
    $('#refreshBtn').disabled = false
    el.textContent = ''
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
      refreshAll()
    }
  }
}

// Wiring

function syncControls() {
  for (const k of ['q', 'sort', ...Object.keys(DEFAULTS)]) $(`#${k}`).value = state[k]
  for (const k of ['noConflicts', 'includeNearby', 'includeUnstated']) $(`#${k}`).checked = state[k]
}

function bind() {
  let t
  $('#q').addEventListener('input', (e) => {
    clearTimeout(t)
    t = setTimeout(() => { state.q = e.target.value.trim(); state.page = 0; refreshAll() }, 200)
  })

  for (const k of ['sort', ...Object.keys(DEFAULTS)]) {
    $(`#${k}`).addEventListener('change', (e) => setFilter(k, e.target.value))
  }
  for (const k of ['noConflicts', 'includeUnstated']) $(`#${k}`).addEventListener('change', (e) => setFilter(k, e.target.checked))
  $('#includeNearby').addEventListener('change', (e) => { state.regions.clear(); setFilter('includeNearby', e.target.checked) })
  $('#savedOnly').addEventListener('click', () => setFilter('savedOnly', !state.savedOnly))
  $('#resetAll').addEventListener('click', resetAll)

  // One listener covers every checklist in the filter bar.
  $('#filters').addEventListener('change', (e) => {
    const set = e.target.dataset?.set
    if (!set) return
    if (e.target.checked) state[set].add(e.target.value)
    else state[set].delete(e.target.value)
    state.page = 0
    refreshAll()
  })
  $('#filters').addEventListener('click', (e) => {
    if (e.target.id === 'moreRegions') { allRegions = !allRegions; renderRegions() }
  })

  // Only one filter menu open at a time, and a click elsewhere closes it.
  const chips = $$('details.chip')
  for (const chip of chips) {
    chip.addEventListener('toggle', () => {
      if (!chip.open) return
      for (const other of chips) if (other !== chip) other.open = false
      // Keep a menu near the right edge inside the window.
      const pop = $('.pop', chip)
      pop.classList.remove('right')
      pop.classList.toggle('right', pop.getBoundingClientRect().right > innerWidth - 8)
    })
  }
  document.addEventListener('click', (e) => { for (const chip of chips) if (chip.open && !chip.contains(e.target)) chip.open = false })

  $('#tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab')
    if (tab) switchView(tab.dataset.view)
  })

  $('#results').addEventListener('click', (e) => {
    const row = e.target.closest('.row')
    if (row) select(row.dataset.id, { open: true })
  })

  $('#detail').addEventListener('click', (e) => {
    if (e.target.id === 'saveBtn') toggleSaved()
    else if (e.target.id === 'hideBtn') hideSelected()
    else if (e.target.id === 'backBtn') document.body.classList.remove('reading')
  })

  $('#pager').addEventListener('click', async (e) => {
    const step = Number(e.target.dataset?.step)
    if (!step) return
    state.page += step
    selectedId = null
    await loadJobs()
    $('#listPane').scrollTop = 0
    scrollTo(0, 0)
  })

  // Arrow keys walk the list, as in a mail client.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { for (const chip of chips) chip.open = false; document.body.classList.remove('reading'); return }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return
    if (e.key === 'Enter' && e.target.classList?.contains('row')) return select(e.target.dataset.id, { open: true })
    const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key]
    if (!step) return
    const rows = $$('.row')
    const next = rows[rows.findIndex((r) => r.dataset.id === selectedId) + step]
    if (!next) return
    e.preventDefault()
    select(next.dataset.id)
    next.scrollIntoView({ block: 'nearest' })
  })

  // Widening the window brings the reading pane back, so give it something to show.
  wide.addEventListener('change', () => {
    if (wide.matches && !jobs.has(selectedId) && jobs.size) select(jobs.keys().next().value)
  })

  $('#exportBtn').addEventListener('click', (e) => { e.preventDefault(); api.exportCsv(params().toString()) })

  $('#notesBtn').addEventListener('click', () => $('#notes').showModal())

  $('#refreshBtn').addEventListener('click', async () => {
    $('#refreshBtn').disabled = true
    $('#runState').textContent = 'Starting'
    document.body.classList.add('refreshing')
    await api.refresh()
    setTimeout(pollRefresh, 800)
  })
}

loadState()
if (api.static) {
  // Collection happens on the host's schedule; all date filters remain usable.
  $('#refreshBtn').hidden = true
}
syncControls()
bind()
refreshAll()
if (!api.static) {
  pollRefresh()
  setInterval(() => { if (!pollTimer) pollRefresh() }, 20000)
}

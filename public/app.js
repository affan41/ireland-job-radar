const $ = (sel) => document.querySelector(sel)

const state = {
  country: 'ie',
  view: '',
  sponsorship: new Set(),
  regions: new Set(),
  groups: new Set(),
  modes: new Set(),
  types: new Set(),
  sources: new Set(),
  q: '',
  days: '14',
  minScore: '10',
  salaryMin: '0',
  savedOnly: false,
  sort: 'newest',
  page: 0,
  limit: 50,
}

let meta = null

const STORE_KEY = 'ireland-job-radar.filters'
const FILTER_VERSION = 2

function saveState() {
  const plain = { ...state, sponsorship: [...state.sponsorship], regions: [...state.regions], groups: [...state.groups], modes: [...state.modes], types: [...state.types], sources: [...state.sources] }
  delete plain.page
  plain._version = FILTER_VERSION
  try { localStorage.setItem(STORE_KEY, JSON.stringify(plain)) } catch {}
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    for (const k of ['sponsorship', 'regions', 'groups', 'modes', 'types', 'sources']) if (Array.isArray(raw[k])) state[k] = new Set(raw[k])
    for (const k of ['q', 'days', 'minScore', 'salaryMin', 'sort', 'country', 'view']) if (raw[k] != null) state[k] = raw[k]
    if (typeof raw.savedOnly === 'boolean') state.savedOnly = raw.savedOnly
    // Existing users had a narrower seven-day default. Widen it once without
    // disturbing their chosen regions, categories or shortlist preference.
    if ((raw._version || 1) < FILTER_VERSION && raw.days === '7') state.days = '14'
  } catch {}
}

function params(extra = {}) {
  const p = new URLSearchParams()
  // A view pins its own geography, remote work included, so it replaces the
  // country switch rather than sitting alongside it.
  if (state.view) p.set('view', state.view)
  else if (state.country) p.set('countries', state.country)
  if (state.sponsorship.size) p.set('sponsorship', [...state.sponsorship].join(','))
  if (state.regions.size) p.set('regions', [...state.regions].join(','))
  if (state.groups.size) p.set('groups', [...state.groups].join(','))
  if (state.modes.size) p.set('modes', [...state.modes].join(','))
  if (state.types.size) p.set('types', [...state.types].join(','))
  if (state.sources.size) p.set('sources', [...state.sources].join(','))
  if (state.q) p.set('q', state.q)
  if (state.days !== '0') p.set('days', state.days)
  if (state.minScore !== '0') p.set('minScore', state.minScore)
  if (state.salaryMin !== '0') p.set('salaryMin', state.salaryMin)
  if (state.savedOnly) p.set('saved', '1')
  p.set('sort', state.sort)
  p.set('limit', String(state.limit))
  p.set('offset', String(state.page * state.limit))
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(mins)) return ''
  if (mins < 60) return `${Math.max(mins, 0)} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  if (d < 31) return `${d} ${d === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
}

function money(min, max, currency) {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€'
  const f = (n) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${Math.round(n)}`)
  if (min && max && min !== max) return `${f(min)} to ${f(max)}`
  return f(max || min)
}

// Filter panels

function checklist(el, items, selected, onToggle) {
  el.innerHTML = ''
  for (const it of items) {
    const row = document.createElement('label')
    row.className = `opt${it.count === 0 && !selected.has(it.key) ? ' empty' : ''}`
    row.innerHTML = `<input type="checkbox"${selected.has(it.key) ? ' checked' : ''}>
      <span class="label">${esc(it.name)}</span>
      <span class="n">${it.count ?? ''}</span>`
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) selected.add(it.key)
      else selected.delete(it.key)
      onToggle()
    })
    el.appendChild(row)
  }
}

const expandedProvinces = new Set()

function renderRegions() {
  const counts = meta.facets.byRegion || {}
  const host = $('#regions')
  host.innerHTML = ''

  for (const province of meta.provinceOrder) {
    const inProvince = meta.regions.filter((r) => r.province === province)
    if (!inProvince.length) continue

    const total = inProvince.reduce((n, r) => n + (counts[r.key] || 0), 0)
    if (total === 0 && !inProvince.some((r) => state.regions.has(r.key))) continue

    const all = inProvince
      .map((r) => ({ key: r.key, name: r.name, count: counts[r.key] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    // Empty counties are noise until you go looking for them.
    const expanded = expandedProvinces.has(province)
    const shown = expanded ? all : all.filter((r) => r.count > 0 || state.regions.has(r.key))
    const hiddenCount = all.length - shown.length

    const box = document.createElement('div')
    box.className = 'province'
    const head = document.createElement('div')
    head.className = 'province-name'
    head.textContent = `${province} (${total})`
    box.appendChild(head)

    const listEl = document.createElement('div')
    listEl.className = 'checklist'
    checklist(listEl, shown, state.regions, () => { state.page = 0; refreshAll() })
    box.appendChild(listEl)

    if (hiddenCount > 0 || expanded) {
      const more = document.createElement('button')
      more.className = 'link more'
      more.textContent = expanded ? 'Show fewer' : `Show ${hiddenCount} more`
      more.addEventListener('click', () => {
        if (expanded) expandedProvinces.delete(province)
        else expandedProvinces.add(province)
        renderRegions()
      })
      box.appendChild(more)
    }

    host.appendChild(box)
  }
}

const MODE_LABELS = { hybrid: 'Hybrid', remote: 'Remote', onsite: 'On site', unspecified: 'Not stated' }
const TYPE_LABELS = { part_time: 'Part-time', full_time: 'Full-time', temporary: 'Temporary / seasonal', contract: 'Contract', unspecified: 'Not stated' }
const SPONSOR_LABELS = {
  explicit: 'Sponsorship mentioned',
  likely: 'Likely to sponsor',
  unlikely: 'No sponsorship',
}
const SOURCE_LABELS = {
  careerjet: 'Careerjet / aggregated boards',
  acca: 'ACCA Careers',
  jobsireland: 'JobsIreland (government)',
  adzuna: 'Adzuna',
  employer: 'Direct from employer',
  remote: 'Remote boards',
}

const FLAGS = { ie: '\u{1F1EE}\u{1F1EA}', cy: '\u{1F1E8}\u{1F1FE}', mt: '\u{1F1F2}\u{1F1F9}' }

function renderCountries() {
  const counts = meta.facets.byCountry || {}
  const host = $('#countries')
  host.innerHTML = ''

  for (const c of meta.countries) {
    const btn = document.createElement('button')
    btn.className = `country${state.country === c.code && !state.view ? ' on' : ''}`
    btn.innerHTML = `<span class="flag">${FLAGS[c.code] || ''}</span>
      <span class="cname">${esc(c.name)}</span>
      <span class="cn">${counts[c.code] || 0}</span>`
    btn.addEventListener('click', () => {
      if (state.country === c.code && !state.view) return
      state.country = c.code
      state.view = ''
      // Regions belong to one country, so carrying them across would show nothing.
      state.regions.clear()
      state.page = 0
      refreshAll()
    })
    host.appendChild(btn)
  }

  // Saved views sit after the countries, separated so they do not read as one.
  const viewCounts = meta.facets.byView || {}
  for (const v of meta.views || []) {
    const btn = document.createElement('button')
    btn.className = `country view${state.view === v.key ? ' on' : ''}`
    btn.innerHTML = `<span class="flag">\u{1F393}</span>
      <span class="cname">${esc(v.name)}</span>
      <span class="cn">${viewCounts[v.key] || 0}</span>`
    btn.addEventListener('click', () => {
      if (state.view === v.key) return
      state.view = v.key
      state.country = v.country || state.country
      // The view decides the geography, so a leftover county filter would fight it.
      state.regions.clear()
      state.page = 0
      refreshAll()
    })
    host.appendChild(btn)
  }
}

function renderPermitNote() {
  const host = $('#permitNote')

  if (state.view) {
    const v = (meta.views || []).find((x) => x.key === state.view)
    if (v?.note) {
      host.hidden = false
      host.innerHTML = `<strong>${esc(v.name)}.</strong> ${esc(v.note)}`
        + (v.noteLink ? ` <a href="${esc(v.noteLink.href)}" target="_blank" rel="noopener">${esc(v.noteLink.text)}</a>` : '')
      return
    }
  }

  const note = (meta.permitNotes || {})[state.country]
  if (!note) { host.hidden = true; return }
  host.hidden = false
  host.innerHTML = `<strong>Working in ${esc(note.name)} on a permit.</strong>
    ${esc(note.note)}
    <a href="${esc(note.link)}" target="_blank" rel="noopener">Official guidance</a>`
}

function renderFilters() {
  renderCountries()
  renderPermitNote()
  renderRegions()

  checklist(
    $('#sponsorship'),
    (meta.sponsorshipLevels || []).map((l) => ({
      key: l.key, name: l.label, count: meta.facets.bySponsorship?.[l.key] || 0,
    })),
    state.sponsorship,
    () => { state.page = 0; refreshAll() },
  )

  checklist(
    $('#groups'),
    meta.groups.map((g) => ({ key: g.key, name: g.name, count: meta.facets.byGroup[g.key] || 0 })),
    state.groups,
    () => { state.page = 0; refreshAll() },
  )

  checklist(
    $('#modes'),
    Object.entries(MODE_LABELS).map(([key, name]) => ({ key, name, count: meta.facets.byMode[key] || 0 })),
    state.modes,
    () => { state.page = 0; refreshAll() },
  )

  checklist(
    $('#types'),
    Object.entries(TYPE_LABELS).map(([key, name]) => ({ key, name, count: meta.facets.byEmploymentType[key] || 0 })),
    state.types,
    () => { state.page = 0; refreshAll() },
  )

  checklist(
    $('#sources'),
    Object.entries(SOURCE_LABELS)
      .filter(([key]) => meta.facets.bySource[key] || state.sources.has(key))
      .map(([key, name]) => ({ key, name, count: meta.facets.bySource[key] || 0 })),
    state.sources,
    () => { state.page = 0; refreshAll() },
  )
}

// Results

function jobCard(j) {
  const isNew = j.first_seen && Date.now() - new Date(j.first_seen).getTime() < 86400000
  const posted = j.posted_at || j.first_seen
  const salary = (j.salary_min || j.salary_max)
    ? `<span class="tag salary">${money(j.salary_min, j.salary_max, j.salary_currency)}</span>`
    : ''
  // Do not print "Remote" twice when the region bucket already says it.
  const showMode = j.work_mode && j.work_mode !== 'unspecified' && !(j.work_mode === 'remote' && j.region_key === 'remote')
  const mode = showMode
    ? `<span class="tag ${j.work_mode}">${MODE_LABELS[j.work_mode] || j.work_mode}</span>`
    : ''
  const jobType = j.employment_type && j.employment_type !== 'unspecified'
    ? `<span class="tag job-type ${j.employment_type}">${TYPE_LABELS[j.employment_type] || j.employment_type}</span>`
    : ''
  const sponsorLevel = j.sponsorship || 'unknown'
  const sponsor = sponsorLevel === 'unknown'
    ? ''
    : `<span class="tag visa ${sponsorLevel}" title="${esc(j.sponsorship_reasons || '')}">${SPONSOR_LABELS[sponsorLevel]}</span>`
  const availableSources = String(j.available_sources || j.source || '').split(',').filter(Boolean)
  const extraSources = Math.max(availableSources.length - 1, 0)
  const sourceText = `${SOURCE_LABELS[j.source] || j.source}${j.source_detail ? ` (${j.source_detail})` : ''}${extraSources ? ` + ${extraSources} other source${extraSources === 1 ? '' : 's'}` : ''}`

  const el = document.createElement('article')
  el.className = `job${j.is_saved ? ' is-saved' : ''}`
  el.innerHTML = `
    <div class="job-top">
      <a class="job-title" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a>
      <div class="job-actions">
        <button class="icon-btn save${j.is_saved ? ' on' : ''}">${j.is_saved ? 'Shortlisted' : 'Shortlist'}</button>
        <button class="icon-btn hide" title="Hide this listing">Hide</button>
      </div>
    </div>
    <div class="job-meta">
      ${j.company ? `<span class="company">${esc(j.company)}</span><span class="sep">·</span>` : ''}
      <span class="tag region">${esc(j.county_name || 'Unclassified')}</span>
      ${sponsor}
      ${mode}
      ${jobType}
      ${salary}
      ${isNew ? '<span class="tag new">New</span>' : ''}
    </div>
    ${j.description ? `<p class="job-snippet">${esc(j.description)}</p>` : ''}
    <div class="job-foot">
      <span>${esc(j.location_raw || '')}</span>
      ${posted ? `<span class="sep">·</span><span>${timeAgo(posted)}</span>` : ''}
      <span class="sep">·</span><span>${esc(sourceText)}</span>
    </div>`

  el.querySelector('.save').addEventListener('click', async (e) => {
    const on = !j.is_saved
    await fetch(`/api/jobs/${j.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved: on }),
    })
    j.is_saved = on ? 1 : 0
    e.target.classList.toggle('on', on)
    e.target.textContent = on ? 'Shortlisted' : 'Shortlist'
    el.classList.toggle('is-saved', on)
  })

  el.querySelector('.hide').addEventListener('click', async () => {
    await fetch(`/api/jobs/${j.id}/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true }),
    })
    el.style.display = 'none'
  })

  return el
}

const countFor = (qs) =>
  fetch(`/api/jobs?${qs}&limit=1`).then((r) => r.json()).then((d) => d.total).catch(() => 0)

// An empty list is nearly always one filter doing the damage rather than an empty
// database. Work out which one, say so plainly, and offer to undo it.
async function renderEmptyState(host) {
  const [ignoringDate, ignoringEverything] = await Promise.all([
    countFor(params({ days: 0 })),
    countFor(`${state.country ? `countries=${state.country}&` : ''}days=0&minScore=0`),
  ])

  if (ignoringEverything === 0) {
    host.innerHTML = `<div class="empty-state">
      <h3>There are no jobs stored yet</h3>
      <p>Press "Refresh now" in the top right to collect some. The first run takes a few minutes.</p>
    </div>`
    return
  }

  if (ignoringDate > 0 && Number(state.days) > 0) {
    const label = $('#days').selectedOptions[0]?.textContent || `${state.days} days`
    host.innerHTML = `<div class="empty-state">
      <h3>Nothing posted in the last ${label.toLowerCase()}</h3>
      <p>Your other filters match <strong>${ignoringDate.toLocaleString('en-IE')}</strong> older listings.
      The collection may not have run for a while.</p>
      <button class="btn" id="widenDate">Show these ${ignoringDate.toLocaleString('en-IE')} jobs</button>
    </div>`
    $('#widenDate').addEventListener('click', () => {
      state.days = '0'
      $('#days').value = '0'
      state.page = 0
      refreshAll()
    })
    return
  }

  host.innerHTML = `<div class="empty-state">
    <h3>Nothing matches those filters</h3>
    <p>There are <strong>${ignoringEverything.toLocaleString('en-IE')}</strong> jobs stored.
    Try lowering the match strength, clearing a region, or resetting the filters.</p>
    <button class="btn" id="resetFromEmpty">Reset all filters</button>
  </div>`
  $('#resetFromEmpty').addEventListener('click', () => $('#resetAll').click())
}

async function loadJobs() {
  const res = await fetch(`/api/jobs?${params()}`)
  const { total, rows, limit, offset } = await res.json()

  const host = $('#results')
  host.innerHTML = ''

  if (!rows.length) {
    await renderEmptyState(host)
    $('#count').textContent = 'No results'
    $('#pager').innerHTML = ''
    return
  }

  const frag = document.createDocumentFragment()
  for (const j of rows) frag.appendChild(jobCard(j))
  host.appendChild(frag)

  const from = offset + 1
  const to = Math.min(offset + limit, total)
  $('#count').innerHTML = `Showing <strong>${from} to ${to}</strong> of <strong>${total.toLocaleString('en-IE')}</strong> jobs`

  const pages = Math.ceil(total / limit)
  const pager = $('#pager')
  pager.innerHTML = ''
  if (pages > 1) {
    const prev = Object.assign(document.createElement('button'), { className: 'btn btn-quiet', textContent: 'Previous', disabled: state.page === 0 })
    const label = Object.assign(document.createElement('span'), { className: 'count', textContent: `Page ${state.page + 1} of ${pages}` })
    const next = Object.assign(document.createElement('button'), { className: 'btn btn-quiet', textContent: 'Next', disabled: state.page + 1 >= pages })
    prev.onclick = () => { state.page--; loadJobs(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    next.onclick = () => { state.page++; loadJobs(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    pager.append(prev, label, next)
  }
}

async function loadMeta() {
  const res = await fetch(`/api/meta?${params()}`)
  meta = await res.json()
  renderFilters()

  const s = meta.stats
  const when = meta.lastRun?.finished_at
  const here = meta.facets.byCountry?.[state.country] || 0
  const country = meta.countries.find((c) => c.code === state.country)?.name || ''
  $('#tagline').textContent =
    `${here.toLocaleString('en-IE')} in ${country} of ${s.total.toLocaleString('en-IE')} live listings` +
    ` · ${s.newLast24h} found today · ${s.saved} shortlisted` +
    (when ? ` · updated ${timeAgo(when)}` : '')
}

async function refreshAll() {
  saveState()
  $('#exportBtn').href = `/api/export.csv?${params()}`
  await Promise.all([loadMeta(), loadJobs()])
}

// Refresh polling

let pollTimer = null
async function pollRefresh() {
  const st = await fetch('/api/refresh/status').then((r) => r.json()).catch(() => null)
  const el = $('#runState')
  if (st?.active) {
    el.textContent = st.step || 'Working'
    el.classList.add('busy')
    $('#refreshBtn').disabled = true
    if (!pollTimer) pollTimer = setInterval(pollRefresh, 2500)
  } else {
    el.classList.remove('busy')
    $('#refreshBtn').disabled = false
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
      el.textContent = 'Updated'
      refreshAll()
      setTimeout(() => { if (!$('#runState').classList.contains('busy')) $('#runState').textContent = '' }, 4000)
    }
  }
}

// Wiring

function bind() {
  let t
  $('#q').addEventListener('input', (e) => {
    clearTimeout(t)
    t = setTimeout(() => { state.q = e.target.value.trim(); state.page = 0; refreshAll() }, 300)
  })

  for (const id of ['days', 'minScore', 'salaryMin', 'sort']) {
    $(`#${id}`).addEventListener('change', (e) => { state[id] = e.target.value; state.page = 0; refreshAll() })
  }

  $('#savedOnly').addEventListener('change', (e) => { state.savedOnly = e.target.checked; state.page = 0; refreshAll() })

  for (const btn of document.querySelectorAll('[data-clear]')) {
    btn.addEventListener('click', () => { state[btn.dataset.clear].clear(); state.page = 0; refreshAll() })
  }

  $('#resetAll').addEventListener('click', () => {
    state.regions.clear(); state.groups.clear(); state.modes.clear(); state.types.clear()
    state.sources.clear(); state.sponsorship.clear()
    state.q = ''; state.days = '14'; state.minScore = '10'; state.salaryMin = '0'; state.savedOnly = false; state.page = 0
    syncControls()
    refreshAll()
  })

  $('#refreshBtn').addEventListener('click', async () => {
    $('#refreshBtn').disabled = true
    $('#runState').textContent = 'Starting'
    $('#runState').classList.add('busy')
    await fetch('/api/refresh', { method: 'POST' })
    setTimeout(pollRefresh, 800)
  })
}

function syncControls() {
  $('#q').value = state.q
  $('#days').value = state.days
  $('#minScore').value = state.minScore
  $('#salaryMin').value = state.salaryMin
  $('#sort').value = state.sort
  $('#savedOnly').checked = state.savedOnly
}

loadState()
syncControls()
bind()
refreshAll()
pollRefresh()
setInterval(() => { if (!pollTimer) pollRefresh() }, 20000)

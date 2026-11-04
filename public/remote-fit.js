// The remote jobs page. In the local app it reads /api/remote-fit, which uses
// the private profile and answers this computer only. On the hosted site
// (marked by build-site.js) it reads data/remote-fit.json, checked against the
// standard Stamp 2 conditions, and keeps the shortlist in this browser.
const $ = (s) => document.querySelector(s)
const PUBLIC = document.querySelector('meta[name="oneless-mode"]')?.content === 'public'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const state = { q: '', scope: 'region', label: '', saved: false }
try { Object.assign(state, JSON.parse(localStorage.getItem('oneless.remote-fit') || '{}')) } catch {}

const STATUS = {
  ok: ['good', 'Advert supports it'],
  needs_verification: ['warn', 'Needs verification'],
  conflict: ['bad', 'Conflict'],
}
const LABEL_CLASS = { no_conflict_found: 'good', needs_verification: 'warn', conflict: 'bad' }
const TYPES = { part_time: 'Part-time', full_time: 'Full-time', full_or_part_time: 'Full-time / part-time options', contract: 'Contract', temporary: 'Temporary' }
const IRELAND = { stated: 'Ireland named', region: 'Europe-wide / worldwide', unknown: 'Location not stated' }

let rows = []

function card(r) {
  const f = r.fit
  const roleText = f.roles.families.map((x) => `${esc(x.name)} (title: ${x.terms.map(esc).join(', ')})`).join('; ')
  const skills = f.roles.skills.length ? ` Advert also mentions: ${f.roles.skills.map(esc).join(', ')}.` : ''
  const checks = f.checks.map((c) => `<tr>
      <th>${esc(c.name)}</th>
      <td class="st"><span class="tag ${STATUS[c.status][0]}">${STATUS[c.status][1]}</span></td>
      <td>${c.evidence ? `<q>${esc(c.evidence)}</q>` : `<span class="none">${c.key === 'permission' ? 'Not recorded in your profile' : 'Not stated in the advert'}</span>`}<span class="rule">${esc(c.rule)}</span></td>
    </tr>`).join('')
  const posted = r.posted_at || r.first_seen
  return `<li class="rf-card" data-id="${esc(r.id)}">
    <div class="rf-head">
      <div>
        <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></h3>
        <p class="rf-sub">${esc(r.company || 'Company not stated')} · ${esc(r.location_raw || 'Location not stated')}${posted ? ` · ${new Date(posted).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
      </div>
      <div class="rf-actions">
        <button class="btn${r.is_saved ? ' on' : ''}" data-save>${r.is_saved ? 'Shortlisted' : 'Shortlist'}</button>
        <a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">Advert</a>
      </div>
    </div>
    <div class="rf-tags">
      <span class="tag ${LABEL_CLASS[f.label]}">${esc(f.labelText)}</span>
      <span class="tag remote">${IRELAND[f.ireland] || ''}</span>
      ${TYPES[r.employment_type] ? `<span class="tag">${TYPES[r.employment_type]}</span>` : ''}
      ${f.roles.senior ? `<span class="tag outline">Title says “${esc(f.roles.senior)}”</span>` : ''}
      ${r.verification_status === 'open' ? '<span class="tag good">Advert verified open</span>' : '<span class="tag outline">Advert not verified open</span>'}
    </div>
    <p class="rf-why">Matches ${roleText}.${skills}</p>
    <table class="rf-checks">${checks}</table>
  </li>`
}

function render(data) {
  const p = data.profile || {}
  const perm = p.permission || {}
  $('#profileLine').innerHTML = PUBLIC
    ? 'Checked against the <b>standard Stamp 2</b> student conditions. Your own permission may carry different conditions, so check your IRP card and permission letter.'
    : p.configured
    ? `Matching <b>${esc((p.roleFamilies || []).join(', '))}</b>${p.programme ? ` and your studies (${esc(p.programme)}${p.programmeConfirmed ? '' : ', not yet confirmed'})` : ''}. Permission recorded: <b>${perm.stamp ? esc(perm.stamp) : 'none yet'}</b>${perm.expires ? `, expires ${esc(perm.expires)}` : ''}${perm.stamp && !perm.confirmed ? ' (not yet confirmed)' : ''}.`
    : ''
  const warnings = []
  if (PUBLIC) {}
  else if (!p.configured) warnings.push(`No private profile found${p.error ? ` (${esc(p.error)})` : ''}. Copy <code>profile.example.json</code> to <code>private/profile.json</code> and fill it in.`)
  else if (!perm.stamp) warnings.push('Your stamp is not recorded yet, so every result says <b>Needs verification</b>. Add your stamp, IRP card expiry and any extra conditions to <code>private/profile.json</code>.')
  else if (!perm.knownRules) warnings.push(`OneLess has no built-in rules for ${esc(perm.stamp)}. Compare each advert with your permission conditions yourself.`)
  $('#warnings').innerHTML = warnings.map((w) => `<p class="rf-warn">${w}</p>`).join('')

  const g = data.guidance || {}
  $('#foot').innerHTML = `<p>Rules compared with official guidance read on ${esc(g.checked || '')}: ${(g.sources || []).map((s) => `<a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · ')}. ${esc(g.silentOn || '')}</p>
    <p>This is a reading of advert text, not legal or immigration advice. Check the conditions on your own permission. OneLess never applies for jobs or contacts employers.</p>`

  if (!data.available) { $('#count').textContent = ''; $('#list').innerHTML = ''; return }
  rows = data.rows
  const c = data.counts
  const hidden = c.otherCountry ? ` ${c.otherCountry} more matched your roles but limit remote work to another country, so they are left out.` : ''
  const scoped = c.outOfScope ? ` ${c.outOfScope} more are outside the location option chosen.` : ''
  $('#count').textContent = `${data.total} remote ${data.total === 1 ? 'match' : 'matches'}${data.total > rows.length ? ` (first ${rows.length} shown)` : ''}: ${c.byLabel.no_conflict_found} no conflict found, ${c.byLabel.needs_verification} need verification, ${c.byLabel.conflict} conflict.${hidden}${scoped}`
  $('#list').innerHTML = rows.length ? rows.map(card).join('') : '<li class="rf-empty">No remote matches with these options.</li>'
}

const IRELAND_SCOPES = { ireland: ['stated'], region: ['stated', 'region'], all: ['stated', 'region', 'unknown'] }
const savedSet = () => { try { return new Set(JSON.parse(localStorage.getItem('oneless.saved') || '[]')) } catch { return new Set() } }
let published = null

// The hosted equivalent of /api/remote-fit, filtered here in the browser.
async function publicData() {
  published ||= fetch('data/remote-fit.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const all = await published
  if (!all) return null
  const saved = savedSet()
  const allowed = IRELAND_SCOPES[state.scope] || IRELAND_SCOPES.region
  const counts = { otherCountry: all.otherCountry || 0, outOfScope: 0, byLabel: { no_conflict_found: 0, needs_verification: 0, conflict: 0 } }
  const q = state.q.toLowerCase()
  const out = []
  for (const r of all.rows) {
    if (!allowed.includes(r.fit.ireland)) { counts.outOfScope++; continue }
    const row = { ...r, is_saved: saved.has(r.id) }
    if (state.saved && !row.is_saved) continue
    if (q && !`${r.title} ${r.company} ${r.location_raw}`.toLowerCase().includes(q)) continue
    counts.byLabel[r.fit.label]++
    if (state.label && r.fit.label !== state.label) continue
    out.push(row)
  }
  return { available: true, profile: { configured: true }, guidance: all.guidance, counts, total: out.length, rows: out.slice(0, 200) }
}

async function load() {
  try { localStorage.setItem('oneless.remote-fit', JSON.stringify(state)) } catch {}
  if (PUBLIC) {
    const data = await publicData()
    if (data) return render(data)
    $('#count').textContent = 'Remote jobs could not be loaded. Try again later.'
    return
  }
  const p = new URLSearchParams({ scope: state.scope })
  if (state.label) p.set('label', state.label)
  if (state.q) p.set('q', state.q)
  if (state.saved) p.set('saved', '1')
  const res = await fetch(`/api/remote-fit?${p}`).catch(() => null)
  if (!res || !res.ok) {
    $('#count').textContent = 'Remote for me is available only in the local OneLess app on your own computer.'
    $('#list').innerHTML = ''
    return
  }
  render(await res.json())
}

async function saveJob(id, on) {
  if (!PUBLIC) return fetch(`/api/jobs/${id}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: on }) })
  const saved = savedSet()
  if (on) saved.add(id); else saved.delete(id)
  try { localStorage.setItem('oneless.saved', JSON.stringify([...saved])) } catch {}
}

function setMode() {
  if (!PUBLIC) return
  document.title = 'OneLess · Remote jobs'
  $('.top h2').textContent = 'Remote jobs'
  const [lead, how] = $('#intro').children
  lead.innerHTML = '<strong>Remote jobs you can do from Ireland.</strong> Remote adverts in accounts, finance, data and project roles, compared with the work conditions of a Stamp 2 student permission.'
  how.innerHTML = 'A remote or part-time advert is never counted as compatible with a permission on that basis alone. Each check shows the advert wording it relied on. Anything the advert does not say is marked <b>Needs verification</b>.'
}

function bind() {
  $('#q').value = state.q
  $('#scope').value = state.scope
  $('#label').value = state.label
  $('#saved').classList.toggle('on', state.saved)
  $('#saved').setAttribute('aria-pressed', String(state.saved))
  let t
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); load() }, 250) })
  $('#scope').addEventListener('change', (e) => { state.scope = e.target.value; load() })
  $('#label').addEventListener('change', (e) => { state.label = e.target.value; load() })
  $('#saved').addEventListener('click', () => {
    state.saved = !state.saved
    $('#saved').classList.toggle('on', state.saved)
    $('#saved').setAttribute('aria-pressed', String(state.saved))
    load()
  })
  // The same shortlist as the main page, so saved jobs show up there too.
  $('#list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save]')
    if (!btn) return
    const id = btn.closest('[data-id]').dataset.id
    const row = rows.find((r) => r.id === id)
    const on = !row.is_saved
    await saveJob(id, on)
    row.is_saved = on
    btn.classList.toggle('on', on)
    btn.textContent = on ? 'Shortlisted' : 'Shortlist'
    if (state.saved && !on) load()
  })
}

setMode()
bind()
load()

// Maps a free-text location string from a job board onto an Irish county.
// Job boards write locations every possible way ("Dublin 2", "Athenry, Co Galway",
// "Southside Dublin", "United Kingdom - Ireland"), so this is keyword matching
// against a gazetteer of counties and their main towns, longest name first.

export const COUNTIES = [
  // Leinster
  { key: 'carlow', name: 'Carlow', province: 'Leinster', towns: ['Bagenalstown', 'Muine Bheag', 'Tullow', 'Carlow'] },
  { key: 'dublin', name: 'Dublin', province: 'Leinster', towns: [
    'Dun Laoghaire', 'Dunlaoghaire', 'Blanchardstown', 'Portmarnock', 'Ballsbridge', 'Rathfarnham',
    'Clondalkin', 'Balbriggan', 'Leopardstown', 'Palmerstown', 'Donnybrook', 'Stillorgan',
    'Sandyford', 'Blackrock', 'Rathcoole', 'Citywest', 'Ranelagh', 'Malahide', 'Tallaght',
    'Dundrum', 'Skerries', 'Finglas', 'Coolock', 'Saggart', 'Swords', 'Santry', 'Lucan',
    'Howth', 'IFSC', 'Dublin'] },
  { key: 'kildare', name: 'Kildare', province: 'Leinster', towns: [
    'Monasterevin', 'Newbridge', 'Celbridge', 'Maynooth', 'Leixlip', 'Rathangan', 'Kilcock',
    'Sallins', 'Curragh', 'Clane', 'Naas', 'Athy', 'Kildare'] },
  { key: 'kilkenny', name: 'Kilkenny', province: 'Leinster', towns: [
    'Graiguenamanagh', 'Castlecomer', 'Thomastown', 'Ferrybank', 'Callan', 'Kilkenny'] },
  { key: 'laois', name: 'Laois', province: 'Leinster', towns: [
    'Graiguecullen', 'Portarlington', 'Mountmellick', 'Portlaoise', 'Rathdowney', 'Abbeyleix', 'Laois'] },
  { key: 'longford', name: 'Longford', province: 'Leinster', towns: ['Edgeworthstown', 'Ballymahon', 'Granard', 'Longford'] },
  { key: 'louth', name: 'Louth', province: 'Leinster', towns: ['Carlingford', 'Drogheda', 'Dundalk', 'Dunleer', 'Ardee', 'Louth'] },
  { key: 'meath', name: 'Meath', province: 'Leinster', towns: [
    'Dunshaughlin', 'Bettystown', 'Ashbourne', 'Dunboyne', 'Laytown', 'Ratoath', 'Enfield',
    'Navan', 'Slane', 'Kells', 'Trim', 'Meath'] },
  { key: 'offaly', name: 'Offaly', province: 'Leinster', towns: ['Edenderry', 'Tullamore', 'Banagher', 'Clara', 'Birr', 'Offaly'] },
  { key: 'westmeath', name: 'Westmeath', province: 'Leinster', towns: [
    'Castlepollard', 'Mullingar', 'Kinnegad', 'Athlone', 'Moate', 'Westmeath'] },
  { key: 'wexford', name: 'Wexford', province: 'Leinster', towns: [
    'Enniscorthy', 'Bunclody', 'New Ross', 'Rosslare', 'Gorey', 'Wexford'] },
  { key: 'wicklow', name: 'Wicklow', province: 'Leinster', towns: [
    'Newtownmountkennedy', 'Blessington', 'Greystones', 'Baltinglass', 'Rathdrum', 'Arklow',
    'Bray', 'Wicklow'] },

  // Munster
  { key: 'clare', name: 'Clare', province: 'Munster', towns: [
    'Newmarket-on-Fergus', 'Sixmilebridge', 'Lisdoonvarna', 'Ennistymon', 'Shannon', 'Kilrush', 'Ennis', 'Clare'] },
  { key: 'cork', name: 'Cork', province: 'Munster', towns: [
    'Ringaskiddy', 'Ballincollig', 'Carrigaline', 'Clonakilty', 'Skibbereen', 'Charleville',
    'Little Island', 'Midleton', 'Macroom', 'Blarney', 'Bandon', 'Fermoy', 'Youghal',
    'Mallow', 'Bantry', 'Kinsale', 'Cobh', 'Cork'] },
  { key: 'kerry', name: 'Kerry', province: 'Munster', towns: [
    'Cahersiveen', 'Castleisland', 'Killorglin', 'Killarney', 'Listowel', 'Kenmare', 'Tralee', 'Dingle', 'Kerry'] },
  { key: 'limerick', name: 'Limerick', province: 'Munster', towns: [
    'Newcastle West', 'Abbeyfeale', 'Kilmallock', 'Castletroy', 'Annacotty', 'Rathkeale',
    'Raheen', 'Adare', 'Limerick'] },
  { key: 'tipperary', name: 'Tipperary', province: 'Munster', towns: [
    'Carrick-on-Suir', 'Templemore', 'Roscrea', 'Clonmel', 'Thurles', 'Nenagh', 'Cashel',
    'Cahir', 'Tipperary'] },
  { key: 'waterford', name: 'Waterford', province: 'Munster', towns: [
    'Dungarvan', 'Lismore', 'Tramore', 'Portlaw', 'Waterford'] },

  // Connacht
  { key: 'galway', name: 'Galway', province: 'Connacht', towns: [
    'Ballinasloe', 'Oughterard', 'Oranmore', 'Portumna', 'Loughrea', 'Athenry', 'Clifden',
    'Tuam', 'Gort', 'Galway'] },
  { key: 'leitrim', name: 'Leitrim', province: 'Connacht', towns: [
    'Carrick-on-Shannon', 'Manorhamilton', 'Ballinamore', 'Drumshanbo', 'Leitrim'] },
  { key: 'mayo', name: 'Mayo', province: 'Connacht', towns: [
    'Charlestown', 'Claremorris', 'Ballinrobe', 'Belmullet', 'Castlebar', 'Swinford',
    'Westport', 'Ballina', 'Knock', 'Mayo'] },
  { key: 'roscommon', name: 'Roscommon', province: 'Connacht', towns: [
    'Ballaghaderreen', 'Castlerea', 'Monksland', 'Roscommon', 'Boyle'] },
  { key: 'sligo', name: 'Sligo', province: 'Connacht', towns: ['Tubbercurry', 'Enniscrone', 'Ballymote', 'Sligo'] },

  // Ulster (Republic of Ireland)
  { key: 'cavan', name: 'Cavan', province: 'Ulster (ROI)', towns: [
    'Ballyjamesduff', 'Bailieborough', 'Cootehill', 'Virginia', 'Cavan'] },
  { key: 'donegal', name: 'Donegal', province: 'Ulster (ROI)', towns: [
    'Ballybofey', 'Carndonagh', 'Letterkenny', 'Buncrana', 'Bundoran', 'Dungloe', 'Lifford', 'Donegal'] },
  { key: 'monaghan', name: 'Monaghan', province: 'Ulster (ROI)', towns: [
    'Carrickmacross', 'Castleblayney', 'Ballybay', 'Clones', 'Monaghan'] },

  // Northern Ireland, so cross-border listings get classified rather than dumped in Unknown
  { key: 'antrim', name: 'Antrim', province: 'Northern Ireland', towns: [
    'Carrickfergus', 'Ballymena', 'Lisburn', 'Belfast', 'Antrim', 'Larne'] },
  { key: 'armagh', name: 'Armagh', province: 'Northern Ireland', towns: [
    'Craigavon', 'Portadown', 'Lurgan', 'Armagh', 'Newry'] },
  { key: 'down', name: 'Down', province: 'Northern Ireland', towns: [
    'Newtownards', 'Downpatrick', 'Holywood', 'Bangor'] },
  { key: 'fermanagh', name: 'Fermanagh', province: 'Northern Ireland', towns: ['Enniskillen', 'Fermanagh'] },
  { key: 'derry', name: 'Derry', province: 'Northern Ireland', towns: [
    'Londonderry', 'Limavady', 'Coleraine', 'Derry'] },
  { key: 'tyrone', name: 'Tyrone', province: 'Northern Ireland', towns: [
    'Cookstown', 'Dungannon', 'Strabane', 'Omagh', 'Tyrone'] },
]

// Boards often give a province rather than a county ("Software Engineer, Leinster"),
// so each province gets a bucket of its own that still sorts under the right heading.
export const PROVINCE_WIDE = [
  { key: 'leinster-any', name: 'Leinster (county not stated)', province: 'Leinster', match: /\bleinster\b/i },
  { key: 'munster-any', name: 'Munster (county not stated)', province: 'Munster', match: /\bmunster\b/i },
  { key: 'connacht-any', name: 'Connacht (county not stated)', province: 'Connacht', match: /\b(connacht|connaught)\b/i },
  { key: 'ulster-any', name: 'Ulster (county not stated)', province: 'Ulster (ROI)', match: /\bulster\b/i },
]

// Pseudo-regions that are not counties but that you still want to filter on.
export const SPECIAL_REGIONS = [
  { key: 'remote', name: 'Remote', province: 'Anywhere' },
  { key: 'nationwide', name: 'Ireland (nationwide)', province: 'Anywhere' },
  { key: 'unknown', name: 'Unclassified', province: 'Anywhere' },
]

export const PROVINCE_ORDER = ['Leinster', 'Munster', 'Connacht', 'Ulster (ROI)', 'Northern Ireland', 'Anywhere']

// One flat match table, longest phrase first so "Carrick-on-Shannon" wins over "Carrick"
// and "Newcastle West" wins over any bare "Newcastle".
const MATCHERS = COUNTIES
  .flatMap((c) => c.towns.map((t) => ({ term: t.toLowerCase(), county: c })))
  .sort((a, b) => b.term.length - a.term.length)
  .map((m) => ({
    county: m.county,
    re: new RegExp(`(^|[^a-z0-9])${m.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i'),
  }))

const REMOTE_RE = /\b(remote|work from home|wfh|anywhere|distributed|telecommut)/i
const IRELAND_RE = /\b(ireland|ire|eire|éire|roi)\b/i

// There is a Dublin in Ohio and California, a Bangor in Wales, a Limerick in
// Pennsylvania. If the string names somewhere clearly not Ireland and never says
// Ireland, do not claim the county.
const NOT_IRELAND = /\b(oh|ca|ny|pa|va|tx|ga|nh|usa|u\.s\.a?\.?|united states|ohio|california|texas|georgia|virginia|pennsylvania|new hampshire|new york|canada|australia|india|wales|scotland|england|germany|france|spain|netherlands|poland|portugal)\b/i

export function resolveRegion(locationRaw, extra = '') {
  const loc = String(locationRaw || '').trim()
  const hay = loc || String(extra || '')

  if (!hay) return special('unknown')

  const saysIreland = IRELAND_RE.test(hay)
  const saysElsewhere = NOT_IRELAND.test(hay)

  if (!saysElsewhere || saysIreland) {
    // A named county beats a "remote" tag: "Remote (Dublin)" is a Dublin job.
    for (const m of MATCHERS) {
      if (m.re.test(hay)) {
        return {
          regionKey: m.county.key,
          countyName: m.county.name,
          province: m.county.province,
        }
      }
    }
    for (const p of PROVINCE_WIDE) {
      if (p.match.test(hay)) return { regionKey: p.key, countyName: p.name, province: p.province }
    }
  }

  if (saysElsewhere && !saysIreland) return special('unknown')
  if (REMOTE_RE.test(hay)) return special('remote')
  if (saysIreland) return special('nationwide')
  return special('unknown')
}

function special(key) {
  const s = SPECIAL_REGIONS.find((r) => r.key === key)
  return { regionKey: s.key, countyName: s.name, province: s.province }
}

export function allRegions() {
  return [
    ...COUNTIES.map((c) => ({ key: c.key, name: c.name, province: c.province })),
    ...PROVINCE_WIDE.map((p) => ({ key: p.key, name: p.name, province: p.province })),
    ...SPECIAL_REGIONS.map((s) => ({ key: s.key, name: s.name, province: s.province })),
  ]
}

// Detects whether a listing is onsite, hybrid or fully remote from its text.
export function detectWorkMode(title, description, locationRaw) {
  const hay = `${title || ''} ${locationRaw || ''} ${description || ''}`.toLowerCase()
  if (/\bhybrid\b/.test(hay)) return 'hybrid'
  if (/\b(fully remote|100% remote|remote[- ]first|work from home|wfh)\b/.test(hay)) return 'remote'
  if (/\bremote\b/.test(hay)) return 'remote'
  if (/\b(on[- ]?site|onsite|in[- ]office)\b/.test(hay)) return 'onsite'
  return 'unspecified'
}

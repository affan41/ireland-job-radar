// Maps a free-text location string from a job board onto a county, district or
// locality in one of the countries the radar covers.
// Job boards write locations every possible way ("Dublin 2", "Athenry, Co Galway",
// "Southside Dublin", "Valletta, Malta Island", "Limassol"), so this is keyword
// matching against a gazetteer of places, longest name first.

const IRISH_COUNTIES = [
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

// Cyprus, by district. Limassol is the forex, fintech and shipping cluster and
// Nicosia is where the audit and practice firms sit, so those two carry most of
// what is worth seeing.
const CYPRUS_DISTRICTS = [
  { key: 'nicosia', name: 'Nicosia', province: 'Cyprus', towns: [
    'Aglantzia', 'Strovolos', 'Lakatamia', 'Latsia', 'Dali', 'Engomi', 'Egkomi',
    'Kaimakli', 'Anthoupoli', 'Lefkosia', 'Nicosia'] },
  { key: 'limassol', name: 'Limassol', province: 'Cyprus', towns: [
    'Germasogeia', 'Mesa Geitonia', 'Agios Athanasios', 'Ypsonas', 'Kolossi',
    'Pareklisia', 'Zakaki', 'Lemesos', 'Limassol'] },
  { key: 'larnaca', name: 'Larnaca', province: 'Cyprus', towns: [
    'Aradippou', 'Livadia', 'Dromolaxia', 'Oroklini', 'Larnaka', 'Larnaca'] },
  { key: 'paphos', name: 'Paphos', province: 'Cyprus', towns: [
    'Peyia', 'Pegeia', 'Chloraka', 'Geroskipou', 'Polis Chrysochous', 'Pafos', 'Paphos'] },
  { key: 'famagusta', name: 'Famagusta', province: 'Cyprus', towns: [
    'Ayia Napa', 'Agia Napa', 'Paralimni', 'Protaras', 'Deryneia', 'Sotira', 'Famagusta'] },
]

// Malta, by its six official regions. The island is small enough that most adverts
// just say "Malta", but the iGaming and fintech employers cluster hard around
// Sliema, St Julian's and the Central Business District in Birkirkara.
const MALTA_REGIONS = [
  { key: 'malta-northern-harbour', name: 'Northern Harbour (Sliema, St Julian’s)', province: 'Malta', towns: [
    'Saint Julian', 'St Julian', "St. Julian's", 'San Giljan', 'Paceville', 'Sliema',
    'Gzira', 'Ta’ Xbiex', 'Ta Xbiex', 'Msida', 'Pieta', 'Birkirkara', 'Mriehel',
    'Central Business District', 'San Gwann', 'Swieqi', 'Santa Venera', 'Hamrun',
    'Qormi', 'Gharghur', 'Pembroke'] },
  { key: 'malta-southern-harbour', name: 'Southern Harbour (Valletta, Floriana)', province: 'Malta', towns: [
    'Valletta', 'Floriana', 'Marsa', 'Paola', 'Fgura', 'Tarxien', 'Zabbar', 'Kalkara',
    'Vittoriosa', 'Birgu', 'Senglea', 'Isla', 'Cospicua', 'Bormla', 'Xghajra', 'Santa Lucija'] },
  { key: 'malta-central', name: 'Central Malta (Mosta, Attard)', province: 'Malta', towns: [
    'Mosta', 'Naxxar', 'Attard', 'Balzan', 'Lija', 'Iklin', 'Gharghur'] },
  { key: 'malta-northern', name: 'Northern Malta (Mellieha, St Paul’s Bay)', province: 'Malta', towns: [
    'Mellieha', 'Saint Paul’s Bay', "St Paul's Bay", 'San Pawl il-Bahar', 'Bugibba',
    'Qawra', 'Xemxija', 'Mgarr'] },
  { key: 'malta-south-eastern', name: 'South Eastern Malta (Birzebbuga, Marsaxlokk)', province: 'Malta', towns: [
    'Birzebbuga', 'Marsaxlokk', 'Marsascala', 'Zejtun', 'Ghaxaq', 'Gudja', 'Luqa',
    'Kirkop', 'Mqabba', 'Qrendi', 'Safi', 'Zurrieq'] },
  { key: 'malta-western', name: 'Western Malta (Zebbug, Siggiewi)', province: 'Malta', towns: [
    'Zebbug', 'Siggiewi', 'Dingli', 'Mtarfa', 'Mdina', 'Bahrija'] },
  { key: 'malta-gozo', name: 'Gozo and Comino', province: 'Malta', towns: [
    'Xewkija', 'Xaghra', 'Nadur', 'Marsalforn', 'Sannat', 'Fontana', 'Ghajnsielem',
    'Qala', 'Zebbug Gozo', 'Comino', 'Gozo'] },
]

// Places whose names are not unique to the country ("Rabat" is in Morocco too,
// "Victoria" is all over the world). These only count when the advert also names
// the country, so a job in Victoria, Australia is not filed under Gozo.
const AMBIGUOUS_TOWNS = {
  'malta-western': ['Rabat'],
  'malta-gozo': ['Victoria'],
  'malta-northern-harbour': ['Pieta'],
}

export const COUNTIES = [
  ...IRISH_COUNTIES.map((c) => ({ ...c, country: 'ie' })),
  ...CYPRUS_DISTRICTS.map((c) => ({ ...c, country: 'cy' })),
  ...MALTA_REGIONS.map((c) => ({ ...c, country: 'mt' })),
].map((c) => ({ ...c, strictTowns: AMBIGUOUS_TOWNS[c.key] || [] }))

// Boards often give a province rather than a county ("Software Engineer, Leinster"),
// so each province gets a bucket of its own that still sorts under the right heading.
export const PROVINCE_WIDE = [
  { key: 'leinster-any', name: 'Leinster (county not stated)', province: 'Leinster', country: 'ie', match: /\bleinster\b/i },
  { key: 'munster-any', name: 'Munster (county not stated)', province: 'Munster', country: 'ie', match: /\bmunster\b/i },
  { key: 'connacht-any', name: 'Connacht (county not stated)', province: 'Connacht', country: 'ie', match: /\b(connacht|connaught)\b/i },
  { key: 'ulster-any', name: 'Ulster (county not stated)', province: 'Ulster (ROI)', country: 'ie', match: /\bulster\b/i },
  { key: 'cyprus-any', name: 'Cyprus (district not stated)', province: 'Cyprus', country: 'cy', match: /\b(cyprus|kypros|κύπρος)\b/i },
  { key: 'malta-any', name: 'Malta (locality not stated)', province: 'Malta', country: 'mt', match: /\bmalta\b/i },
]

// Pseudo-regions that are not counties but that you still want to filter on.
export const SPECIAL_REGIONS = [
  { key: 'remote', name: 'Remote', province: 'Anywhere', country: null },
  { key: 'nationwide', name: 'Ireland (nationwide)', province: 'Anywhere', country: 'ie' },
  { key: 'unknown', name: 'Unclassified', province: 'Anywhere', country: null },
]

export const PROVINCE_ORDER = [
  'Leinster', 'Munster', 'Connacht', 'Ulster (ROI)', 'Northern Ireland',
  'Cyprus', 'Malta', 'Anywhere',
]

// The countries the radar searches. Ireland is home turf; Cyprus and Malta are the
// two other English-speaking EU markets that routinely hire third-country nationals
// into finance and professional services.
export const COUNTRIES = [
  { code: 'ie', name: 'Ireland', match: /\b(ireland|ire|eire|éire|roi|irish)\b/i, provinces: ['Leinster', 'Munster', 'Connacht', 'Ulster (ROI)', 'Northern Ireland'] },
  { code: 'cy', name: 'Cyprus', match: /\b(cyprus|cypriot|kypros|κύπρος)\b/i, provinces: ['Cyprus'] },
  { code: 'mt', name: 'Malta', match: /\b(malta|maltese|gozo)\b/i, provinces: ['Malta'] },
]

export function detectCountry(text) {
  const hay = String(text || '')
  for (const c of COUNTRIES) if (c.match.test(hay)) return c.code
  return null
}

const termRe = (term) => new RegExp(
  `(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
  'i',
)

// One flat match table, longest phrase first so "Carrick-on-Shannon" wins over "Carrick"
// and "Newcastle West" wins over any bare "Newcastle". Places whose names are shared
// with somewhere abroad are held back until the advert names the country.
const MATCHERS = COUNTIES
  .flatMap((c) => [
    ...c.towns.map((t) => ({ term: t.toLowerCase(), county: c, strict: false })),
    ...c.strictTowns.map((t) => ({ term: t.toLowerCase(), county: c, strict: true })),
  ])
  .sort((a, b) => b.term.length - a.term.length)
  .map((m) => ({ county: m.county, strict: m.strict, re: termRe(m.term) }))

const REMOTE_RE = /\b(remote|work from home|wfh|anywhere|distributed|telecommut)/i

// There is a Dublin in Ohio and California, a Bangor in Wales, a Limerick in
// Pennsylvania. If the string names somewhere clearly not one of our countries and
// never names one of them, do not claim the region.
const ELSEWHERE = /\b(oh|ca|ny|pa|va|tx|ga|nh|usa|u\.s\.a?\.?|united states|ohio|california|texas|georgia|virginia|pennsylvania|new hampshire|new york|canada|australia|india|wales|scotland|england|germany|france|spain|netherlands|poland|portugal|greece|morocco|italy|dubai|uae)\b/i

export function resolveRegion(locationRaw, extra = '') {
  const loc = String(locationRaw || '').trim()
  const hay = loc || String(extra || '')

  if (!hay) return special('unknown')

  const named = detectCountry(hay)
  const saysElsewhere = ELSEWHERE.test(hay)

  if (!saysElsewhere || named) {
    // A named place beats a "remote" tag: "Remote (Dublin)" is a Dublin job.
    for (const m of MATCHERS) {
      // When the advert names a country, only that country's places may match, so
      // "Limassol" never wins in a listing that says Ireland.
      if (named && m.county.country !== named) continue
      if (m.strict && m.county.country !== named) continue
      if (m.re.test(hay)) {
        return {
          regionKey: m.county.key,
          countyName: m.county.name,
          province: m.county.province,
          country: m.county.country,
        }
      }
    }
    for (const p of PROVINCE_WIDE) {
      if (named && p.country !== named) continue
      if (p.match.test(hay)) {
        return { regionKey: p.key, countyName: p.name, province: p.province, country: p.country }
      }
    }
  }

  if (saysElsewhere && !named) return special('unknown')
  if (REMOTE_RE.test(hay)) return { ...special('remote'), country: named }
  if (named === 'ie') return special('nationwide')
  if (named === 'cy') return { regionKey: 'cyprus-any', countyName: 'Cyprus (district not stated)', province: 'Cyprus', country: 'cy' }
  if (named === 'mt') return { regionKey: 'malta-any', countyName: 'Malta (locality not stated)', province: 'Malta', country: 'mt' }
  return special('unknown')
}

function special(key) {
  const s = SPECIAL_REGIONS.find((r) => r.key === key)
  return { regionKey: s.key, countyName: s.name, province: s.province, country: s.country }
}

// A "Dublin" that sits next to a US state is Dublin, Ohio or Dublin, California.
const FALSE_DUBLIN = /\b(oh|ca|usa|u\.s\.|united states|ohio|california|georgia|texas|virginia|pennsylvania|new hampshire)\b/i
const ROI = new Set(['Leinster', 'Munster', 'Connacht', 'Ulster (ROI)'])

// Whether a raw location string from an employer feed describes a job on this island.
// Used to filter the worldwide employer boards down to the ones you could actually take.
export function isIrishLocation(locationText, { includeNorthernIreland = true, includeNationwide = true } = {}) {
  const loc = String(locationText || '')
  if (!loc) return false
  const r = resolveRegion(loc)
  if (r.regionKey === 'nationwide') return includeNationwide
  const irish = ROI.has(r.province) || (includeNorthernIreland && r.province === 'Northern Ireland')
  if (!irish) return false
  if (FALSE_DUBLIN.test(loc) && !/\bireland\b/i.test(loc)) return false
  return true
}

// Same question as isIrishLocation, for whichever country you are looking at.
export function isInCountry(locationText, code, { includeNationwide = true } = {}) {
  if (code === 'ie') return isIrishLocation(locationText, { includeNationwide })
  const loc = String(locationText || '')
  if (!loc) return false
  const country = COUNTRIES.find((c) => c.code === code)
  if (!country) return false
  const r = resolveRegion(loc)
  if (r.country !== code) return false
  if (!includeNationwide && r.regionKey.endsWith('-any')) return false
  return country.provinces.includes(r.province)
}

// When a feed tells us which country it searched but the town is not in the
// gazetteer, file it under that country rather than throwing it away.
export function countryFallback(code) {
  // Ireland's country-wide bucket is a special region, not one of the province ones.
  if (code === 'ie') return special('nationwide')
  const bucket = PROVINCE_WIDE.find((p) => p.country === code && p.key.endsWith('-any'))
  if (bucket) return { regionKey: bucket.key, countyName: bucket.name, province: bucket.province, country: code }
  return special('unknown')
}

export function allRegions() {
  return [
    ...COUNTIES.map((c) => ({ key: c.key, name: c.name, province: c.province, country: c.country })),
    ...PROVINCE_WIDE.map((p) => ({ key: p.key, name: p.name, province: p.province, country: p.country })),
    ...SPECIAL_REGIONS.map((s) => ({ key: s.key, name: s.name, province: s.province, country: s.country })),
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

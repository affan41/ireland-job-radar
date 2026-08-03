// Works out how likely a listing is to be open to someone who needs a work permit.
//
// This reads what the advert actually says, plus what kind of employer is behind it.
// It is a signal, not a promise: an employer that has sponsored a hundred people can
// still say no to the hundred and first, and an advert that says nothing either way
// is genuinely unknown until you ask them.

const LEVELS = {
  explicit: { key: 'explicit', label: 'Sponsorship mentioned', rank: 3 },
  likely: { key: 'likely', label: 'Likely to sponsor', rank: 2 },
  unknown: { key: 'unknown', label: 'Not stated', rank: 1 },
  unlikely: { key: 'unlikely', label: 'Says no sponsorship', rank: 0 },
}

export const SPONSORSHIP_LEVELS = Object.values(LEVELS)
  .sort((a, b) => b.rank - a.rank)
  .map(({ key, label }) => ({ key, label }))

// The advert says, in so many words, that it will help with a permit.
const SAYS_YES = [
  [/\bvisa sponsorship\b/i, 'advert mentions visa sponsorship'],
  [/\bsponsorship (?:is )?(?:available|provided|offered|possible|considered|on offer)\b/i, 'advert offers sponsorship'],
  [/\bwe (?:will |can |do |are able to |are happy to )?sponsor\b/i, 'employer says it sponsors'],
  [/\b(?:will|can|happy to|able to) sponsor\b/i, 'employer says it sponsors'],
  [/\bwork(?:ing)? (?:permit|visa)s? (?:will be |are |is )?(?:provided|sponsored|supported|arranged|covered)\b/i, 'work permit provided'],
  [/\b(?:visa|work permit|immigration) (?:support|assistance|help)\b/i, 'visa support offered'],
  [/\bassist(?:ance)?(?: you)? with (?:the |your )?(?:visa|work permit|relocation|immigration)\b/i, 'help with visa or relocation'],
  [/\brelocation (?:package|support|assistance|allowance|bonus|help)\b/i, 'relocation package offered'],
  [/\bwe relocate\b|\brelocation to (?:ireland|malta|cyprus)\b/i, 'relocation offered'],
  [/\bcritical skills (?:employment )?permit\b/i, 'names the Irish critical skills permit'],
  [/\bgeneral employment permit\b/i, 'names an Irish employment permit'],
  [/\bkey employee initiative\b/i, 'names the Maltese Key Employee Initiative'],
  // Left case sensitive on purpose, so the abbreviation does not match inside a word.
  [/\bKEI\b/, 'names the Maltese Key Employee Initiative'],
  [/\bsingle permit\b/i, 'names the single work permit route'],
  [/\bthird[- ]country national/i, 'advert addresses third-country nationals'],
  [/\bEU blue card\b/i, 'names the EU Blue Card'],
  [/\bwe welcome (?:applications from )?(?:international|overseas|candidates from all)/i, 'welcomes international applicants'],
  [/\bopen to (?:candidates|applicants) (?:from )?(?:outside|overseas|abroad|worldwide)/i, 'open to overseas candidates'],
]

// The advert rules out anyone who is not already allowed to work there.
const SAYS_NO = [
  [/\bno (?:visa )?sponsorship\b/i, 'advert says no sponsorship'],
  [/\bsponsorship is not (?:available|provided|offered|possible)\b/i, 'advert says no sponsorship'],
  [/\b(?:unable|not able|cannot|can ?not|won'?t|do not|does not|will not) (?:to )?(?:provide |offer |consider )?sponsor/i, 'employer says it cannot sponsor'],
  [/\bwithout(?: the need for)? sponsorship\b/i, 'requires no need for sponsorship'],
  [/\bmust (?:already )?(?:have|hold|possess)(?: the| a| an)?(?: valid| existing| full)? (?:right to work|work (?:permit|authorisation|authorization)|permission to work)\b/i, 'existing right to work required'],
  [/\b(?:valid |existing |current )?(?:right to work|permission to work|work authorisation|work authorization) in (?:ireland|malta|cyprus|the eu|the eea)\b[^.]{0,60}\b(?:required|essential|necessary|mandatory|must)\b/i, 'existing right to work required'],
  [/\b(?:only|exclusively) (?:open to |accepting )?(?:eu|eea|irish|maltese|cypriot)(?:\/eea)? (?:citizens|nationals|passport holders)\b/i, 'restricted to EU or national citizens'],
  // The same restriction with the qualifier trailing: "open to EU citizens only".
  [/\b(?:eu|eea|irish|maltese|cypriot)(?:\/eea)? (?:citizens|nationals|passport holders)\b[^.]{0,24}\bonly\b/i, 'restricted to EU or national citizens'],
  [/\bmust be (?:an? )?(?:eu|eea|irish|maltese|cypriot) (?:citizen|national)\b/i, 'restricted to EU or national citizens'],
  [/\bstamp ?4\b/i, 'requires an existing Irish Stamp 4'],
  [/\beligible to work in (?:ireland|malta|cyprus|the eu)\b[^.]{0,40}\b(?:required|must|essential)\b/i, 'existing work eligibility required'],
]

// Employers with an established record of moving people across borders. Big Four and
// the fund administrators run formal mobility programmes; the Malta iGaming operators
// and the Limassol brokers are built almost entirely on relocated staff.
const KNOWN_SPONSORS = [
  [/\b(?:ernst\s*&\s*young|\bEY\b|pwc|pricewaterhouse|kpmg|deloitte|grant thornton|\bBDO\b|mazars|forvis|\bRSM\b|baker tilly|crowe|moore |\bUHY\b|nexia)\b/i, 'Big Four or international practice firm'],
  [/\b(apex group|alter domus|citco|\bIQ-?EQ\b|waystone|carne group|\bTMF\b|vistra|\bCSC\b|ocorian|zedra|trident trust|intertrust|maples|walkers|sanne|aztec group|langham hall)\b/i, 'international fund administrator'],
  [/\b(betsson|tipico|kindred|unibet|evolution|leovegas|pokerstars|flutter|gaming innovation|catena media|videoslots|bet365|yolo group|push gaming|play'?n ?go|pragmatic play|greentube|betfair|entain|888|gamesys|sportradar|superbet|betclic|n1 interactive|hero gaming|blexr|raketech)\b/i, 'Malta iGaming operator, routinely relocates staff'],
  [/\b(\bXM\b|exness|fxpro|\bIC Markets\b|plus500|etoro|admirals|deriv|ironfx|easymarkets|libertex|tickmill|hotforex|\bHFM\b|forextime|\bFXTM\b|amana|\bNAGA\b|capital\.com|\bXTB\b|octafx|swissquote|\bFXCM\b|pepperstone|eightcap|vantage markets)\b/i, 'Limassol broker, routinely relocates staff'],
  [/\b(trustly|truevo|papaya|finance incorporated|ecabs|revolut|wise|paysafe|nium|payoneer|checkout\.com|moonpay|crypto\.com|binance|bitpanda|kraken|sumsub|wrike|spotware|playtech|nexters|wargaming|\bJetBrains\b|amdocs|\bTSYS\b|\bEPAM\b|thunderbird|melsoft)\b/i, 'international fintech or tech employer, routinely relocates staff'],
  [/\b(accenture|ibm|microsoft|google|amazon|apple|meta|oracle|\bSAP\b|salesforce|intel|dell|cisco|adobe|servicenow|workday|nvidia|analog devices|medtronic|pfizer|stryker|boston scientific|abbott|abbvie|\bMSD\b|merck|eli lilly|amgen|regeneron|astrazeneca|\bGSK\b|takeda|bristol myers|novartis|sanofi|thermo fisher|\bICON plc\b|citi|\bBNY\b|jpmorgan|bank of america|morgan stanley|state street|northern trust|fidelity|mastercard|visa inc|stripe|intercom|datadog|mongodb|cloudflare|twilio|elastic|hubspot|zendesk|paypal|ebay)\b/i, 'multinational with an internal mobility programme'],
]

// In Cyprus and Malta most finance vacancies are advertised through agencies rather
// than by the employer, and these particular ones specialise in placing people who
// are moving to the island. That is a different thing from the employer promising a
// permit, so it gets its own wording rather than being folded in with the rest.
const RELOCATION_RECRUITERS = /\b(careerfinders|\bGRS Recruitment\b|staffmatters|emerald zebra|boston link|archer it|ceek|broadwing|outreach recruitment|techbiz|work channel|nordic recruiters|aims international|jobmatchingpartner|heroix|\bTTI International\b|konnekt|castille|vacancycentre|\bVC\b Malta|quad consultancy|betters|pentasia|red acre|weloveit|itzoo|golden careers|\bCPS Cyprus\b|hrinnovate|smartrecruitmentcy|paphos jobs|libra recruitment)\b/i

// Roles that are routinely filled from outside the EU because the local market is
// short of them. Applies to the reader's own field: qualified accountancy and tax.
const SHORTAGE_ROLE = /\b(?:acca|\bACA\b|\bCPA\b|\bCIMA\b|chartered accountant|certified accountant|qualified accountant|senior accountant|financial accountant|management accountant|financial controller|audit (?:senior|manager|supervisor)|tax (?:senior|manager|consultant|advisor|adviser|accountant)|transfer pricing|statutory report|\bIFRS\b|fund accountant|corporate services)\b/i

const clip = (list) => [...new Set(list)].slice(0, 4)

export function assessSponsorship({
  title = '',
  description = '',
  company = '',
  source = '',
  country = '',
} = {}) {
  const advert = `${title} ${description}`
  const who = String(company || '')

  const no = SAYS_NO.filter(([re]) => re.test(advert)).map(([, why]) => why)
  if (no.length) return { level: 'unlikely', label: LEVELS.unlikely.label, reasons: clip(no) }

  const yes = SAYS_YES.filter(([re]) => re.test(advert)).map(([, why]) => why)
  if (yes.length) return { level: 'explicit', label: LEVELS.explicit.label, reasons: clip(yes) }

  const employer = KNOWN_SPONSORS.filter(([re]) => re.test(who)).map(([, why]) => why)

  // Only in the two islands, where this is genuinely what these agencies do. The
  // same names in Ireland are ordinary recruiters and say nothing about a permit.
  if ((country === 'cy' || country === 'mt') && RELOCATION_RECRUITERS.test(who)) {
    employer.push('agency that specialises in placing people relocating here')
  }

  // A listing read straight off a multinational's own careers site is a better bet
  // than the same role seen through an aggregator, because those employers are the
  // ones with a legal team that already knows how to do this.
  if (!employer.length && source === 'employer') employer.push('read directly from the employer’s own careers site')

  if (employer.length) {
    const reasons = [...employer]
    if (SHORTAGE_ROLE.test(title)) reasons.push('qualified finance role, commonly hired from abroad')
    return { level: 'likely', label: LEVELS.likely.label, reasons: clip(reasons) }
  }

  return { level: 'unknown', label: LEVELS.unknown.label, reasons: [] }
}

// What the advert cannot tell you: which permit you would actually be applying for.
export const PERMIT_NOTES = {
  ie: {
    name: 'Ireland',
    note: 'Employment permits are applied for by the employer. Accountancy and tax roles usually go through the General Employment Permit, and some qualify for the Critical Skills Permit above the salary threshold.',
    link: 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/',
  },
  cy: {
    name: 'Cyprus',
    note: 'Third-country nationals need a work permit tied to an employer. Companies registered as Foreign Interest Companies, which covers most Limassol brokers and fintechs, have a faster route and higher quotas.',
    link: 'https://www.businessincyprus.gov.cy/employment-of-third-country-nationals/',
  },
  mt: {
    name: 'Malta',
    note: 'Third-country nationals need a Single Permit, applied for by the employer through Identita. The Key Employee Initiative fast-tracks it to about five working days for specialist roles.',
    link: 'https://www.identita.gov.mt/single-permit/',
  },
}

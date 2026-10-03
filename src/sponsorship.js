// Only explicit advert statements establish sponsorship; employer size, source
// and relocation benefits are not evidence that this vacancy offers a permit.
export const SPONSORSHIP_LEVELS = [
  {key:'explicit',label:'Sponsorship offered',rank:2},
  {key:'unknown',label:'Not stated',rank:1},
  {key:'unlikely',label:'Sponsorship unavailable',rank:0},
]
export function assessSponsorship({title = '', description = '', url = null} = {}) {
  const text = `${title}. ${description}`
  const no = /\b(?:no visa sponsorship|(?:unable|not able|cannot|will not|do not) (?:to )?(?:provide |offer )?(?:visa )?sponsor(?:ship)?|sponsorship (?:is )?not (?:available|provided|offered))\b/i
  const yes = /\b(?:visa sponsorship (?:is )?(?:available|provided|offered)|(?:we|employer) (?:will|can) sponsor (?:your )?(?:visa|work permit)|(?:work|employment) permits? (?:will be |is |are )?(?:provided|sponsored)|(?:we|employer) (?:will )?(?:apply|arrange|pay) for your (?:work|employment|single) permit)\b/i
  const match = text.match(no) || text.match(yes)
  if (!match) return {level:'unknown',reasons:[],evidence:null,source:null}
  const level=no.test(text)?'unlikely':'explicit'
  const at=match.index||0
  const evidence=text.slice(Math.max(0,text.lastIndexOf('.',at)+1),Math.min(text.length,(text.indexOf('.',at+match[0].length)<0?text.length:text.indexOf('.',at+match[0].length)+1))).trim()
  return {level,reasons:[evidence],evidence,source:url}
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

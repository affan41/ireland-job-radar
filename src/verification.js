import {load} from 'cheerio'
import {getPublicPage} from './sources/public-page.js'
import {canonicalJobUrl,employerJobKey} from './job-evidence.js'

const tidy=s=>String(s||'').replace(/\s+/g,' ').trim()
export function dateValue(value) {
  if(!value)return null
  const s=String(value).trim(), uk=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if(uk)return `${uk[3].length===2?'20':''}${uk[3]}-${uk[2].padStart(2,'0')}-${uk[1].padStart(2,'0')}`
  const d=new Date(s);return Number.isNaN(+d)?null:/^\d{4}-\d\d-\d\d$/.test(s)?s:d.toISOString()
}
export function parseAdvert(html,url) {
  const $=load(html), schemas=[]
  const collect=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(collect);if([o['@type']].flat().includes('JobPosting'))schemas.push(o);if(o['@graph'])collect(o['@graph'])}
  $('script[type="application/ld+json"]').each((i,e)=>{try{collect(JSON.parse($(e).text()))}catch{}})
  const ld=schemas[0]||{}
  $('script,style,noscript,nav,footer').remove()
  $('br').replaceWith('\n');$('p,li,div,h1,h2,h3').append('\n')
  const text=$('body').text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim()
  const title=tidy(ld.title)||tidy($('h1').last().text())
  const fields={}
  $('.job_details_table .row').each((i,e)=>{const parts=$(e).children().map((i,c)=>tidy($(c).text())).get();if(parts.length>=2)fields[parts[0].replace(/:$/,'').toLowerCase()]=parts.slice(1).join(' ')})
  const place=[ld.jobLocation].flat().filter(Boolean)[0]||{}, address=place.address||{}
  const country=typeof address.addressCountry==='object'?address.addressCountry.name:address.addressCountry
  const location=[address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode,country].filter(Boolean).join(', ')||fields.location||''
  const detail=load(ld.description||'');detail('br').replaceWith('\n');detail('p,li,div').append('\n')
  const description=ld.description ? detail('body').text() : ($('.job-advert-content').text()||text)
  const closingAt=dateValue(ld.validThrough||fields['closing date'])
  const apply=$('a[href]').filter((i,e)=>/^(?:apply|apply now|apply for this job|apply for this role)\b/i.test(tidy($(e).text()))).first().attr('href')
  let applicationUrl=null
  try{if(apply)applicationUrl=new URL(apply,url).href}catch{}
  // Sally's public careers page loads this read-only login fragment, using the
  // job ID in #applySection. No application or account is created by this GET.
  const sallyId=$('#applySection[data-job-id]').attr('data-job-id')
  if(new URL(url).hostname==='careers.sallyeurope.com' && /^\d+$/.test(sallyId||'')) applicationUrl=`https://careers.sallyeurope.com/ApplyProcess/ApplyForJob?jobId=${sallyId}`
  // Old Quarter applications are an embedded CV form, never submitted here.
  const inlineForm=$('form input[type="file"]').length>0
  if(inlineForm)applicationUrl=url
  const closed=/\b(?:this (?:job|vacancy|position|advert) (?:is |has (?:now )?been )?(?:now )?(?:closed|expired|filled)|no longer accepting applications|job (?:not found|has expired)|vacancy (?:not found|has expired))\b/i.test(text)
  return {title,description,locationRaw:location,company:ld.hiringOrganization?.name,
    postedAt:dateValue(ld.datePosted),closingAt,metadata:[ld.employmentType,fields['contract type'],fields['working hours']].flat().filter(Boolean).join(' '),
    employmentType:/full[_ -]?time/i.test(ld.employmentType||fields['contract type']||'')?'full_time':/part[_ -]?time/i.test(ld.employmentType||fields['contract type']||'')?'part_time':undefined,
    applicationUrl,inlineForm,closed,text,hasAdvert:Boolean((ld.title&&ld.description)||($('.job-advert-content').length&&title)||(/theoldquartergroup\.ie/.test(url)&&title&&/Employment type:/i.test(text))),
    latitude:address.streetAddress?Number(place.geo?.latitude)||null:null,longitude:address.streetAddress?Number(place.geo?.longitude)||null:null,
    locationPrecision:address.streetAddress?'workplace':null,
    employerJobId:String(ld.identifier?.value||employerJobKey(url)||''),
  }
}

export async function verifyAdvert(raw,{request=getPublicPage,now=new Date(),page}={}) {
  const checkedAt=now.toISOString()
  const fallback={...raw,checkedAt,verificationStatus:'unverified',verificationReason:'Advert or application destination could not be confirmed'}
  try {
    const advert=page||await request(raw.url)
    if([404,410].includes(advert.status))return {...fallback,verificationStatus:'closed',verifiedAt:checkedAt,verificationReason:`Advert returned HTTP ${advert.status}`}
    const p=parseAdvert(advert.html,advert.url)
    const closingAt=p.closingAt||raw.closingAt
    if(p.closed || (closingAt && String(closingAt).slice(0,10)<now.toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'}))) return {...fallback,closingAt,verifiedAt:checkedAt,verificationStatus:'closed',verificationReason:p.closed?'Advert explicitly closed':'Advert closing date has passed'}
    // A generic redirect to the careers index is not the original advert.
    if(!p.hasAdvert || !/[\p{L}]/u.test(p.title))return {...fallback,verificationReason:'No identifiable advert at destination'}
    const enriched={...fallback,...p,title:p.title,url:advert.url,description:p.description,closingAt,postedAt:p.postedAt||raw.postedAt,
      company:p.company||raw.company,locationRaw:p.locationRaw||raw.locationRaw,employmentType:p.employmentType||raw.employmentType,
      employerJobId:p.employerJobId||raw.employerJobId}
    delete enriched.text;delete enriched.hasAdvert;delete enriched.closed;delete enriched.inlineForm
    if(!p.applicationUrl)return {...enriched,verificationReason:'Advert found; application destination needs a manual check'}
    if(!p.inlineForm && canonicalJobUrl(p.applicationUrl)===canonicalJobUrl(advert.url)) return {...enriched,verificationReason:'Apply link did not expose an application entry point'}
    if(!p.inlineForm && canonicalJobUrl(p.applicationUrl)!==canonicalJobUrl(advert.url)) {
      const destination=await request(p.applicationUrl),target=parseAdvert(destination.html,destination.url)
      if([404,410].includes(destination.status)||target.closed)return {...enriched,verifiedAt:checkedAt,verificationStatus:'closed',verificationReason:'Application destination closed or removed'}
      const jobId=new URL(advert.url).searchParams.get('record')||new URL(advert.url).pathname.match(/\/(\d+)(?:\/|$)/)?.[1]
      const sameJobId=jobId && (`${destination.url} ${destination.html}`).includes(jobId)
      const loginForJob=/log ?in|sign ?in|register|enter your email/i.test(target.text)&&sameJobId
      if(!(target.inlineForm&&sameJobId) && !(target.hasAdvert&&target.title===p.title) && !loginForJob) return {...enriched,verificationReason:'Application destination did not confirm this vacancy'}
    }
    return {...enriched,verificationStatus:'open',verifiedAt:checkedAt,verificationReason:'Advert and application destination checked'}
  } catch(e) {return {...fallback,verificationReason:e.message}}
}

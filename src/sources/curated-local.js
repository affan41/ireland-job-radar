import {getPublicPage} from './public-page.js'
import {parseAdvert,verifyAdvert} from '../verification.js'

// Specific official leads supplied and checked during the coverage review.
// Recheck these exact vacancies rather than inventing additional source URLs.
export const LOCAL_ADVERTS=[
  ['Sally Beauty','https://careers.sallyeurope.com/job/sales-assistant-part-time-15-hours-per-week-6-month-ftc/3950'],
  ['Maldron Hotel Limerick','https://careers.dalatahotelgroup.com/kitchen-porter-312140.htm'],
  ['OCS','https://jobs.ocs.com/vacancies/66729/cleaner.html'],
  ['Costa Coffee','https://www.rezoomo.com/job/104901/','City East Retail Park, Limerick, Ireland'],
  ['Mint Velvet / Brown Thomas','https://lde.tbe.taleo.net/lde02/ats/careers/v2/viewRequisition?cws=74&org=ARNOTTS&rid=7912'],
  ['Brown Thomas','https://lde.tbe.taleo.net/lde02/ats/careers/v2/viewRequisition?cws=55&org=ARNOTTS&rid=7847'],
  ['Clayton Hotel Limerick','https://careers.dalatahotelgroup.com/accommodation-assistant-311104.htm'],
  ['Lovisa','https://careers.lovisa.com/jobs/8449899-team-member-part-time-festive-season'],
]
export async function fetchCuratedLocal({request=getPublicPage}={}) {
  const jobs=[],errors=[]
  for(const [company,url,location] of LOCAL_ADVERTS){
    try {
      const page=await request(url),p=parseAdvert(page.html,page.url)
      if(page.status!==200||!p.hasAdvert){errors.push(`${company}: no current advert (${page.status})`);continue}
      const raw={...p,url:page.url,company:p.company||company,locationRaw:p.locationRaw||location,
        country:'ie',source:'employer',sourceDetail:`${company} Careers`}
      jobs.push(await verifyAdvert(raw,{page,request}))
    }catch(e){errors.push(`${company}: ${e.message}`)}
  }
  return {jobs,errors}
}

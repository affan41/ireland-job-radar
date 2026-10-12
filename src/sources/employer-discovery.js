import {load} from 'cheerio'
import {getPublicPage} from './public-page.js'
import {isIrishLocation} from '../regions.js'
import {parseAdvert,verifyAdvert} from '../verification.js'
const ROOTS={dalata:'https://careers.dalatahotelgroup.com',brownthomas:'https://lde.tbe.taleo.net',ocs:'https://jobs.ocs.com'}
export function employerLinks(html,url,provider){
 const $=load(html),jobs=new Set(),pages=new Set(),origin=new URL(url).origin
 $('a[href]').each((i,e)=>{let u;try{u=new URL($(e).attr('href'),url)}catch{return};if(u.origin!==origin)return
  if(provider==='dalata'&&/^\/[^/]+-\d+\.htm$/.test(u.pathname))jobs.add(u.href)
  if(provider==='brownthomas'&&u.pathname.endsWith('/viewRequisition')&&u.searchParams.has('rid'))jobs.add(u.href)
  if(provider==='brownthomas'&&u.pathname.endsWith('/searchResults')&&u.searchParams.has('rowFrom'))pages.add(u.href)
  if(provider==='ocs'&&/^\/vacancies\/\d+\/[^/]+\.html$/.test(u.pathname))jobs.add(u.href)
 });return {jobs:[...jobs],pages:[...pages]}
}
export async function fetchEmployerDiscovery({request=getPublicPage,onProgress,maxPages=20}={}){
 const jobs=[],errors=[]
 for(const [provider,start] of [['dalata',`${ROOTS.dalata}/jobs.aspx?s=1&q=Limerick&cc=GB&r=20`],['brownthomas',`${ROOTS.brownthomas}/lde02/ats/careers/v2/searchResults?org=ARNOTTS&cws=55`]]){
  try {
   const cookieJar=new Map(),read=url=>request(url,{cookieJar})
   const urls=new Set(),seen=new Set(),queue=[start];let first=await read(start)
   while(queue.length&&seen.size<maxPages){const url=queue.shift(),key=new URL(url).searchParams.get('rowFrom')||'0';if(seen.has(key))continue;seen.add(key);const p=url===start?first:await read(url);if(p.status!==200)throw Error(`Search HTTP ${p.status}`);const links=employerLinks(p.html,p.url,provider);links.jobs.forEach(u=>urls.add(u));links.pages.forEach(u=>{if(!seen.has(new URL(u).searchParams.get('rowFrom')||'0'))queue.push(u)})}
   if(queue.some(u=>!seen.has(new URL(u).searchParams.get('rowFrom')||'0')))errors.push(`${provider}: discovery capped at ${maxPages} pages`)
   let cursor=0;const list=[...urls];async function worker(){while(cursor<list.length){const url=list[cursor++];try{const page=await request(url),p=parseAdvert(page.html,page.url);if(page.status!==200||!p.hasAdvert||!isIrishLocation(p.locationRaw))continue;const raw={...p,url:page.url,country:'ie',source:'employer',company:p.company||provider,sourceDetail:`${provider} Careers`};jobs.push(await verifyAdvert(raw,{page,request}))}catch(e){errors.push(`${provider} ${url}: ${e.message}`)}}}
   await Promise.all([worker(),worker(),worker()]);onProgress?.(`${provider}: discovered ${list.length} adverts`)
  }catch(e){errors.push(`${provider}: ${e.message}`)}
 }
 return {jobs,errors}
}

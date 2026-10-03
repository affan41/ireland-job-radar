import {load} from 'cheerio'
import {getPublicPage} from './public-page.js'
import {parseAdvert,verifyAdvert} from '../verification.js'
import {isIrishLocation} from '../regions.js'
const ROOTS={sodexo:'https://community.sodexojobs.co.uk',sally:'https://careers.sallyeurope.com',sbfm:'https://careers.sb-fm.co.uk'}
const NAMES={sodexo:'Sodexo',sally:'Sally Europe',sbfm:'SBFM'}
export function discoveryLinks(html,url,provider) {
  const $=load(html),jobs=new Set(),pages=new Set()
  $('a[href]').each((i,e)=>{
    let u;try{u=new URL($(e).attr('href'),url)}catch{return}
    if(u.origin!==new URL(url).origin)return
    if(provider==='sodexo'&&u.pathname.endsWith('/job/detail.php')&&u.searchParams.has('record'))jobs.add(u.href)
    if(provider==='sally'&&/^\/job\/[^/]+\/\d+/.test(u.pathname))jobs.add(u.href)
    if(provider==='sodexo'&&u.pathname==='/v2/job/search'&&u.searchParams.get('location_country')==='106'&&u.searchParams.has('page'))pages.add(u.href)
    if(provider==='sally'&&/^\/jobs\/\d+$/.test(u.pathname))pages.add(u.href)
  })
  return {jobs:[...jobs],pages:[...pages]}
}
export async function fetchPriorityEmployers({providers=['sodexo','sally','sbfm'],request=getPublicPage,onProgress,maxPages=15,maxDetails=500}={}) {
  const jobs=[],errors=[]
  for(const provider of providers){
    try {
      const root=ROOTS[provider];if(!root)throw new Error('Unknown employer')
      const urls=new Set()
      if(provider==='sbfm'){
        // Public sitemap advertised in robots.txt. Read individual adverts; the
        // sitemap's lastmod date is never used as a posting date or open status.
        const p=await request(`${root}/live-jobs.xml`),$=load(p.html,{xmlMode:true})
        $('loc').each((i,e)=>{const u=$(e).text();if(u.startsWith(`${root}/vacancies/`))urls.add(u)})
      }else{
        const queue=[`${root}${provider==='sodexo'?'/v2/job/search?location_country=106':'/jobs'}`],seen=new Set()
        while(queue.length&&seen.size<maxPages){const url=queue.shift();if(seen.has(url))continue;seen.add(url);const p=await request(url);if(p.status!==200)throw new Error(`Search HTTP ${p.status}`);const links=discoveryLinks(p.html,p.url,provider);links.jobs.forEach(u=>urls.add(u));links.pages.forEach(u=>{if(!seen.has(u))queue.push(u)})}
        if(queue.some(u=>!seen.has(u)))errors.push(`${NAMES[provider]} discovery capped at ${maxPages} pages`)
      }
      if(!urls.size)throw new Error('No advert links in public search/feed')
      if(urls.size>maxDetails)errors.push(`${NAMES[provider]} capped at ${maxDetails}/${urls.size} adverts`)
      let cursor=0,accepted=0;const list=[...urls].slice(0,maxDetails)
      const worker=async()=>{while(cursor<list.length){const url=list[cursor++];if(cursor%25===0)onProgress?.(`${NAMES[provider]}: reading advert ${cursor}/${list.length}`);try{const page=await request(url),p=parseAdvert(page.html,page.url)
        const irish=isIrishLocation(p.locationRaw,{includeNorthernIreland:false})||(/\bROI\b/.test(p.locationRaw))
        if(provider!=='sodexo'&&!irish)continue
        if(!p.title||!p.hasAdvert)continue
        const raw={...p,url,country:'ie',source:'employer',sourceDetail:`${NAMES[provider]} Careers`,company:p.company||NAMES[provider],locationRaw:p.locationRaw||'Ireland'}
        jobs.push(await verifyAdvert(raw,{request,page}));accepted++
      }catch(e){errors.push(`${NAMES[provider]} ${url}: ${e.message}`)}finally{await new Promise(r=>setTimeout(r,180))}}}
      await Promise.all([worker(),worker()]);onProgress?.(`${NAMES[provider]}: ${accepted} Irish adverts; ${list.length} detail pages checked`)
    }catch(e){errors.push(`${NAMES[provider]}: ${e.message}`)}
  }
  return {jobs,errors}
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {mapRecruiteeJob} from '../src/sources/recruitee.js'
import {parseLocalVacancy, fetchLocalSites} from '../src/sources/local-sites.js'
import {parseJobAlert, fetchJobAlert} from '../src/sources/jobalert.js'
import {buildJob} from '../src/normalise.js'

const spar={title:'Deli Assistant - Part Time - Limerick',status:'published',country_code:'IE',country:'Ireland',location:'Limerick, Ireland',slug:'deli-assistant',employment_type_code:'parttime_permanent',description:'Join our store',max_hours:40,min_hours:4,published_at:'2026-09-18 12:13:24 UTC'}
test('Recruitee keeps source employment type, location and real posting date',()=>{
 const raw=mapRecruiteeJob(spar,{slug:'sparcareers',name:'SPAR'});const j=buildJob(raw,'now')
 assert.equal(j.employmentType,'part_time');assert.equal(j.regionKey,'limerick');assert.ok(j.groups.includes('student'))
 assert.equal(j.postedAt,'2026-09-18T12:13:24.000Z');assert.equal(j.url,'https://sparcareers.recruitee.com/o/deli-assistant')
})
test('Recruitee excludes closed, unpublished and foreign jobs',()=>{
 const c={slug:'sparcareers',name:'SPAR'}
 assert.equal(mapRecruiteeJob({...spar,status:'draft'},c),null)
 assert.equal(mapRecruiteeJob({...spar,close_at:'2020-01-01'},c),null)
 assert.equal(mapRecruiteeJob({...spar,country_code:'GB',location:'London'},c),null)
})
const localHtml='<meta property="og:description" content="Hotel Night Porter. Location: Limerick. Employment type: Part Time. Reception support."><h1>Careers</h1><h1>Hotel Night Porter</h1><p><strong>Location:</strong>Little Ellen Street, Limerick</p>'
test('independent employer page keeps part-time evidence without inventing a posting date',()=>{
 const raw=parseLocalVacancy(localHtml,'https://theoldquartergroup.ie/apply-now/toq-night-porter/')
 assert.equal(raw.title,'Hotel Night Porter');assert.equal(raw.postedAt,null)
 const j=buildJob(raw,'now');assert.equal(j.employmentType,'part_time');assert.ok(j.score>=10)
 assert.equal(parseLocalVacancy('<h1>Send us your CV</h1>','https://example.test'),null)
})
const advert={status:'OPEN',isOpen:true,slug:'assistant-example',title:'Sports Advisor',company:{name:'Example'},jobTypes:[{name:'Part-time'}],address:{countryCode:'ie',formatted:'Limerick'},description:'Help customers in our store',postedAt:'2026-09-18'}
const page=(rows,count=rows.length)=>`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{initialReduxState:{entities:{jobs:{data:rows,count,pageSize:1}}}}}})}</script>`
test('JobAlert retains open jobs and rejects expired search-engine results',()=>{
 const r=parseJobAlert(page([advert,{...advert,status:'EXPIRED',isOpen:false}]))
 assert.equal(r.jobs.length,1);assert.equal(buildJob(r.jobs[0],'now').employmentType,'part_time')
 assert.throws(()=>parseJobAlert('<h1>Site unavailable</h1>'),/data missing/)
})
test('mixed JobAlert hours and nationwide adverts do not become local part-time jobs',()=>{
 const mixed=parseJobAlert(page([{...advert,jobTypes:[{name:'Full-time'},{name:'Part-time'}]}])).jobs[0]
 assert.equal(buildJob(mixed,'now').employmentType,'full_time')
 const nationwide=parseJobAlert(page([{...advert,address:{countryCode:'ie',formatted:'Nationwide'}}])).jobs[0]
 assert.notEqual(buildJob(nationwide,'now').regionKey,'limerick')
})
test('JobAlert traverses zero-based pages and deduplicates promoted results',async()=>{
 const calls=[];const request=async url=>{calls.push(url);return page([advert],2)}
 const r=await fetchJobAlert({request});assert.equal(r.jobs.length,1);assert.equal(calls.length,2)
 assert.match(calls[0],/page=0$/);assert.match(calls[1],/page=1$/)
})

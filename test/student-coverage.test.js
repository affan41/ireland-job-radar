import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAdvert,verifyAdvert} from '../src/verification.js'
import {buildJob} from '../src/normalise.js'
import {detectEmploymentType} from '../src/employment.js'
import {employerJobKey} from '../src/job-evidence.js'
import {mapOccupopJob} from '../src/sources/student-employers.js'
import {employerLinks} from '../src/sources/employer-discovery.js'
import {createStore,parseFilters} from '../site/static-core.js'
import {VIEWS} from '../src/views.js'

const ritualUrl='https://careers.rituals.com/en-IE/jobs/christmas-sales-advisor/R9482/'
const component=j=>`<!--${JSON.stringify({props:{job:j}})}-->`
const schema=(extra={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:'Christmas Sales Advisor',description:'Serve customers.',jobLocation:{address:{addressLocality:'Limerick',addressCountry:'IE'}},...extra})}</script>`

test('Rituals uses matched requisition hours and recognises its real application form without a file input',async()=>{
 const html=schema()+component({refNumber:'R9483',hoursPerWeek:{min:40,max:40}})+component({refNumber:'R9482',hoursPerWeek:{min:8,max:8}})+'<a href="#form">Apply now</a><div id="form"><form><input type="email"><input type="text"><input type="text"><button>Next step</button></form></div>'
 const p=parseAdvert(html,ritualUrl),j=buildJob({...p,url:ritualUrl},'2026-10-12')
 assert.equal(j.hoursMax,8);assert.equal(j.hoursMin,8);assert.equal(p.inlineForm,true)
 const checked=await verifyAdvert({...p,url:ritualUrl},{page:{url:ritualUrl,status:200,html}})
 assert.equal(checked.verificationStatus,'open')
 assert.equal(parseAdvert(html.replace('R9482','R9999'),ritualUrl).inlineForm,false)
})

test('conflicting Rituals title and structured hours remain visible and source metadata survives normalisation',()=>{
 const u=ritualUrl.replace('R9482','R28302'),h=schema({title:'Christmas Sales Advsior Brown Thomas Limerick 7.5 hours'})+component({refNumber:'R28302',hoursPerWeek:{min:0,max:16}})
 const p=parseAdvert(h,u),j=buildJob({...p,url:u},'now')
 assert.equal(j.hoursMax,16);assert.equal(j.hoursMin,0);assert.match(j.sourceMetadata,/0-16/);assert.ok(j.conflicts.length)
 assert.ok(j.score>=10);assert.match(j.title,/Advsior/)
})

test('a short advertised schedule conflicting with full-time metadata retains a warning; unrelated full-time work stays excluded',()=>{
 const j=buildJob({title:'Kitchen Porter',url:'https://example.test/jobs/1',description:'Kitchen duties',metadata:'Full-time 20 hours per week',employmentType:'full_time'},'now')
 assert.equal(j.employmentType,'part_time');assert.equal(j.hoursMax,20);assert.ok(j.conflicts.length);assert.match(j.sourceMetadata,/Full-time/)
 assert.equal(detectEmploymentType('Full-time Assistant','We offer full-time and part-time positions elsewhere.','full_time'),'full_time')
 assert.equal(detectEmploymentType('Assistant Full & Part-Time','39 hours per week'),'full_time')
})

test('mixed contracts qualify separately and never gain invented weekly hours',()=>{
 const j=buildJob({title:'Deli Assistant - Full & Part-Time',url:'https://sparcareers.recruitee.com/o/example',description:'Serve customers',employmentType:'full_time'},'now')
 assert.equal(j.employmentType,'full_or_part_time');assert.equal(j.hoursMax,null);assert.ok(j.conflicts.length)
})

test('Occupop exposes only public advert fields, including exact contract hours and explicit closure',()=>{
 const raw={uuid:'job-1',title:'Sales Advisor',description:'This is a part time 11-16 hour fixed term position until 31/12/26.',country_short:'IE',city_name:'Limerick',company_name:'Carraig Donn',period:'parttime',status:true,external:true,token:'never-export',file_upload_signed_url:'never-export'}
 const mapped=mapOccupopJob(raw,'https://example.test/job/1'),j=buildJob(mapped,'now')
 assert.equal(j.hoursMin,11);assert.equal(j.hoursMax,16);assert.equal(mapped.verificationStatus,'unverified')
 assert.doesNotMatch(JSON.stringify(mapped),/never-export|file_upload|token/)
 assert.equal(mapOccupopJob({...raw,closed:true},mapped.url).verificationStatus,'closed')
 assert.equal(mapOccupopJob({...raw,status:null,external:null},mapped.url).verificationStatus,'unverified')
 assert.equal(mapOccupopJob({...raw,country_short:'GB'},mapped.url),null)
})

test('older verified open adverts stay visible by default; explicit date and hours filters still apply',()=>{
 assert.equal(VIEWS[0].defaultDays,0)
 const now=Date.parse('2026-10-12T12:00:00Z'),rows=[{id:'old',title:'Advisor',country:'ie',score:10,posted_at:'2026-08-01',verification_status:'open',verified_at:'2026-10-11',views:{'limerick-pt':15},hours_max:8},{id:'mixed',title:'Deli Assistant',country:'ie',score:10,posted_at:'2026-10-10',verification_status:'open',verified_at:'2026-10-11',views:{'limerick-pt':15},employment_type:'full_or_part_time'}]
 const s=createStore({jobs:rows,views:VIEWS,now:()=>now})
 assert.equal(s.query(parseFilters('view=limerick-pt')).total,2)
 assert.equal(s.query(parseFilters('view=limerick-pt&days=7')).total,1)
 assert.equal(s.query(parseFilters('view=limerick-pt&maxHours=20')).total,1)
})

test('employer identity separates requisitions and Taleo tenants',()=>{
 assert.notEqual(employerJobKey(ritualUrl),employerJobKey(ritualUrl.replace('R9482','R9483')))
 assert.notEqual(employerJobKey('https://taleo.test/view?org=FIRST&rid=5'),employerJobKey('https://taleo.test/view?org=SECOND&rid=5'))
 assert.equal(employerJobKey('https://careers.dalatahotelgroup.com/kitchen-porter-312140.htm'),'careers.dalatahotelgroup.com:312140')
})

test('public employer search links paginate and ignore external adverts',()=>{
 const url='https://lde.tbe.taleo.net/lde02/ats/careers/v2/searchResults?org=ARNOTTS&cws=55'
 const r=employerLinks('<a href="viewRequisition?rid=7847&org=ARNOTTS">Role</a><a href="searchResults?rowFrom=10">next</a><a href="https://other.test/viewRequisition?rid=1">Other</a>',url,'brownthomas')
 assert.equal(r.jobs.length,1);assert.equal(r.pages.length,1)
})

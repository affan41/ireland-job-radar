import test from 'node:test'
import assert from 'node:assert/strict'
import {scheduleEvidence,schemeType,canonicalJobUrl} from '../src/job-evidence.js'
import {parseAdvert,verifyAdvert} from '../src/verification.js'
import {careerjetQuery,careerjetAccessIssue} from '../src/sources/careerjet-api.js'
import {robotsAllowed} from '../src/sources/public-page.js'
import {buildJob} from '../src/normalise.js'
const url='https://employer.test/jobs/123/assistant'
const html=(extra={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:'Shop Assistant',description:'Part-time, 12 hours per week. Saturday and Sunday evenings.',datePosted:'2026-10-01',validThrough:'2026-10-20',...extra})}</script><h1>Shop Assistant</h1><a href="/apply/123">Apply now</a>`
const now=new Date('2026-10-04T12:00:00Z')

test('hours and shifts retain their evidence and flag conflicts',()=>{
 const r=scheduleEvidence('Assistant 12 hours','20 hours per week. Saturday and Sunday evenings.','Full_time')
 assert.equal(r.hoursMin,12);assert.equal(r.hoursMax,20);assert.equal(r.hoursEvidence.length,2)
 assert.deepEqual(r.availability,['weekends','evenings']);assert.ok(r.conflicts.length)
 assert.equal(scheduleEvidence('Assistant','Part time. 24 hour GP support.').hoursMax,null)
 assert.ok(scheduleEvidence('Part time Assistant','16 hours/week','Full_time').conflicts.length)
})
test('CE and WPEP schemes are separate, incidental letters are ordinary',()=>{
 assert.equal(schemeType('Cleaner - CE Scheme'), 'ce');assert.equal(schemeType('Office Assistant - WPEP'),'wpep')
 assert.equal(schemeType('Sales assistant','Customer service excellence'), 'ordinary')
})
test('abbreviated employer shifts preserve weekday and weekend requirements',()=>{
 const r=scheduleEvidence('Cleaner','Shift Details: 0730-0900 AM MON TO SAT')
 assert.deepEqual(r.availability,['weekends','weekdays'])
 assert.match(r.shifts[0],/Monday TO Saturday/)
 assert.equal(r.hoursMax,null)
})
test('full descriptions preserve shift lines independently of benefit text',()=>{
 const j=buildJob({title:'Cleaner',url,description:'<p>15 hours per week</p><p>Monday to Friday</p><p>3pm - 7pm Monday to Friday</p><p>Employee benefits package</p>'},'now')
 assert.match(j.fullDescription,/week\nMonday/)
 assert.ok(j.shifts.some(s=>s.includes('3pm - 7pm')))
 assert.deepEqual(scheduleEvidence(j.title,j.fullDescription).shifts,j.shifts)
})
test('Sally application entry retains its vacancy and flags conflicting metadata',async()=>{
 const vacancy='https://careers.sallyeurope.com/job/sales-assistant/3950'
 const page={url:vacancy,status:200,html:html({title:'Sales Assistant part time 15 hours',employmentType:'FULL_TIME'})+'<div id="applySection" data-job-id="3950"></div>'}
 let requested
 const r=await verifyAdvert({url:vacancy},{now,page,request:async u=>{requested=u;return {url:u,status:200,html:'<form><h2>Sign in</h2><input name="jobId" value="3950"></form>'}}})
 assert.equal(requested,'https://careers.sallyeurope.com/ApplyProcess/ApplyForJob?jobId=3950')
 assert.equal(r.verificationStatus,'open')
 assert.ok(buildJob(r,'now').conflicts.length)
})
test('Sodexo labelled fields retain dates and hours',()=>{
 const r=parseAdvert('<h1>Cleaner</h1><div class="job-advert-content">Part time, Monday to Friday.</div><div class="job_details_table"><div class="row"><span>Working Hours:</span><span>15 hours</span></div><div class="row"><span>Closing Date:</span><span>17/10/2026</span></div></div>',url)
 assert.equal(r.closingAt,'2026-10-17')
 assert.equal(scheduleEvidence(r.title,r.description,r.metadata).hoursMax,15)
})
test('a same-page apply anchor without an application form stays unverified',async()=>{
 const r=await verifyAdvert({url},{now,page:{url,status:200,html:html().replace('/apply/123','#apply')}})
 assert.equal(r.verificationStatus,'unverified')
})
test('job identity keeps employer IDs and hash-routed vacancies distinct',()=>{
 assert.notEqual(canonicalJobUrl('https://api.jobsireland.ie/#id=1'),canonicalJobUrl('https://api.jobsireland.ie/#id=2'))
 assert.equal(canonicalJobUrl(url+'?utm_source=a'),url)
})
test('verification requires an advert and a working application destination',async()=>{
 const pages={[url]:{url,status:200,html:html()},'https://employer.test/apply/123':{url:'https://employer.test/apply/123',status:200,html:'<h1>Shop Assistant</h1><form><input type="file"></form>'}}
 const r=await verifyAdvert({url},{now,request:async u=>pages[u]})
 assert.equal(r.verificationStatus,'open');assert.equal(r.postedAt,'2026-10-01');assert.equal(r.closingAt,'2026-10-20');assert.equal(r.verifiedAt,now.toISOString())
 pages['https://employer.test/apply/123'].html='<h1>Vacancies</h1>'
 assert.equal((await verifyAdvert({url},{now,request:async u=>pages[u]})).verificationStatus,'unverified')
})
test('closed adverts and expired deadlines archive; errors are unverified',async()=>{
 for(const page of [{url,status:404,html:''},{url,status:200,html:html({validThrough:'2026-10-03'})},{url,status:200,html:'<h1>This job has expired</h1>'}]){
  assert.equal((await verifyAdvert({url},{now,page})).verificationStatus,'closed')
 }
 const r=await verifyAdvert({url},{now,request:async()=>{throw Error('HTTP 403')}})
 assert.equal(r.verificationStatus,'unverified');assert.equal(r.verifiedAt,undefined);assert.equal(r.checkedAt,now.toISOString())
})
test('numeric titles can be repaired from an identifiable advert',async()=>{
 const r=await verifyAdvert({title:'003218',url},{now,page:{url,status:200,html:html()},request:async()=>({url:'https://employer.test/apply/123',status:200,html:'<form><input type="file"></form>'})})
 assert.equal(r.title,'Shop Assistant');assert.equal(buildJob(r,'now').titleNeedsReview,false)
 assert.equal(buildJob({title:'12345',url},'now').titleNeedsReview,true)
})
test('robots rules respect disallows and specific allows',()=>{
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/file'),false)
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/public'),true)
})
test('Careerjet uses documented authentication and genuine supplied request context',async()=>{
 assert.ok(careerjetAccessIssue({}));assert.ok(careerjetAccessIssue({apiKey:'test'}))
 let called
 await careerjetQuery(new URLSearchParams({keywords:'part time',page_size:'20'}),{apiKey:'test',requestContext:{userIp:'127.0.0.1',userAgent:'Test browser'},request:async(url,options)=>{called={url,options};return {jobs:[]}}})
 const u=new URL(called.url);assert.equal(u.origin,'https://search.api.careerjet.net');assert.equal(u.pathname,'/v4/query');assert.equal(u.searchParams.get('user_ip'),'127.0.0.1');assert.equal(called.options.headers.Authorization,'Basic dGVzdDo=')
})

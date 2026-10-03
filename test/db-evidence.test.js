import test from 'node:test'
import assert from 'node:assert/strict'
process.env.JOBS_DB=':memory:'
const {db,upsertJob,queryJobs,setSaved,setHidden,mergeJobs,effectiveStatus}=await import('../src/db.js')
const {buildJob}=await import('../src/normalise.js')
const now=new Date().toISOString()
const make=(changes={})=>buildJob({title:'Shop Assistant',company:'Example',locationRaw:'Limerick',source:'employer',description:'Part time. 12 hours/week. Saturday and Sunday evenings.',url:'https://example.test/jobs/123',applicationUrl:'https://example.test/apply/123',...changes},now)
const clear=()=>db.exec('DELETE FROM jobs; DELETE FROM saved;DELETE FROM hidden;DELETE FROM job_sources;DELETE FROM job_identity;')
test('URL aliases merge genuine duplicates but preserve different JobsIreland IDs',()=>{
 clear();upsertJob(make());upsertJob(make({title:'Shop Assistant - Limerick',url:'https://other.test/jobs/abc'}))
 assert.equal(queryJobs().total,1)
 upsertJob(make({title:'Job one',url:'https://api.jobsireland.ie/#id=1',applicationUrl:null}));upsertJob(make({title:'Job two',url:'https://api.jobsireland.ie/#id=2',applicationUrl:null}))
 assert.equal(queryJobs().total,3)
})
test('failed checks are unverified, and discovery cannot reopen a closed advert',()=>{
 clear();const closed=make({verificationStatus:'closed',verifiedAt:now,checkedAt:now});upsertJob(closed)
 upsertJob(make())
 assert.equal(queryJobs().total,0);assert.equal(queryJobs({status:'closed'}).total,1)
 upsertJob(make({verificationStatus:'unverified',checkedAt:now,verificationReason:'HTTP 403'}))
 const row=queryJobs({status:'unverified'}).rows[0];assert.equal(row.verified_at,now);assert.equal(row.verification_status,'unverified')
 assert.equal(effectiveStatus({verification_status:'open',verified_at:'2020-01-01'}),'unverified')
})
test('same title and workplace do not merge distinct employer vacancies',()=>{
 clear()
 upsertJob(make({url:'https://api.jobsireland.ie/#id=1',applicationUrl:null}))
 upsertJob(make({url:'https://api.jobsireland.ie/#id=2',applicationUrl:null}))
 upsertJob(make({url:'https://api.jobsireland.ie/#id=2',applicationUrl:null}))
 assert.equal(queryJobs().total,2)
})
test('hours, availability, conflicts and schemes filter stored evidence',()=>{
 clear();upsertJob(make());upsertJob(make({title:'Office Assistant WPEP',url:'https://example.test/jobs/2',applicationUrl:null}));
 upsertJob(make({title:'Shop Assistant - other',description:'Part time. 12-25 hours/week. Monday to Sunday rotating shifts.',url:'https://example.test/jobs/3',applicationUrl:null}))
 assert.equal(queryJobs({maxHours:20,availability:'weekends'}).total,1)
 assert.equal(queryJobs({maxHours:10}).total,0)
 assert.equal(queryJobs({scheme:'schemes'}).total,1)
})
test('merging preserves shortlist notes, hides, and the recoverable original row',()=>{
 clear();const a=make(),b=make({title:'Assistant variation',url:'https://other.test/jobs/456',applicationUrl:null});upsertJob(a);upsertJob(b)
 db.prepare('INSERT INTO saved VALUES (?,?,?)').run(a.id,'first note',now);db.prepare('INSERT INTO saved VALUES (?,?,?)').run(b.id,'second note',now)
 db.prepare('INSERT INTO hidden VALUES (?,?)').run(b.id,now)
 mergeJobs(a.id,b.id)
 assert.match(db.prepare('SELECT note FROM saved WHERE job_id=?').get(a.id).note,/first note\nsecond note/)
 assert.ok(db.prepare('SELECT * FROM hidden WHERE job_id=?').get(a.id));assert.equal(db.prepare('SELECT merged_into FROM jobs WHERE id=?').get(b.id).merged_into,a.id)
})

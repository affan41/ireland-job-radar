import {db,identityAliases,mergeJobs} from '../src/db.js'
import {scheduleEvidence,schemeType,recoveredTitle} from '../src/job-evidence.js'
import {verifyStoredJobs} from '../src/verify-jobs.js'
const apply=process.argv.includes('--apply')
const rows=db.prepare('SELECT * FROM jobs WHERE merged_into IS NULL').all()
const aliases=new Map();let duplicates=0,numeric=0
if(apply)db.exec('BEGIN')
try {
  for(const j of rows){
    const invalid=!/[\p{L}]/u.test(j.title);if(invalid)numeric++
    const repaired=recoveredTitle(j.title,j.full_description||j.description||'')
    if(repaired && apply) db.prepare("UPDATE jobs SET original_title=title,title=?,title_repair_note='Title recovered from stored listing text; live verification still required' WHERE id=?").run(repaired,j.id)
    const schedule=scheduleEvidence(repaired||j.title,j.full_description||j.description||'')
    const scheme=schemeType(j.title,j.full_description||j.description)
    if(apply)db.prepare('UPDATE jobs SET title_needs_review=?, hours_min=?,hours_max=?,hours_evidence=?,shifts=?,availability=?,conflicts=?,scheme=? WHERE id=?').run(invalid&&!repaired?1:0,schedule.hoursMin,schedule.hoursMax,JSON.stringify(schedule.hoursEvidence),JSON.stringify(schedule.shifts),schedule.availability.join(','),JSON.stringify(schedule.conflicts),scheme,j.id)
    for(const alias of identityAliases({url:j.url,applicationUrl:j.application_url,employerJobId:j.employer_job_id,company:j.company})){
      const owner=aliases.get(alias)
      if(owner&&owner!==j.id){duplicates++;if(apply)mergeJobs(owner,j.id);for(const [key,value] of aliases)if(value===j.id)aliases.set(key,owner)}
      else{aliases.set(alias,j.id);if(apply)db.prepare('INSERT OR IGNORE INTO job_identity VALUES (?,?)').run(alias,j.id)}
    }
  }
  if(apply)db.exec('COMMIT')
}catch(e){if(apply)db.exec('ROLLBACK');throw e}
console.log({applied:apply,rows:rows.length,numericTitles:numeric,duplicateAliases:duplicates})
if(apply&&process.argv.includes('--verify')) console.log(await verifyStoredJobs({limit:150,onProgress:console.log}))

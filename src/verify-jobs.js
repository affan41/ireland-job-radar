import {db,upsertJob} from './db.js'
import {buildJob} from './normalise.js'
import {verifyAdvert} from './verification.js'

export function storedRaw(j) {
  return {id:j.id,title:j.title,company:j.company,locationRaw:j.location_raw,country:j.country,
    url:j.url,source:j.source,sourceDetail:j.source_detail,description:j.full_description||j.description,
    postedAt:j.posted_at,closingAt:j.closing_at,workMode:j.work_mode,employmentType:j.employment_type,
    applicationUrl:j.application_url,employerJobId:j.employer_job_id,latitude:j.latitude,longitude:j.longitude,
    locationPrecision:j.location_precision,salaryText:j.salary_text}
}
export async function verifyStoredJobs({limit=150,onProgress,request,ids}={}) {
  const rows=ids?.length ? db.prepare(`SELECT * FROM jobs WHERE id IN (${ids.map(()=>'?').join(',')}) AND merged_into IS NULL`).all(...ids)
    : db.prepare(`SELECT * FROM jobs WHERE merged_into IS NULL AND (checked_at IS NULL OR julianday(checked_at) < julianday('now','-1 day'))
      AND (verification_status!='closed' OR last_seen>checked_at)
      ORDER BY title_needs_review DESC, (region_key='limerick' AND employment_type='part_time') DESC,
      (source='employer') DESC, COALESCE(checked_at,'') ASC, last_seen DESC LIMIT ?`).all(limit)
  const counts={open:0,closed:0,unverified:0}
  let cursor=0,done=0
  const worker=async()=>{while(cursor<rows.length){const old=rows[cursor++],result=await verifyAdvert(storedRaw(old),{request});
    counts[result.verificationStatus]++
    if(result.verificationStatus!=='unverified' || result.description!==old.description){
      const job=buildJob(result,old.last_seen);if(job){job.id=old.id;upsertJob(job)}
    }else db.prepare('UPDATE jobs SET verification_status=?,verification_reason=?,checked_at=? WHERE id=?').run(result.verificationStatus,result.verificationReason,result.checkedAt,old.id)
    done++;if(done%20===0||done===rows.length)onProgress?.(`Checked ${done}/${rows.length} stored adverts`)
  }}
  await Promise.all([worker(),worker()]);return counts
}

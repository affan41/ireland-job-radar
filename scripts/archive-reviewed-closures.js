import {db} from '../src/db.js'
// Exact destinations confirmed closed during the 12 October 2026 review.
// Match only their advert/application/source URLs; titles alone are insufficient.
const closures=[
 ['https://supermacs.ie/job/catering-assistant-c2a6-roxboro/','Advert returned HTTP 404'],
 ['https://careers.rituals.com/en-IE/jobs/christmas-sales-advisor/R28303/','Advert returned HTTP 404'],
 ['https://ie.indeed.com/viewjob?jk=d466719b80404f31','Indeed advert explicitly says expired; checked in browser on 12 October 2026'],
]
let count=0
try {
 for(const [url,reason] of closures){
  const rows=db.prepare(`SELECT DISTINCT j.id FROM jobs j LEFT JOIN job_sources s ON s.job_id=j.id
    WHERE j.url=? OR j.application_url=? OR s.url=?`).all(url,url,url)
  for(const row of rows){db.prepare("UPDATE jobs SET verification_status='closed',verification_reason=?,verified_at='2026-10-12T21:38:00Z',checked_at='2026-10-12T21:38:00Z' WHERE id=? AND (checked_at IS NULL OR checked_at<'2026-10-12T21:38:00Z')").run(reason,row.id);count++}
 }
 console.log(`Archived ${count} exact reviewed closed adverts without changing other records`)
}finally{db.close()}

import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAccaRss } from '../src/sources/acca.js'

const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel>
  <opensearch:totalResults>2</opensearch:totalResults>
  <item>
    <title>Grant Thornton Ireland: Assistant Manager – BPO Global Outsourcing</title>
    <description>
€55,000 - €65,000 per annum:

Grant Thornton Ireland:
Support accurate &amp; timely financial reporting activities.
Cork, Ireland; Dublin, Ireland
    </description>
    <link>https://jobs.accaglobal.com/job/13994236/assistant-manager/?TrackID=9&amp;utm_source=rss</link>
    <pubDate>Tue, 07 Jul 2026 07:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Example UK: Finance Manager</title>
    <description>
Competitive salary:

Example UK:
This role works with teams in Ireland.
London, England
    </description>
    <link>https://jobs.accaglobal.com/job/123/finance-manager/</link>
    <pubDate>Mon, 06 Jul 2026 07:00:00 +0000</pubDate>
  </item>
</channel></rss>`

test('maps ACCA Careers RSS jobs and rejects non-Irish locations', () => {
  const jobs = parseAccaRss(feed)

  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].source, 'acca')
  assert.equal(jobs[0].sourceDetail, 'ACCA Careers')
  assert.equal(jobs[0].company, 'Grant Thornton Ireland')
  assert.equal(jobs[0].title, 'Assistant Manager – BPO Global Outsourcing')
  assert.equal(jobs[0].locationRaw, 'Cork, Ireland; Dublin, Ireland')
  assert.equal(jobs[0].salaryText, '€55,000 - €65,000 per annum')
  assert.equal(jobs[0].description, 'Support accurate & timely financial reporting activities.')
  assert.equal(jobs[0].url, 'https://jobs.accaglobal.com/job/13994236/assistant-manager/')
})

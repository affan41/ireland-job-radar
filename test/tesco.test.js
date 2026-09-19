import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTescoSearch, parseTescoJob, fetchTesco } from '../src/sources/tesco.js'
import { buildJob } from '../src/normalise.js'
const field = (name, value) => `<div><strong>${name}:</strong></div><div class="col-sm-6">${value}</div>`
const detail = (hours = '20', closing = '30/09/2026') => `<article id="job-advert-wrapper"><h1>Customer Assistant - Arthurs Quay</h1>${field('Working Hours', hours)}${field('Contract Details', `${hours} hours`)}${field('Location', 'Tesco Arthurs Quay, Limerick')}${field('Closing Date', closing)}</article>`
const search = (id) => `<div class="tbp-list-item elevation-1"><a class="tbp-li-title tbp-li-overlay" href="/members/modules/job/detail.php?record=${id}">Customer Assistant</a></div>`

test('Tesco search extracts official links and pagination without using closing dates as posted dates', () => {
 const r=parseTescoSearch(search(123)+'<a href="?location_country=106&amp;page=2">2</a>')
 assert.equal(r.pages,2); assert.equal(r.jobs.length,1)
 assert.equal(r.jobs[0].url,'https://apply.tesco-careers.com/members/modules/job/detail.php?record=123')
 assert.equal(r.jobs[0].postedAt,undefined)
})
test('Tesco hours establish a part-time role even without part-time in its title', () => {
 const r=parseTescoJob(detail(),'https://example.test/123',Date.parse('2026-09-19'))
 const j=buildJob(r,'2026-09-19T00:00:00Z')
 assert.equal(j.employmentType,'part_time'); assert.equal(j.regionKey,'limerick')
 assert.ok(j.groups.includes('student')); assert.equal(j.postedAt,null)
})
test('Tesco rejects expired pages and does not turn full-time hours into part-time', () => {
 assert.equal(parseTescoJob(detail('20','01/09/2026'),'https://example.test',Date.parse('2026-09-19')),null)
 assert.equal(parseTescoJob(detail('39'),'https://example.test',Date.parse('2026-09-19')).employmentType,'full_time')
 assert.equal(parseTescoJob('<h1>Job not found</h1>','https://example.test'),null)
})
test('Tesco collector traverses pages, deduplicates links and reads individual hours', async () => {
 const calls=[]
 const request=async url=>{calls.push(url);if(url.includes('page=1')) return search(123)+'<a href="?page=2">2</a>';if(url.includes('page=2'))return search(123)+search(124);return detail('20','30/09/2099')}
 const result=await fetchTesco({request})
 assert.equal(result.jobs.length,2);assert.deepEqual(result.errors,[]);assert.equal(calls.length,4)
})

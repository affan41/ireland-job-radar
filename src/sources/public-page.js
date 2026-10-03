import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
const robots = new Map()
const UA = 'JobRadar/1.0 (personal vacancy reader)'
const privateIP = ip => /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.|::|f[cd]|fe80)/i.test(ip)
async function permittedURL(value) {
  const u = new URL(value)
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || /(^|\.)(localhost|local|internal)$/.test(u.hostname)) throw new Error('Non-public destination')
  const addresses = isIP(u.hostname) ? [{address:u.hostname}] : await lookup(u.hostname,{all:true})
  if (!addresses.length || addresses.some(x=>privateIP(x.address))) throw new Error('Non-public destination')
  if (/(^|\.)(indeed\.[a-z.]+)$/.test(u.hostname)) throw new Error('Indeed is a manual search shortcut; automated access not configured')
  return u
}
export function robotsAllowed(text, pathname) {
  let applies=false;const rules=[]
  for (const line of text.split('\n')) {
    const m=line.replace(/#.*/,'').trim().match(/^(user-agent|allow|disallow):\s*(.*)$/i)
    if (!m) continue
    if (m[1].toLowerCase()==='user-agent') applies=m[2]==='*'||/jobradar/i.test(m[2])
    else if(applies && m[2]) {const pattern=m[2].replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');if(new RegExp(`^${pattern}`).test(pathname))rules.push({allow:m[1].toLowerCase()==='allow',length:m[2].length})}
  }
  return rules.sort((a,b)=>b.length-a.length || Number(b.allow)-Number(a.allow))[0]?.allow ?? true
}
export async function getPublicPage(value) {
  let u=await permittedURL(value)
  for(let hop=0;hop<6;hop++) {
    if(!robots.has(u.origin)) {
      const r=await fetch(`${u.origin}/robots.txt`,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':UA},redirect:'manual'})
      if(r.status!==404 && r.status!==410 && !r.ok) throw new Error(`robots.txt unavailable (${r.status})`)
      robots.set(u.origin,r.ok?await r.text():'')
    }
    if(!robotsAllowed(robots.get(u.origin),u.pathname+u.search))throw new Error('Public-page access disallowed by robots.txt')
    const r=await fetch(u,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':UA,Accept:'text/html,application/xml'},redirect:'manual'})
    if(r.status>=300&&r.status<400&&r.headers.get('location')) {u=await permittedURL(new URL(r.headers.get('location'),u));continue}
    if(!r.ok&&![404,410].includes(r.status))throw new Error(`HTTP ${r.status}`)
    const html=await r.text();if(html.length>5000000)throw new Error('Page too large')
    return {url:u.href,status:r.status,html}
  }
  throw new Error('Too many redirects')
}
